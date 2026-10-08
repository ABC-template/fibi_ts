// ============================================
// api/_lib/tokens.ts
// Утилиты для работы с токенами (внутренними)
// Версия: 2.0.0 — новая модель: bonus first, daily_spend_limit, creator bypass
// ============================================

import { getSupabaseConfig, supabaseRPC } from './supabase-client';

/**
 * Проверить доступность токенов для запроса
 */
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
  reason?: 'no_tokens' | 'insufficient_total' | 'daily_limit' | 'user_not_found';
  needed?: number;
  bypass?: boolean;
}> {
  try {
    const cfg = config || getSupabaseConfig('service');

    const result = await supabaseRPC(
      'check_token_availability',
      {
        p_user_id: userId,
        p_needed: needed,
      },
      cfg
    );

    if (!result || typeof result !== 'object') {
      return {
        available: false,
        bonus: 0,
        permanent: 0,
        total: 0,
        reason: 'no_tokens',
      };
    }

    return {
      available: result.available === true,
      bonus: result.bonus || 0,
      permanent: result.permanent || 0,
      total: result.total || 0,
      spent_today: result.spent_today || 0,
      daily_limit: result.daily_limit || 0,
      reason: result.reason,
      needed: result.needed,
      bypass: result.bypass === true,
    };
  } catch (err) {
    console.error('Failed to check token availability:', err);
    return {
      available: false,
      bonus: 0,
      permanent: 0,
      total: 0,
      reason: 'no_tokens',
    };
  }
}

/**
 * Списать токены (bonus → permanent)
 */
export async function spendAbstractTokens(
  userId: number,
  amount: number,
  config: any = null
): Promise<{
  success: boolean;
  bonusUsed: number;
  permanentUsed: number;
  remainingBonus: number;
  remainingPermanent: number;
  charged?: number;
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
      },
      cfg
    );

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        bonusUsed: 0,
        permanentUsed: 0,
        remainingBonus: 0,
        remainingPermanent: 0,
        error: 'Failed to spend tokens',
      };
    }

    if (result.success === false) {
      return {
        success: false,
        bonusUsed: 0,
        permanentUsed: 0,
        remainingBonus: 0,
        remainingPermanent: 0,
        error: result.error || 'Failed to spend tokens',
      };
    }

    return {
      success: true,
      bonusUsed: result.bonus_used || 0,
      permanentUsed: result.permanent_used || 0,
      remainingBonus: result.remaining_bonus || 0,
      remainingPermanent: result.remaining_permanent || 0,
      charged: result.charged || 0,
      bypass: result.bypass === true,
    };
  } catch (err) {
    console.error('Failed to spend abstract tokens:', err);
    return {
      success: false,
      bonusUsed: 0,
      permanentUsed: 0,
      remainingBonus: 0,
      remainingPermanent: 0,
      error: (err as Error).message,
    };
  }
}

/**
 * Начислить дневной бонус (сброс старого + выдача нового)
 */
export async function addBonusTokens(
  userId: number,
  amount: number,
  config: any = null
): Promise<{
  success: boolean;
  new_bonus?: number;
  added?: number;
  reset_old?: number;
  error?: string;
}> {
  try {
    const cfg = config || getSupabaseConfig('service');

    const result = await supabaseRPC(
      'add_bonus_tokens',
      {
        p_user_id: userId,
        p_amount: amount,
      },
      cfg
    );

    if (!result || typeof result !== 'object') {
      return { success: false, error: 'Invalid response' };
    }

    if (result.success === false) {
      return {
        success: false,
        error: result.error || 'Failed',
        new_bonus: result.bonus,
      };
    }

    return {
      success: true,
      new_bonus: result.new_bonus,
      added: result.added,
      reset_old: result.reset_old,
    };
  } catch (err) {
    console.error('Failed to add bonus tokens:', err);
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}

/**
 * Получить лимиты тарифа пользователя
 */
export async function getUserTierLimits(
  userId: number,
  config: any = null
): Promise<{
  success: boolean;
  tier_key?: string;
  bonus_tokens_per_day?: number;
  permanent_tokens?: number;
  daily_spend_limit?: number;
  bypass?: boolean;
  error?: string;
}> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const result = await supabaseRPC(
      'get_user_tier_limits',
      { p_user_id: userId },
      cfg
    );

    if (!result || typeof result !== 'object') {
      return { success: false, error: 'Invalid response' };
    }

    return result;
  } catch (err) {
    console.error('Failed to get user tier limits:', err);
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}

// Алиас для обратной совместимости
export const spendTokenForRequest = async (userId: number, config: any = null) => {
  return spendAbstractTokens(userId, 1, config);
};
