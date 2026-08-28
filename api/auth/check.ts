// ============================================
// api/auth/check.ts
// Описание: Проверка подписки и авторизации (с JWT)
// Версия: 5.0.0 — выдача токенов по лимитам из БД
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
    // 2. ПОЛУЧАЕМ sync_token
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
      console.log(`✅ [auth/check] sync_token совпадает: ${finalSyncToken?.substring(0, 8)}...`);
    }

    // ==========================================
    // 3. ПОЛУЧАЕМ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
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
        console.log(`✅ Пользователь ${telegramId} найден в БД, роль: ${role}`);
      } else {
        // Создаем пользователя в public.users
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
            })
          },
          config
        );
        dbUser = { role: 'trial', trial_used: false };
        role = 'trial';
        console.log(`✅ Пользователь ${telegramId} создан`);
      }
    } catch (err) {
      console.error('Error checking/creating user:', (err as Error).message);
      dbUser = { role: 'trial', trial_used: false };
      role = 'trial';
    }

    // ==========================================
    // 4. ПОЛУЧАЕМ ЛИМИТЫ ДЛЯ РОЛИ/ПОДПИСКИ
    // ==========================================
    let limits: any = {
      role_key: 'trial',
      role_name: 'Trial',
      bonus_tokens_per_day: 5,
      permanent_tokens_on_subscribe: 0,
      openrouter_limit: 5000,
    };

    try {
      const limitsResult = await supabaseRPC(
        'get_user_limits',
        { p_user_id: telegramId },
        config
      );

      if (limitsResult && typeof limitsResult === 'object') {
        limits = limitsResult;
        console.log(`📊 [auth/check] Лимиты для ${role}:`, limits);
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] Не удалось получить лимиты, используем дефолтные:', err);
    }

    // ==========================================
    // 5. ✅ НАЧИСЛЯЕМ ТОКЕНЫ (если не начислялись сегодня)
    // ==========================================
    const today = new Date().toISOString().slice(0, 10);
    const lastBonusDate = dbUser?.last_bonus_tokens_date || null;

    let bonusAdded = 0;
    let permanentAdded = 0;

    if (lastBonusDate !== today) {
      console.log(`🎁 [auth/check] Начисляем токены пользователю ${telegramId}`);

      // 5.1 Бонусные токены
      if (limits.bonus_tokens_per_day > 0) {
        try {
          const bonusResult = await supabaseRPC(
            'add_bonus_tokens',
            {
              p_user_id: telegramId,
              p_amount: limits.bonus_tokens_per_day,
            },
            config
          );

          if (bonusResult?.success) {
            bonusAdded = limits.bonus_tokens_per_day;
            console.log(`✅ [auth/check] Начислено ${bonusAdded} бонусных токенов`);
          } else {
            console.warn(`⚠️ [auth/check] Не удалось начислить бонусные токены:`, bonusResult);
          }
        } catch (err) {
          console.error('❌ [auth/check] Ошибка начисления бонусных токенов:', err);
        }
      }

      // 5.2 Постоянные токены (если есть подписка с токенами)
      if (limits.permanent_tokens_on_subscribe > 0) {
        try {
          const permanentResult = await supabaseRPC(
            'add_permanent_tokens',
            {
              p_user_id: telegramId,
              p_amount: limits.permanent_tokens_on_subscribe,
              p_source: 'subscription_daily',
            },
            config
          );

          if (permanentResult?.success) {
            permanentAdded = limits.permanent_tokens_on_subscribe;
            console.log(`✅ [auth/check] Начислено ${permanentAdded} постоянных токенов`);
          } else {
            console.warn(`⚠️ [auth/check] Не удалось начислить постоянные токены:`, permanentResult);
          }
        } catch (err) {
          console.error('❌ [auth/check] Ошибка начисления постоянных токенов:', err);
        }
      }

      // 5.3 Обновляем дату последнего начисления
      if (bonusAdded > 0 || permanentAdded > 0) {
        try {
          await supabaseFetch(
            `users?telegram_id=eq.${telegramId}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                last_bonus_tokens_date: today,
                updated_at: new Date().toISOString(),
              }),
            },
            config
          );
          console.log(`✅ [auth/check] Дата последнего начисления обновлена: ${today}`);
        } catch (err) {
          console.error('❌ [auth/check] Ошибка обновления даты:', err);
        }
      }
    } else {
      console.log(`ℹ️ [auth/check] Токены уже начислены сегодня (${today})`);
    }

    // ==========================================
    // 6. ПОЛУЧАЕМ ТЕКУЩИЕ БАЛАНСЫ
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
        console.log(`💰 [auth/check] Текущий баланс токенов: ${tokenBalance.bonus} бонусных, ${tokenBalance.permanent} постоянных`);
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] Не удалось получить баланс токенов:', err);
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
            console.log(`📢 [auth/check] Канал: ${isMember ? 'подписан' : 'не подписан'}`);
          }
        } catch (err) {
          console.error('Error checking channel membership:', (err as Error).message);
        }
      }
    }

    // ==========================================
    // 8. ФОРМИРОВАНИЕ ОТВЕТА
    // ==========================================
    const responseData = {
      isMember: isMember || role !== 'guest',
      role,
      dailyLimit: limits.bonus_tokens_per_day || 5,
      usedToday: 0, // Больше не используется, оставляем для совместимости
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
      // ✅ НОВЫЕ ПОЛЯ ДЛЯ ТОКЕНОВ
      tokens: {
        bonus: tokenBalance.bonus,
        permanent: tokenBalance.permanent,
        total: tokenBalance.bonus + tokenBalance.permanent,
      },
      limits: {
        role_key: limits.role_key,
        role_name: limits.role_name,
        bonus_tokens_per_day: limits.bonus_tokens_per_day,
        permanent_tokens_on_subscribe: limits.permanent_tokens_on_subscribe,
        openrouter_limit: limits.openrouter_limit,
      },
      today_bonus_added: bonusAdded,
      today_permanent_added: permanentAdded,
    };

    return jsonResponse(responseData, 200, {
      'Authorization': `Bearer ${jwtToken}`,
    });
  } catch (err) {
    console.error('Check auth error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
