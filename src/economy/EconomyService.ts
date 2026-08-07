// ============================================
// src/economy/EconomyService.ts
// Описание: Работа с БД для экономических операций
// Версия: 1.0.0
// ============================================

import { getSupabaseConfig, supabaseRPC } from '@api/_lib/supabase-client';
import type { ISupabaseConfig } from '@api/_lib/supabase-client';

export interface ITransactionResult {
  success: boolean;
  newBalance: number;
  transactionId?: string;
  error?: string;
}

export class EconomyService {
  private config: ISupabaseConfig;

  constructor() {
    this.config = getSupabaseConfig('service');
  }

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
      const result = await supabaseRPC(
        'add_coins',
        {
          p_user_id: userId,
          p_amount: amount,
          p_source: source,
          p_description: description,
        },
        this.config
      );

      if (!result || typeof result !== 'object') {
        return {
          success: false,
          newBalance: 0,
          error: 'Failed to add coins',
        };
      }

      return {
        success: true,
        newBalance: result.new_balance || 0,
        transactionId: result.transaction_id || null,
      };
    } catch (err) {
      console.error('EconomyService.addCoins error:', err);
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
      const result = await supabaseRPC(
        'spend_coins',
        {
          p_user_id: userId,
          p_amount: amount,
          p_source: source,
          p_description: description,
        },
        this.config
      );

      if (!result || typeof result !== 'object') {
        return {
          success: false,
          newBalance: 0,
          error: 'Failed to spend coins',
        };
      }

      return {
        success: true,
        newBalance: result.new_balance || 0,
        transactionId: result.transaction_id || null,
      };
    } catch (err) {
      console.error('EconomyService.spendCoins error:', err);
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
  async getBalance(userId: number): Promise<number> {
    try {
      const result = await supabaseRPC(
        'get_user_balance',
        { p_user_id: userId },
        this.config
      );
      return result?.balance || 0;
    } catch (err) {
      console.error('EconomyService.getBalance error:', err);
      return 0;
    }
  }

  /**
   * Проверить, заблокирован ли пользователь
   */
  async isUserLocked(userId: number): Promise<boolean> {
    try {
      const { supabaseFetch } = await import('@api/_lib/supabase-client');
      const result = await supabaseFetch(
        `users?telegram_id=eq.${userId}&select=economy_locked`,
        { method: 'GET' },
        this.config
      );
      return result?.[0]?.economy_locked || false;
    } catch (err) {
      console.error('EconomyService.isUserLocked error:', err);
      return false;
    }
  }

  /**
   * Заблокировать/разблокировать пользователя
   */
  async setUserLocked(userId: number, locked: boolean): Promise<boolean> {
    try {
      const { supabaseFetch } = await import('@api/_lib/supabase-client');
      await supabaseFetch(
        `users?telegram_id=eq.${userId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ economy_locked: locked }),
        },
        this.config
      );
      return true;
    } catch (err) {
      console.error('EconomyService.setUserLocked error:', err);
      return false;
    }
  }
}

// Создаем экземпляр для экспорта
export const economyService = new EconomyService();
