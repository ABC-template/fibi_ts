// ============================================
// src/modules/coins/CoinsAPI.ts
// API-клиент для работы с монетами
// Версия: 1.0.0
// ============================================

import { apiClient } from '@/services/api';
import { coinsStore } from './CoinsStore';

export class CoinsAPI {
  /**
   * Получить баланс с сервера
   */
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

  /**
   * Полная синхронизация
   */
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

  /**
   * Получить историю транзакций
   */
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

  /**
   * Начислить монеты (с подписью)
   */
  async addCoins(amount: number, source: string, description: string): Promise<boolean> {
    try {
      const timestamp = Date.now();
      const userId = coinsStore.getTelegramId();

      // Генерируем подпись на клиенте (для демонстрации)
      // В реальном проекте подпись должна генерироваться на сервере!
      const signature = await this._generateSignature(userId, amount, source, timestamp);

      const data = await apiClient.post('/coins/add', {
        amount,
        source,
        description,
        signature,
        timestamp,
      });

      if (data.success) {
        // Обновляем локальный баланс
        coinsStore.addCoins(amount, source, description);
        return true;
      }
      return false;
    } catch (err) {
      console.error('❌ Ошибка начисления монет:', err);
      return false;
    }
  }

  /**
   * Генерация подписи (временная реализация)
   * В реальном проекте используйте серверную генерацию
   */
  private async _generateSignature(
    userId: number | null,
    amount: number,
    source: string,
    timestamp: number
  ): Promise<string> {
    // Временная заглушка
    // В реальном проекте подпись должна генерироваться на сервере
    return 'temp_signature_' + Date.now();
  }
}

export const coinsAPI = new CoinsAPI();
console.log('✅ CoinsAPI v1.0.0 загружен');
