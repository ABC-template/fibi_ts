// ============================================
// src/economy/EconomyService.ts
// Фасад для работы с экономикой через API
// Версия: 4.0.0 - добавлены все методы для совместимости
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
  config: {
    exchange_enabled: boolean;
    exchange_rate: number;
    max_exchange_percent: number;
    bonus_tokens_per_day: number;
    whitelist_enabled: boolean;
  };
}

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
        return {
          success: true,
          coins: {
            balance: result.coins?.balance || 0,
            total_earned: result.coins?.total_earned || 0,
            total_spent: result.coins?.total_spent || 0,
          },
          tokens: {
            bonus: result.tokens?.bonus || 0,
            permanent: result.tokens?.permanent || 0,
          },
          is_locked: result.is_locked || false,
        };
      }

      return {
        success: false,
        coins: { balance: 0, total_earned: 0, total_spent: 0 },
        tokens: { bonus: 0, permanent: 0 },
        is_locked: false,
      };
    } catch (err) {
      console.error('[EconomyService.getFullBalance] Error:', err);
      return {
        success: false,
        coins: { balance: 0, total_earned: 0, total_spent: 0 },
        tokens: { bonus: 0, permanent: 0 },
        is_locked: false,
      };
    }
  }

  /**
   * Начислить монеты (для совместимости с существующим кодом)
   */
  async addCoins(
    userId: number,
    amount: number,
    source: string,
    description: string,
    metadata: Record<string, any> = {}
  ): Promise<ITransactionResult> {
    try {
      const result = await apiClient.post('/economy/earn', {
        userId,
        amount,
        source,
        description,
        metadata,
      });

      if (result.success) {
        return {
          success: true,
          newBalance: result.newBalance || 0,
          transactionId: result.transactionId || null,
          delta: result.delta || amount,
        };
      }

      return {
        success: false,
        newBalance: 0,
        error: result.error || 'Failed to add coins',
      };
    } catch (err) {
      console.error('[EconomyService.addCoins] Error:', err);
      return {
        success: false,
        newBalance: 0,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Списать монеты (для совместимости с существующим кодом)
   */
  async spendCoins(
    userId: number,
    amount: number,
    source: string,
    description: string,
    metadata: Record<string, any> = {}
  ): Promise<ITransactionResult> {
    try {
      const result = await apiClient.post('/economy/spend', {
        userId,
        amount,
        source,
        description,
        metadata,
      });

      if (result.success) {
        return {
          success: true,
          newBalance: result.newBalance || 0,
          transactionId: result.transactionId || null,
          delta: result.delta || -amount,
        };
      }

      return {
        success: false,
        newBalance: 0,
        error: result.error || 'Failed to spend coins',
      };
    } catch (err) {
      console.error('[EconomyService.spendCoins] Error:', err);
      return {
        success: false,
        newBalance: 0,
        error: (err as Error).message,
      };
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

      if (result.success) {
        return {
          success: true,
          config: {
            exchange_enabled: result.config?.exchange_enabled !== false,
            exchange_rate: result.config?.exchange_rate || 1,
            max_exchange_percent: result.config?.max_exchange_percent || 80,
            bonus_tokens_per_day: result.config?.bonus_tokens_per_day || 5,
            whitelist_enabled: result.config?.whitelist_enabled || false,
          },
        };
      }

      return {
        success: true,
        config: {
          exchange_enabled: true,
          exchange_rate: 1,
          max_exchange_percent: 80,
          bonus_tokens_per_day: 5,
          whitelist_enabled: false,
        },
      };
    } catch (err) {
      console.error('[EconomyService.getConfig] Error:', err);
      return {
        success: true,
        config: {
          exchange_enabled: true,
          exchange_rate: 1,
          max_exchange_percent: 80,
          bonus_tokens_per_day: 5,
          whitelist_enabled: false,
        },
      };
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

  /**
   * Блокировка/разблокировка пользователя (для админки)
   */
  async toggleUserLock(userId: number, locked: boolean): Promise<boolean> {
    try {
      const result = await apiClient.post('/economy/lock', { userId, locked });
      return result.success === true;
    } catch (err) {
      console.error('[EconomyService.toggleUserLock] Error:', err);
      return false;
    }
  }
}

export const economyService = new EconomyService();
