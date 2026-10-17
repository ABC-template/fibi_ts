// ============================================
// api/auth/check.ts
// Проверка канала + подписки + дневной бонус
// Версия: 9.4.0 — в ответе нет полей старого лимита запросов (dailyLimit, usedToday)
//          9.3.0 — лимиты тарифа без выдуманных значений: если get_user_tier_limits не
//                  ответил, бонус дня не начисляется (раньше подставлялись 5 ⚡)
//          9.2.0 — лимит частоты (auth_check)
//          9.1.0 — без trial_used (пробного периода больше нет)
//          9.0.0 — доступ (api/_lib/access-gate.ts): подписка на канал проверяется
//                  только если в админке включено «Только для подписчиков», и при
//                  каждом входе заново (результат запоминается в users); Telegram не
//                  ответил — последний известный результат, проверок не было — пропуск.
//                  В ответе access { blocked, blockReason, channelRequired, channelUrl }:
//                  по нему приложение показывает заглушку. Остальное API для
//                  заблокированного / неподписанного закрыто в authenticate()
//          8.0.0 — без Supabase Auth: пользователь создаётся в public.users (getOrCreateUser),
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
import {
  accessDecision,
  getChannelUrl,
  loadAccessState,
  refreshChannelMembership,
} from '../_lib/access-gate';
import { enforceRateLimit } from '../_lib/rate-limit';

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

    const limited = await enforceRateLimit('auth_check', telegramId);
    if (limited) return limited;
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

    // Доступ: блокировка и подписка на канал (свежая проверка при каждом входе)
    const adminById = isAdminTelegramId(telegramId);
    let blocked = false;
    let blockReason: string | null = null;
    let blockExpiresAt: string | null = null;
    let channelRequired = false;
    try {
      const state = await loadAccessState(telegramId, config, false);
      blocked = state.blocked && !adminById;
      blockReason = state.blockReason;
      blockExpiresAt = state.blockExpiresAt;
      let channelMember = state.channelMember;
      if (state.gateEnabled && !blocked && !adminById && !['admin', 'creator'].includes(state.role)) {
        channelMember = await refreshChannelMembership(telegramId, config, state.channelMember);
      }
      // Ключ доступа: без подписки (при включённой галочке) — только заглушка
      const denied = adminById ? null : accessDecision({ ...state, blocked }, channelMember);
      channelRequired = denied?.code === 'channel_required';
    } catch (err) {
      console.warn('⚠️ [auth/check] access state:', err);
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
    // 5. Канал — см. «Доступ» выше (channelRequired)
    // ==========================================
    const isMember = !channelRequired;

    // ==========================================
    // 6. Лимиты из тарифа
    // ==========================================
    // Нет ответа от БД — ничего не начисляем (бонус догонит при следующем входе)
    let limits: any = {
      tier_key: subscriptionTier || 'trial',
      bonus_tokens_per_day: 0,
      permanent_tokens: 0,
      daily_spend_limit: 0,
      bypass: false,
    };

    try {
      const limitsResult = await supabaseRPC(
        'get_user_tier_limits',
        { p_user_id: telegramId },
        config
      );
      if (limitsResult && limitsResult.success === true) {
        limits = {
          tier_key: limitsResult.tier_key || 'trial',
          name: limitsResult.name || null,
          bonus_tokens_per_day: Number(limitsResult.bonus_tokens_per_day) || 0,
          permanent_tokens: Number(limitsResult.permanent_tokens) || 0,
          daily_spend_limit: Number(limitsResult.daily_spend_limit) || 0,
          bypass: limitsResult.bypass === true,
        };
      } else {
        console.warn('⚠️ [auth/check] limits:', limitsResult?.error || 'no result');
      }
    } catch (err) {
      console.warn('⚠️ [auth/check] limits:', err);
    }

    // ==========================================
    // 7. Ежедневный бонус (сброс на значение тарифа)
    // ==========================================
    let bonusAdded = 0;
    if (!blocked && !channelRequired && !limits.bypass && !['admin', 'creator'].includes(role)) {
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
    if (!blocked && !channelRequired) {
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
    // Нет доступа (блок / нет подписки) — синхронизация и Realtime не выдаются
    const syncEnabled = !blocked && !channelRequired && await canUserSync(telegramId, config);
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
        syncEnabled,
        syncToken: finalSyncToken,
        realtime,
        adminPanel: isAdminTelegramId(telegramId),
        blocked,
        access: {
          blocked,
          blockReason,
          blockExpiresAt,
          channelRequired,
          channelUrl: getChannelUrl(),
        },
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
      },
      200
    );
  } catch (err) {
    console.error('Check auth error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
