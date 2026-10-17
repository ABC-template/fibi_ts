// ============================================
// src/economy/EconomyService.ts
// Фасад для работы с экономикой через API
// Версия: 5.4.0 — удалён неиспользуемый toggleUserLock (заморозка монет — /admin/users)
//          5.3.0 — конфиг обмена: exchange_enabled = доступен этому пользователю (сервер),
//                  при ошибке — выключен; без bonus_tokens_per_day / whitelist_enabled
//          5.2.0 — удалён spendCoins (/economy/spend больше нет)
//          5.1.0 — монеты из игр через /economy/game (клиент больше не начисляет монеты сам)
//          5.0.0 — spent_today / daily_limit / bypass - добавлены все методы для совместимости
// ============================================

import { apiClient } from '@/services/api';

export interface ITransactionResult {
  success: boolean;
  newBalance: number;
  transactionId?: string;
  delta?: number;
  error?: string;
}

export interface IBalanceResult {
  success: boolean;
  coins: {
    balance: number;
    total_earned: number;
    total_spent: number;
  };
  tokens: {
    bonus: number;
    permanent: number;
    total?: number;
    spent_today?: number;
    daily_limit?: number;
    bypass?: boolean;
    tier_key?: string;
  };
  is_locked: boolean;
}

export interface IExchangeResult {
  success: boolean;
  coins_spent: number;
  tokens_received: number;
  new_coin_balance: number;
  token_balance_bonus: number;
  token_balance_permanent: number;
  exchange_rate: number;
  error?: string;
}

export interface IConfigResult {
  success: boolean;
  config: IExchangeConfig;
}

/** Обмен монет на энергию для текущего пользователя (GET /economy/config) */
export interface IExchangeConfig {
  /** Обмен доступен этому пользователю (общий флаг + белый список) */
  exchange_enabled: boolean;
  exchange_rate: number;
  max_exchange_percent: number;
  min_exchange_amount: number;
}

const EXCHANGE_OFF: IExchangeConfig = {
  exchange_enabled: false,
  exchange_rate: 0,
  max_exchange_percent: 100,
  min_exchange_amount: 1,
};

export interface IHistoryResult {
  success: boolean;
  transactions: any[];
  total: number;
  limit: number;
  offset: number;
  type: string;
}

export class EconomyService {
  /**
   * Получить полный баланс (коины + токены)
   */
  async getFullBalance(userId: number): Promise<IBalanceResult> {
    try {
      const result = await apiClient.get('/economy/balance');

      if (result.success) {
        const bonus = result.tokens?.bonus || 0;
        const permanent = result.tokens?.permanent || 0;

        return {
          success: true,
          coins: {
            balance: result.coins?.balance || 0,
            total_earned: result.coins?.total_earned || 0,
            total_spent: result.coins?.total_spent || 0,
          },
          tokens: {
            bonus,
            permanent,
            total: result.tokens?.total ?? bonus + permanent,
            spent_today: result.tokens?.spent_today ?? 0,
            daily_limit: result.tokens?.daily_limit ?? 0,
            bypass: result.tokens?.bypass === true,
            tier_key: result.tokens?.tier_key || 'trial',
          },
          is_locked: result.is_locked || false,
        };
      }

      return {
        success: false,
        coins: { balance: 0, total_earned: 0, total_spent: 0 },
        tokens: { bonus: 0, permanent: 0, total: 0, spent_today: 0, daily_limit: 0 },
        is_locked: false,
      };
    } catch (err) {
      console.error('[EconomyService.getFullBalance] Error:', err);
      return {
        success: false,
        coins: { balance: 0, total_earned: 0, total_spent: 0 },
        tokens: { bonus: 0, permanent: 0, total: 0, spent_today: 0, daily_limit: 0 },
        is_locked: false,
      };
    }
  }

  /**
   * Сообщить серверу о событии в игре. Сколько монет начислить (и начислять ли —
   * суточный потолок, одноразовые достижения), решает сервер.
   */
  async awardGameCoins(
    event: string,
    metadata: Record<string, any> = {}
  ): Promise<{ success: boolean; awarded: number; newBalance?: number; reason?: string; error?: string }> {
    try {
      const result = await apiClient.post('/economy/game', { event, metadata });
      return {
        success: result?.success === true,
        awarded: result?.awarded || 0,
        newBalance: result?.newBalance,
        reason: result?.reason,
        error: result?.error,
      };
    } catch (err) {
      console.error('[EconomyService.awardGameCoins] Error:', err);
      return { success: false, awarded: 0, error: (err as Error).message };
    }
  }

  /**
   * Обмен коинов на токены
   */
  async exchangeCoinsToTokens(
    userId: number,
    coinsAmount: number
  ): Promise<IExchangeResult> {
    try {
      const result = await apiClient.post('/economy/exchange', {
        coins_amount: coinsAmount,
      });

      if (result.success) {
        return {
          success: true,
          coins_spent: result.coins_spent || 0,
          tokens_received: result.tokens_received || 0,
          new_coin_balance: result.new_coin_balance || 0,
          token_balance_bonus: result.token_balance_bonus || 0,
          token_balance_permanent: result.token_balance_permanent || 0,
          exchange_rate: result.exchange_rate || 1,
        };
      }

      return {
        success: false,
        coins_spent: 0,
        tokens_received: 0,
        new_coin_balance: 0,
        token_balance_bonus: 0,
        token_balance_permanent: 0,
        exchange_rate: 0,
        error: result.error || 'Exchange failed',
      };
    } catch (err) {
      console.error('[EconomyService.exchangeCoinsToTokens] Error:', err);
      return {
        success: false,
        coins_spent: 0,
        tokens_received: 0,
        new_coin_balance: 0,
        token_balance_bonus: 0,
        token_balance_permanent: 0,
        exchange_rate: 0,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Получить историю транзакций
   */
  async getHistory(
    userId: number,
    type: 'coins' | 'tokens' = 'coins',
    limit: number = 50,
    offset: number = 0
  ): Promise<IHistoryResult> {
    try {
      const result = await apiClient.get(
        `/economy/history?type=${type}&limit=${limit}&offset=${offset}`
      );

      if (result.success) {
        return {
          success: true,
          transactions: result.transactions || [],
          total: result.total || 0,
          limit: result.limit || limit,
          offset: result.offset || offset,
          type: result.type || type,
        };
      }

      return {
        success: false,
        transactions: [],
        total: 0,
        limit,
        offset,
        type,
      };
    } catch (err) {
      console.error('[EconomyService.getHistory] Error:', err);
      return {
        success: false,
        transactions: [],
        total: 0,
        limit,
        offset,
        type,
      };
    }
  }

  /**
   * Получить конфигурацию экономики
   */
  async getConfig(): Promise<IConfigResult> {
    try {
      const result = await apiClient.get('/economy/config');
      const c = result?.success ? result.config : null;
      if (!c) return { success: false, config: EXCHANGE_OFF };
      return {
        success: true,
        config: {
          exchange_enabled: c.exchange_enabled === true,
          exchange_rate: Number(c.exchange_rate) || 0,
          max_exchange_percent: Number(c.max_exchange_percent) || 100,
          min_exchange_amount: Number(c.min_exchange_amount) || 1,
        },
      };
    } catch (err) {
      console.error('[EconomyService.getConfig] Error:', err);
      return { success: false, config: EXCHANGE_OFF };
    }
  }

  /**
   * Получить правила (для админки)
   */
  async getRules(limit: number = 50, offset: number = 0): Promise<any> {
    try {
      const result = await apiClient.get(`/economy/rules?limit=${limit}&offset=${offset}`);
      if (result.success) {
        return result;
      }
      return { success: false, rules: [], total: 0 };
    } catch (err) {
      console.error('[EconomyService.getRules] Error:', err);
      return { success: false, rules: [], total: 0 };
    }
  }

  /**
   * Получить аудит (для админки)
   */
  async getAudit(
    userId: number | null = null,
    eventType: string | null = null,
    limit: number = 100,
    offset: number = 0
  ): Promise<any> {
    try {
      let url = `/economy/audit?limit=${limit}&offset=${offset}`;
      if (userId) url += `&userId=${userId}`;
      if (eventType) url += `&type=${eventType}`;
      const result = await apiClient.get(url);
      if (result.success) {
        return result;
      }
      return { success: false, logs: [], total: 0 };
    } catch (err) {
      console.error('[EconomyService.getAudit] Error:', err);
      return { success: false, logs: [], total: 0 };
    }
  }
}

export const economyService = new EconomyService();
