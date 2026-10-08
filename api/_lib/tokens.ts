// ============================================
// api/_lib/tokens.ts
// Проверка и списание внутренних токенов
// Версия: 2.0.0 — daily_limit + bypass + bonus first
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

export async function spendAbstractTokens(
  userId: number,
  amount: number,
  source: string = 'chat',
  description: string | null = null,
  config: any = null
): Promise<{
  success: boolean;
  bonus_after?: number;
  permanent_after?: number;
  used_bonus?: number;
  used_permanent?: number;
  spent_today?: number;
  bypass?: boolean;
  error?: string;
}> {
  try {
    const cfg = config || getSupabaseConfig('service');

    const result = await supabaseRPC(
      'spend_abstract_tokens',
      {
        p_user_id: userId,
        p_amount: amount,
        p_source: source,
        p_description: description,
      },
      cfg
    );

    if (!result || typeof result !== 'object') {
      return { success: false, error: 'Failed to spend tokens' };
    }

    if (result.success === false) {
      return {
        success: false,
        error: result.error || 'Failed to spend tokens',
        spent_today: result.spent_today,
      };
    }

    return {
      success: true,
      bypass: result.bypass === true,
      bonus_after: result.bonus_after,
      permanent_after: result.permanent_after,
      used_bonus: result.used_bonus,
      used_permanent: result.used_permanent,
      spent_today: result.spent_today,
    };
  } catch (err) {
    console.error('Failed to spend tokens:', err);
    return { success: false, error: (err as Error).message };
  }
}

/** @deprecated используйте spendAbstractTokens */
export async function spendTokenForRequest(
  userId: number,
  config: any = null
) {
  return spendAbstractTokens(userId, 1, 'chat', 'Запрос к агенту', config);
}

export async function addBonusTokens(
  userId: number,
  amount: number,
  config: any = null
): Promise<{ success: boolean; new_bonus?: number; error?: string }> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const result = await supabaseRPC(
      'add_bonus_tokens',
      { p_user_id: userId, p_amount: amount },
      cfg
    );
    if (!result || result.success === false) {
      return { success: false, error: result?.error || 'Failed' };
    }
    return { success: true, new_bonus: result.new_bonus };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getUserTierLimits(
  userId: number,
  config: any = null
): Promise<any> {
  try {
    const cfg = config || getSupabaseConfig('service');
    return await supabaseRPC('get_user_tier_limits', { p_user_id: userId }, cfg);
  } catch (err) {
    console.error('getUserTierLimits:', err);
    return { success: false, error: (err as Error).message };
  }
}
