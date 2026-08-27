// ============================================
// api/_lib/tokens.ts
// Утилиты для работы с токенами (внутренними)
// Версия: 1.0.0
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
  reason?: 'no_bonus_tokens' | 'no_tokens' | 'insufficient_total';
  needed?: number;
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
      available: result.available || false,
      bonus: result.bonus || 0,
      permanent: result.permanent || 0,
      total: result.total || 0,
      reason: result.reason,
      needed: result.needed,
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
 * Списать токен за запрос
 */
export async function spendTokenForRequest(
  userId: number,
  config: any = null
): Promise<{
  success: boolean;
  bonus_after?: number;
  permanent_after?: number;
  used_bonus?: number;
  used_permanent?: number;
  error?: string;
}> {
  try {
    const cfg = config || getSupabaseConfig('service');
    
    const result = await supabaseRPC(
      'spend_token_for_request',
      {
        p_user_id: userId,
      },
      cfg
    );

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        error: 'Failed to spend token',
      };
    }

    if (result.success === false) {
      return {
        success: false,
        error: result.error || 'Failed to spend token',
      };
    }

    return {
      success: true,
      bonus_after: result.bonus_after || 0,
      permanent_after: result.permanent_after || 0,
      used_bonus: result.used_bonus || 0,
      used_permanent: result.used_permanent || 0,
    };
  } catch (err) {
    console.error('Failed to spend token:', err);
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}

/**
 * Добавить бонусные токены (при стрике)
 */
export async function addBonusTokens(
  userId: number,
  amount: number,
  config: any = null
): Promise<{
  success: boolean;
  new_bonus?: number;
  error?: string;
}> {
  try {
    const cfg = config || getSupabaseConfig('service');
    
    // Получаем текущий баланс
    const current = await supabaseRPC(
      'get_user_balances',
      { p_user_id: userId },
      cfg
    );

    if (!current || current.success === false) {
      return { success: false, error: 'User not found' };
    }

    const newBonus = (current.tokens?.bonus || 0) + amount;

    // Обновляем баланс
    await supabaseRPC(
      'add_bonus_tokens',
      {
        p_user_id: userId,
        p_amount: amount,
      },
      cfg
    );

    // Логируем транзакцию
    await supabaseRPC(
      'log_token_transaction',
      {
        p_user_id: userId,
        p_amount: amount,
        p_type: 'bonus',
        p_source: 'daily_bonus',
        p_description: 'Бонусные токены за ежедневный вход',
        p_bonus_after: newBonus,
      },
      cfg
    );

    return {
      success: true,
      new_bonus: newBonus,
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
 * Получить конфигурацию экономики
 */
export async function getEconomyConfig(config: any = null): Promise<any> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const { supabaseFetch } = await import('./supabase-client');
    
    const result = await supabaseFetch(
      'economy_config?limit=1',
      { method: 'GET' },
      cfg
    );

    if (!result || !Array.isArray(result) || result.length === 0) {
      return {
        exchange_enabled: true,
        exchange_rate: 1,
        max_exchange_percent: 80,
        bonus_tokens_per_day: 5,
        daily_token_limit_trial: 5000,
        daily_token_limit_premium: 50000,
        daily_token_limit_admin: 999999,
        whitelist_enabled: false,
      };
    }

    return result[0];
  } catch (err) {
    console.error('Failed to get economy config:', err);
    return {
      exchange_enabled: true,
      exchange_rate: 1,
      max_exchange_percent: 80,
      bonus_tokens_per_day: 5,
      whitelist_enabled: false,
    };
  }
}
