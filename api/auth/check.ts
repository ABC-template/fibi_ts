// ============================================
// api/auth/check.ts
// Проверка канала + подписки + дневной бонус
// Версия: 8.0.0 — без Supabase Auth: пользователь создаётся в public.users (getOrCreateUser),
//                  JWT/authUserId/пароль больше не выдаются; для синхронизации отдаётся
//                  токен Realtime (realtime: { token, expiresAt }); adminPanel — доступ к
//                  админке по Telegram ID; заблокированным не начисляются бонус и вход дня
//          7.2.0 — ежедневный вход на сервере (daily_checkin: стрик + монеты) и награда
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
  getOrCreateUser,
  updateSyncToken,
  supabaseRPC,
  getVerifiedStartParam,
  canUserSync,
  isAdminTelegramId,
  signRealtimeToken,
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
    // 1. Пользователь (создаётся при первом входе)
    // ==========================================
    let dbUser: any;
    let isNewUser = false;
    try {
      const res = await getOrCreateUser(telegramId, user, config);
      dbUser = res.user;
      isNewUser = res.isNew;
    } catch (err) {
      console.error('❌ [auth/check] user:', (err as Error).message);
      return errorResponse('Ошибка авторизации', 500);
    }

    const userUuid: string = dbUser.id;
    let role: string = dbUser.role || 'trial';
    let subscriptionTier: string | null = dbUser.subscription_tier || 'trial';
    const premiumUntil: string | null = dbUser.premium_until || null;

    // Блокировка: вход разрешён (данные доступны), но бонусы дня не начисляются
    let blocked = false;
    try {
      const r = await supabaseRPC('is_user_blocked', { p_user_id: telegramId }, config);
      blocked = r === true || r === 'true';
    } catch (err) {
      console.warn('⚠️ [auth/check] is_user_blocked:', err);
    }

    // ==========================================
    // 2. Приглашение: ссылка t.me/<бот>?startapp=ref_<код>. start_param берётся
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
    // 3. sync_token
    // ==========================================
    //    Токен меняют только действия с данными (создание/правка/удаление).
    //    Здесь его НЕ перегенерируем: клиент сравнивает свой токен с этим и,
    //    если они разные, делает полную загрузку и сохраняет именно этот токен.
    //    Раньше здесь создавался новый токен, которого не было в БД, — и
    //    полная перезагрузка шла при каждом запуске.
    let finalSyncToken: string | null = dbUser.sync_token || null;
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
    if (!blocked && !limits.bypass && !['admin', 'creator'].includes(role)) {
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
    if (!blocked) {
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
    // 9. Синхронизация и токен Realtime
    //    can_sync — то же правило, что и в API синхронизации (batch, sync-metadata)
    // ==========================================
    const syncEnabled = await canUserSync(telegramId, config);
    let realtime: { token: string; expiresAt: number } | null = null;
    if (syncEnabled) {
      try {
        realtime = await signRealtimeToken(userUuid, telegramId);
      } catch (err) {
        console.error('❌ [auth/check] realtime token:', (err as Error).message);
      }
    }

    // ==========================================
    // 10. Ответ
    // ==========================================
    return jsonResponse(
      {
        isMember,
        role,
        dailyLimit: limits.bonus_tokens_per_day || 0,
        usedToday: 0,
        syncEnabled,
        syncToken: finalSyncToken,
        realtime,
        adminPanel: isAdminTelegramId(telegramId),
        blocked,
        userId: telegramId,
        userUuid,
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
      200
    );
  } catch (err) {
    console.error('Check auth error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
