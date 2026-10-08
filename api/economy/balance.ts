// ============================================
// api/economy/balance.ts
// Получение балансов (коины + токены + дневной лимит)
// Версия: 3.0.0
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
  supabaseFetch,
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

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    // Балансы
    const result = await supabaseRPC(
      'get_user_balances',
      { p_user_id: userId },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to get balances', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to get balances', 400);
    }

    // Лимиты тарифа + spent_today
    let spentToday = 0;
    let dailyLimit = 0;
    let bypass = false;
    let tierKey = 'trial';

    try {
      const userRes = await supabaseFetch(
        `users?telegram_id=eq.${userId}&select=role,subscription_tier,tokens_spent_today,last_spend_date`,
        { method: 'GET' },
        config
      );

      if (userRes && Array.isArray(userRes) && userRes.length > 0) {
        const u = userRes[0];
        const role = u.role || 'trial';

        if (role === 'admin' || role === 'creator') {
          bypass = true;
        }

        const today = new Date().toISOString().slice(0, 10);
        if (u.last_spend_date === today) {
          spentToday = u.tokens_spent_today || 0;
        }

        const tierRes = await supabaseRPC(
          'get_user_tier_limits',
          { p_user_id: userId },
          config
        );

        if (tierRes && tierRes.success !== false) {
          tierKey = tierRes.tier_key || 'trial';
          dailyLimit = tierRes.daily_spend_limit || 0;
          if (tierRes.bypass) bypass = true;
        }
      }
    } catch (e) {
      console.warn('[economy/balance] limits fetch warning:', e);
    }

    const bonus = result.tokens?.bonus || 0;
    const permanent = result.tokens?.permanent || 0;

    return jsonResponse({
      success: true,
      coins: {
        balance: result.coins?.balance || 0,
        total_earned: result.coins?.total_earned || 0,
        total_spent: result.coins?.total_spent || 0,
      },
      tokens: {
        bonus,
        permanent,
        total: bonus + permanent,
        spent_today: spentToday,
        daily_limit: dailyLimit,
        bypass,
        tier_key: tierKey,
      },
      is_locked: result.is_locked || false,
    });
  } catch (err) {
    console.error('[economy/balance] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
