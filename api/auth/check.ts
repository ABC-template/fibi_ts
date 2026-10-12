// ============================================
// api/auth/check.ts
// Проверка канала + подписки + дневной бонус
// Версия: 7.2.0 — ежедневный вход на сервере (daily_checkin: стрик + монеты) и награда
//                  пригласившему, когда приглашённый вернулся на следующий день
//          7.1.0 — sync_token отдаётся из БД без перегенерации
//          7.0.0 — канал=gate, expiry→trial, tier из subscription_tiers
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  getOrCreateAuthUser,
  getSyncToken,
  updateSyncToken,
  supabaseRPC,
  getVerifiedStartParam,
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
    // 1. Auth user (JWT)
    // ==========================================
    let authResult;
    try {
      authResult = await getOrCreateAuthUser(telegramId, user, config);
    } catch (err) {
      console.error('Ошибка Auth:', err);
      return errorResponse('Ошибка авторизации: ' + (err as Error).message, 500);
    }

    const userId = authResult.userId;
    const userUuid = authResult.userUuid || userId;
    const jwtToken = authResult.jwtToken;
    const isNewUser = authResult.isNew;

    // ==========================================
    // 3. public.users — создать если нет
    // ==========================================
    let dbUser: any = null;
    let role = 'trial';
    let subscriptionTier: string | null = 'trial';
    let premiumUntil: string | null = null;

    try {
      const userRes = await supabaseFetch(
        `users?telegram_id=eq.${telegramId}&select=telegram_id,role,premium_until,username,data_deadline,sync_token,subscription_tier,trial_used,token_balance_bonus,token_balance_permanent,last_bonus_tokens_date,tokens_spent_today,last_spend_date`,
        { method: 'GET' },
        config
      );

      if (userRes && Array.isArray(userRes) && userRes.length > 0) {
        dbUser = userRes[0];
        role = dbUser.role || 'trial';
        subscriptionTier = dbUser.subscription_tier || 'trial';
        premiumUntil = dbUser.premium_until || null;
      } else {
        await supabaseFetch(
          'users',
          {
            method: 'POST',
            body: JSON.stringify({
              id: userId,
              telegram_id: telegramId,
              username: user?.username || null,
              role: 'trial',
              subscription_tier: 'trial',
              user_lang: user?.language_code || 'ru',
              sync_token: crypto.randomUUID(),
              trial_used: false,
            }),
          },
          config
        );
        dbUser = { role: 'trial', subscription_tier: 'trial', trial_used: false };
        role = 'trial';
        subscriptionTier = 'trial';
      }
    } catch (err) {
      console.error('Error user:', (err as Error).message);
      dbUser = { role: 'trial', subscription_tier: 'trial' };
      role = 'trial';
      subscriptionTier = 'trial';
    }

    // ==========================================
    // 3a. Приглашение: ссылка t.me/<бот>?startapp=ref_<код>. start_param берётся
    //     из подписанного initData, запись создаёт БД (только для новых пользователей,
    //     один пригласивший). Награда — позже, когда приглашённый вернётся.
    // ==========================================
    try {
      const startParam = await getVerifiedStartParam(request, telegramId);
      const m = startParam ? /^ref_([0-9a-z]{1,16})$/i.exec(startParam) : null;
      if (m) {
        const referrerId = parseInt(m[1], 36);
        if (Number.isSafeInteger(referrerId) && referrerId > 0 && referrerId !== telegramId) {
          await supabaseRPC(
            'register_referral',
            {
              p_referrer_id: referrerId,
              p_referred_id: telegramId,
              p_referred_username: user?.username || null,
            },
            config
          );
        }
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] referral:', err);
    }

    // ==========================================
    // 3b. sync_token (после создания строки users)
    // ==========================================
    //    Токен меняют только действия с данными (создание/правка/удаление).
    //    Здесь его НЕ перегенерируем: клиент сравнивает свой токен с этим и,
    //    если они разные, делает полную загрузку и сохраняет именно этот токен.
    //    Раньше здесь создавался новый токен, которого не было в БД, — и
    //    полная перезагрузка шла при каждом запуске.
    let finalSyncToken: string | null =
      dbUser?.sync_token || (await getSyncToken(telegramId, config));
    if (!finalSyncToken) {
      // У пользователя ещё нет токена — заводим и сохраняем в БД
      finalSyncToken = await updateSyncToken(telegramId, config);
      console.log(`🔄 [auth/check] sync_token создан`);
    }

    // ==========================================
    // 4. Expiry → trial (платная подписка истекла)
    //    НЕ трогаем admin/creator. Канал здесь не влияет на tier.
    // ==========================================
    if (!['admin', 'creator'].includes(role)) {
      try {
        const exp = await supabaseRPC(
          'expire_subscription_if_needed',
          { p_user_id: telegramId },
          config
        );
        if (exp?.expired) {
          role = 'trial';
          subscriptionTier = 'trial';
          console.log(`⏰ [auth/check] Подписка истекла → trial`);
        } else if (exp?.tier) {
          subscriptionTier = exp.tier;
          role = exp.role || role;
        }
      } catch (e) {
        // fallback без RPC
        if (premiumUntil && new Date(premiumUntil) < new Date()) {
          try {
            await supabaseFetch(
              `users?telegram_id=eq.${telegramId}`,
              {
                method: 'PATCH',
                body: JSON.stringify({
                  role: 'trial',
                  subscription_tier: 'trial',
                  updated_at: new Date().toISOString(),
                }),
              },
              config
            );
            role = 'trial';
            subscriptionTier = 'trial';
          } catch (_) {}
        }
      }
    }

    // ==========================================
    // 5. Канал = GATE (не роль, tier не сбрасываем)
    // ==========================================
    let isMember = true;
    if (!['admin', 'creator'].includes(role)) {
      const channelId = process.env.CHANNEL_ID?.trim();
      const botToken = process.env.BOT_TOKEN?.trim();

      if (channelId && botToken) {
        try {
          const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;
          const response = await fetch(url);
          const data = await response.json();
          if (data.ok) {
            const status = data.result?.status;
            isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);
          } else {
            // при ошибке API не блокируем жёстко (чтобы не ломать вход)
            console.warn('[auth/check] getChatMember not ok:', data);
            isMember = true;
          }
        } catch (err) {
          console.error('Channel check error:', (err as Error).message);
          isMember = true;
        }
      }
    }

    // ==========================================
    // 6. Лимиты из тарифа
    // ==========================================
    let limits: any = {
      tier_key: subscriptionTier || 'trial',
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
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] limits:', err);
    }

    // ==========================================
    // 7. Ежедневный бонус (сброс на значение тарифа)
    // ==========================================
    let bonusAdded = 0;
    if (!limits.bypass && !['admin', 'creator'].includes(role)) {
      const amount = limits.bonus_tokens_per_day || 0;
      if (amount > 0) {
        try {
          const bonusResult = await supabaseRPC(
            'add_bonus_tokens',
            { p_user_id: telegramId, p_amount: amount },
            config
          );
          if (bonusResult?.success) {
            bonusAdded = bonusResult.added || amount;
            console.log(`✅ [auth/check] Бонус: ${bonusAdded}`);
          } else if (bonusResult?.error === 'Already claimed today') {
            console.log(`ℹ️ [auth/check] Бонус уже сегодня`);
          }
        } catch (err) {
          console.error('❌ [auth/check] bonus error:', err);
        }
      }
    }

    // ==========================================
    // 7b. Ежедневный вход (один раз в сутки): стрик + монеты daily_login.
    //     Клиент только показывает результат.
    // ==========================================
    let checkin: any = null;
    try {
      const res = await supabaseRPC('daily_checkin', { p_user_id: telegramId }, config);
      if (res?.success) {
        checkin = {
          claimed: res.claimed === true,
          streak: res.streak || 0,
          base: res.base || 0,
          bonus: res.bonus || 0,
          reward: res.reward || 0,
          coins: res.new_balance ?? null,
        };

        // Приглашённый вернулся на следующий день — награда пригласившему
        // (один раз; reward_referral сама проверяет, что награды ещё не было)
        if (checkin.claimed) {
          await supabaseRPC(
            'reward_referral',
            { p_referred_id: telegramId, p_min_age_hours: 20 },
            config
          ).catch(() => null);
        }
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] daily_checkin:', err);
    }

    // ==========================================
    // 8. Балансы
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
      }
    } catch (err) {
      console.warn('⚠️ balance:', err);
    }

    // ==========================================
    // 9. Ответ
    // ==========================================
    // role для UI: trial / premium (если есть активный платный tier) / admin / creator
    let responseRole = role;
    if (
      !['admin', 'creator'].includes(role) &&
      subscriptionTier &&
      subscriptionTier !== 'trial'
    ) {
      responseRole = role === 'premium' ? 'premium' : role;
    }

    return jsonResponse(
      {
        isMember,
        role: responseRole,
        dailyLimit: limits.bonus_tokens_per_day || 0,
        usedToday: 0,
        syncEnabled: ['admin', 'creator', 'premium'].includes(responseRole),
        syncToken: finalSyncToken,
        userId: telegramId,
        authUserId: userId,
        userUuid,
        jwtToken,
        expiresIn: 3600,
        isNewUser,
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
        checkin,
        subscription_tier: subscriptionTier,
        premium_until: premiumUntil,
        trial_used: dbUser?.trial_used || false,
      },
      200,
      { Authorization: `Bearer ${jwtToken}` }
    );
  } catch (err) {
    console.error('Check auth error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
