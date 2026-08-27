// ============================================
// src/economy/EconomyService.ts
// Фасад для работы с экономикой через API
// Версия: 3.0.0 - полностью переписан
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
  balance: number;
  total_earned: number;
  total_spent: number;
  is_locked: boolean;
}

export interface ITransaction {
  id: string;
  amount: number;
  type: string;
  source: string;
  description: string;
  balance_after: number;
  currency: string;
  created_at: string;
}

export interface IHistoryResult {
  success: boolean;
  transactions: ITransaction[];
  total: number;
  limit: number;
  offset: number;
}

export class EconomyService {
  /**
   * Начислить монеты пользователю
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
   * Списать монеты у пользователя
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
   * Получить баланс пользователя
   */
  async getBalance(userId: number): Promise<IBalanceResult> {
    try {
      const result = await apiClient.get('/economy/balance');

      if (result.success) {
        return {
          success: true,
          balance: result.balance || 0,
          total_earned: result.total_earned || 0,
          total_spent: result.total_spent || 0,
          is_locked: result.is_locked || false,
        };
      }

      return {
        success: false,
        balance: 0,
        total_earned: 0,
        total_spent: 0,
        is_locked: false,
      };
    } catch (err) {
      console.error('[EconomyService.getBalance] Error:', err);
      return {
        success: false,
        balance: 0,
        total_earned: 0,
        total_spent: 0,
        is_locked: false,
      };
    }
  }

  /**
   * Получить историю транзакций
   */
  async getHistory(
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<IHistoryResult> {
    try {
      const result = await apiClient.get(
        `/economy/history?limit=${limit}&offset=${offset}`
      );

      if (result.success) {
        return {
          success: true,
          transactions: result.transactions || [],
          total: result.total || 0,
          limit: result.limit || limit,
          offset: result.offset || offset,
        };
      }

      return {
        success: false,
        transactions: [],
        total: 0,
        limit,
        offset,
      };
    } catch (err) {
      console.error('[EconomyService.getHistory] Error:', err);
      return {
        success: false,
        transactions: [],
        total: 0,
        limit,
        offset,
      };
    }
  }

  /**
   * Получить правила (для админки)
   */
  async getRules(limit: number = 50, offset: number = 0): Promise<any> {
    try {
      const result = await apiClient.get(
        `/economy/rules?limit=${limit}&offset=${offset}`
      );

      if (result.success) {
        return result;
      }

      return {
        success: false,
        rules: [],
        total: 0,
      };
    } catch (err) {
      console.error('[EconomyService.getRules] Error:', err);
      return {
        success: false,
        rules: [],
        total: 0,
      };
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

      return {
        success: false,
        logs: [],
        total: 0,
      };
    } catch (err) {
      console.error('[EconomyService.getAudit] Error:', err);
      return {
        success: false,
        logs: [],
        total: 0,
      };
    }
  }

  /**
   * Блокировка/разблокировка пользователя (для админки)
   */
  async toggleUserLock(userId: number, locked: boolean): Promise<boolean> {
    try {
      const result = await apiClient.post('/economy/lock', {
        userId,
        locked,
      });

      return result.success === true;
    } catch (err) {
      console.error('[EconomyService.toggleUserLock] Error:', err);
      return false;
    }
  }

  /**
   * Проверить, заблокирован ли пользователь
   */
  async isUserLocked(userId: number): Promise<boolean> {
    try {
      const result = await this.getBalance(userId);
      return result.is_locked || false;
    } catch (err) {
      console.error('[EconomyService.isUserLocked] Error:', err);
      return false;
    }
  }
}

// Создаём единственный экземпляр
export const economyService = new EconomyService();
