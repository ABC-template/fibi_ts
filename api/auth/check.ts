// ============================================
// api/auth/check.ts
// Описание: Проверка подписки и авторизации (с JWT)
// Версия: 6.0.0 — тарифы + daily bonus (сброс) + без ежедневных permanent
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  getOrCreateAuthUser,
  getSyncToken,
  updateSyncToken,
  supabaseRPC,
} from '../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const telegramId = auth.userId!;
    const user = auth.user;
    const config = getSupabaseConfig('service');

    // ==========================================
    // 1. СОЗДАНИЕ/ПОИСК ПОЛЬЗОВАТЕЛЯ
    // ==========================================
    let authResult;
    try {
      authResult = await getOrCreateAuthUser(telegramId, user, config);
    } catch (err) {
      console.error('Ошибка создания/поиска пользователя в Auth:', err);
      return errorResponse('Ошибка авторизации: ' + (err as Error).message, 500);
    }

    const userId = authResult.userId;
    const userUuid = authResult.userUuid || userId;
    const jwtToken = authResult.jwtToken;
    const isNewUser = authResult.isNew;

    // ==========================================
    // 2. SYNC TOKEN
    // ==========================================
    const dbSyncToken = await getSyncToken(telegramId, config);
    const clientSyncToken = request.headers.get('x-sync-token') || null;

    let finalSyncToken: string | null;
    let tokenChanged = false;

    if (clientSyncToken !== dbSyncToken) {
      const newToken = crypto.randomUUID();
      await updateSyncToken(telegramId, config);
      finalSyncToken = newToken;
      tokenChanged = true;
      console.log(`🔄 [auth/check] sync_token обновлен: ${finalSyncToken?.substring(0, 8)}...`);
    } else {
      finalSyncToken = dbSyncToken;
      tokenChanged = false;
    }

    // ==========================================
    // 3. ПОЛЬЗОВАТЕЛЬ В public.users
    // ==========================================
    let dbUser: any = null;
    let role = 'trial';
    let subscriptionTier: string | null = null;
    let premiumUntil: string | null = null;
    let trialUsed = false;

    try {
      const userRes = await supabaseFetch(
        `users?telegram_id=eq.${telegramId}&select=telegram_id,role,premium_until,username,data_deadline,sync_token,subscription_tier,trial_used,token_balance_bonus,token_balance_permanent,last_bonus_tokens_date`,
        { method: 'GET' },
        config
      );

      if (userRes && Array.isArray(userRes) && userRes.length > 0) {
        dbUser = userRes[0];
        role = dbUser.role || 'trial';
        subscriptionTier = dbUser.subscription_tier || null;
        premiumUntil = dbUser.premium_until || null;
        trialUsed = dbUser.trial_used || false;
        console.log(`✅ Пользователь ${telegramId} найден, роль: ${role}`);
      } else {
        console.log(`🆕 Создаём пользователя ${telegramId} в public.users`);
        await supabaseFetch(
          'users',
          {
            method: 'POST',
            body: JSON.stringify({
              id: userId,
              telegram_id: telegramId,
              username: user?.username || null,
              role: 'trial',
              user_lang: user?.language_code || 'ru',
              sync_token: crypto.randomUUID(),
              trial_used: false,
            }),
          },
          config
        );
        dbUser = { role: 'trial', trial_used: false };
        role = 'trial';
      }
    } catch (err) {
      console.error('Error checking/creating user:', (err as Error).message);
      dbUser = { role: 'trial', trial_used: false };
      role = 'trial';
    }

    // ==========================================
    // 4. ЛИМИТЫ ИЗ ТАРИФА
    // ==========================================
    let limits: any = {
      tier_key: 'trial',
      bonus_tokens_per_day: 5,
      permanent_tokens: 0,
      daily_spend_limit: 5,
      bypass: false,
    };

    try {
      const limitsResult = await supabaseRPC(
        'get_user_tier_limits',
        { p_user_id: telegramId },
        config
      );

      if (limitsResult && limitsResult.success !== false) {
        limits = {
          tier_key: limitsResult.tier_key || 'trial',
          name: limitsResult.name || null,
          bonus_tokens_per_day: limitsResult.bonus_tokens_per_day ?? 5,
          permanent_tokens: limitsResult.permanent_tokens ?? 0,
          daily_spend_limit: limitsResult.daily_spend_limit ?? 0,
          bypass: limitsResult.bypass === true,
        };
        console.log(`📊 [auth/check] Лимиты тарифа:`, limits);
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] Не удалось получить лимиты тарифа:', err);
    }

    // ==========================================
    // 5. ЕЖЕДНЕВНЫЙ БОНУС (сброс старого + выдача нового)
    // ==========================================
    let bonusAdded = 0;

    // Creator/Admin — не трогаем бонусы
    if (!limits.bypass && !['admin', 'creator'].includes(role)) {
      const amount = limits.bonus_tokens_per_day || 0;

      if (amount > 0) {
        try {
          const bonusResult = await supabaseRPC(
            'add_bonus_tokens',
            {
              p_user_id: telegramId,
              p_amount: amount,
            },
            config
          );

          if (bonusResult?.success) {
            bonusAdded = bonusResult.added || amount;
            console.log(
              `✅ [auth/check] Бонус: +${bonusAdded} (сброшено старых: ${bonusResult.reset_old || 0})`
            );
          } else if (bonusResult?.error === 'Already claimed today') {
            console.log(`ℹ️ [auth/check] Бонус уже получен сегодня`);
          } else {
            console.warn(`⚠️ [auth/check] Бонус не начислен:`, bonusResult);
          }
        } catch (err) {
          console.error('❌ [auth/check] Ошибка начисления бонуса:', err);
        }
      }
    }

    // ==========================================
    // 6. ТЕКУЩИЕ БАЛАНСЫ
    // ==========================================
    let tokenBalance = { bonus: 0, permanent: 0 };
    try {
      const balanceResult = await supabaseRPC(
        'get_user_balances',
        { p_user_id: telegramId },
        config
      );

      if (balanceResult?.success) {
        tokenBalance = {
          bonus: balanceResult.tokens?.bonus || 0,
          permanent: balanceResult.tokens?.permanent || 0,
        };
        console.log(
          `💰 [auth/check] Баланс: ${tokenBalance.bonus} бонус + ${tokenBalance.permanent} permanent`
        );
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] Не удалось получить баланс:', err);
    }

    // ==========================================
    // 7. ПРОВЕРКА ПОДПИСКИ НА КАНАЛ
    // ==========================================
    let isMember = true;
    if (!['admin', 'creator', 'premium'].includes(role)) {
      const channelId = process.env.CHANNEL_ID?.trim();
      const botToken = process.env.BOT_TOKEN?.trim();

      if (channelId && botToken) {
        try {
          const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;
          const response = await fetch(url);
          const data = await response.json();

          if (data.ok) {
            const status = data.result.status;
            isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
          }
        } catch (err) {
          console.error('Error checking channel membership:', (err as Error).message);
        }
      }
    }

    // ==========================================
    // 8. ОТВЕТ
    // ==========================================
    const responseData = {
      isMember: isMember || role !== 'guest',
      role,
      dailyLimit: limits.bonus_tokens_per_day || 5,
      usedToday: 0,
      syncEnabled: ['admin', 'creator', 'premium'].includes(role),
      syncToken: finalSyncToken,
      userId: telegramId,
      authUserId: userId,
      userUuid: userUuid,
      jwtToken: jwtToken,
      expiresIn: 3600,
      isNewUser: isNewUser,
      dataDeadline: dbUser?.data_deadline || null,
      serverModels: {
        gemini: true,
        deepseek: true,
        gpt: true,
        claude: true,
        grok: true,
      },
      tokens: {
        bonus: tokenBalance.bonus,
        permanent: tokenBalance.permanent,
        total: tokenBalance.bonus + tokenBalance.permanent,
      },
      limits: {
        tier_key: limits.tier_key,
        bonus_tokens_per_day: limits.bonus_tokens_per_day,
        permanent_tokens: limits.permanent_tokens,
        daily_spend_limit: limits.daily_spend_limit,
        bypass: limits.bypass === true,
      },
      today_bonus_added: bonusAdded,
      subscription_tier: subscriptionTier,
      premium_until: premiumUntil,
      trial_used: trialUsed,
    };

    return jsonResponse(responseData, 200, {
      Authorization: `Bearer ${jwtToken}`,
    });
  } catch (err) {
    console.error('Check auth error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
