// ============================================
// src/modules/coins/CoinsAPI.ts
// API-клиент для работы с монетами
// Версия: 1.1.0
// ============================================

import { apiClient } from '@/services/api';
import { coinsStore } from './CoinsStore';
import { userStore } from '@/store/UserStore';

export class CoinsAPI {
  private _getUserId(): number | null {
    return userStore.userId || null;
  }

  async getBalance(): Promise<{ balance: number; total_earned: number; total_spent: number }> {
    try {
      const data = await apiClient.get('/coins/balance');
      if (data.success) {
        return {
          balance: data.balance || 0,
          total_earned: data.total_earned || 0,
          total_spent: data.total_spent || 0,
        };
      }
      return { balance: 0, total_earned: 0, total_spent: 0 };
    } catch (err) {
      console.error('❌ Ошибка получения баланса:', err);
      return { balance: 0, total_earned: 0, total_spent: 0 };
    }
  }

  async sync(): Promise<boolean> {
    try {
      const data = await apiClient.get('/coins/sync');
      if (data.success) {
        coinsStore.syncBalance(data.balance || 0, data.transactions || []);
        return true;
      }
      return false;
    } catch (err) {
      console.error('❌ Ошибка синхронизации монет:', err);
      return false;
    }
  }

  async getHistory(limit: number = 50, offset: number = 0): Promise<any[]> {
    try {
      const data = await apiClient.get(`/coins/history?limit=${limit}&offset=${offset}`);
      if (data.success) {
        return data.transactions || [];
      }
      return [];
    } catch (err) {
      console.error('❌ Ошибка получения истории:', err);
      return [];
    }
  }

  async addCoins(amount: number, source: string, description: string): Promise<boolean> {
    try {
      const data = await apiClient.post('/coins/add', {
        amount,
        source,
        description,
      });

      if (data.success) {
        coinsStore.addCoins(amount, source, description);
        return true;
      }
      return false;
    } catch (err) {
      console.error('❌ Ошибка начисления монет:', err);
      return false;
    }
  }

  async spendCoins(amount: number, source: string, description: string): Promise<boolean> {
    try {
      const data = await apiClient.post('/coins/spend', {
        amount,
        source,
        description,
      });

      if (data.success) {
        coinsStore.spendCoins(amount, source, description);
        return true;
      }
      return false;
    } catch (err) {
      console.error('❌ Ошибка списания монет:', err);
      return false;
    }
  }
}

export const coinsAPI = new CoinsAPI();
console.log('✅ CoinsAPI v1.1.0 загружен');
