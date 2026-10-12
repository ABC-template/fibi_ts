// ============================================
// api/_lib/tokens.ts 
// Проверка доступности энергии (списание — RPC spend_abstract_tokens в местах использования)
// Версия: 3.0.0 — убраны неиспользуемые spendAbstractTokens, spendTokenForRequest,
//                  addBonusTokens, getUserTierLimits
//          2.0.0 — daily_limit + bypass + bonus first
// ============================================

import { getSupabaseConfig, supabaseRPC } from './supabase-client';

export async function checkTokenAvailability(
  userId: number,
  needed: number = 1,
  config: any = null
): Promise<{
  available: boolean;
  bonus: number;
  permanent: number;
  total: number;
  spent_today?: number;
  daily_limit?: number;
  bypass?: boolean;
  reason?: string;
  needed?: number;
}> {
  try {
    const cfg = config || getSupabaseConfig('service');

    const result = await supabaseRPC(
      'check_token_availability',
      { p_user_id: userId, p_needed: needed },
      cfg
    );

    if (!result || typeof result !== 'object') {
      return {
        available: false,
        bonus: 0,
        permanent: 0,
        total: 0,
        reason: 'no_tokens',
        needed,
      };
    }

    return {
      available: result.available === true || result.bypass === true,
      bonus: result.bonus || 0,
      permanent: result.permanent || 0,
      total: result.total ?? (result.bonus || 0) + (result.permanent || 0),
      spent_today: result.spent_today ?? 0,
      daily_limit: result.daily_limit ?? 0,
      bypass: result.bypass === true,
      reason: result.reason,
      needed: result.needed ?? needed,
    };
  } catch (err) {
    console.error('Failed to check token availability:', err);
    // fail-closed для обычных, но не роняем весь stream неясной ошибкой сети
    return {
      available: false,
      bonus: 0,
      permanent: 0,
      total: 0,
      reason: 'no_tokens',
      needed,
    };
  }
}
