// ============================================
// src/modules/coins/CoinsStore.ts
// Локальное хранилище монет
// Версия: 1.0.0
// ============================================

import { BaseStore } from '@/store/BaseStore';
import type { UUID, ISODateString } from '@types';

export interface ICoinTransaction {
  id: UUID;
  amount: number; // положительное = начисление, отрицательное = списание
  type: 'earn' | 'spend' | 'bonus' | 'referral' | 'task' | 'exchange' | 'admin';
  source: string; // откуда: 'daily_bonus', 'referral_123', 'task_456'
  description: string;
  created_at: ISODateString;
  balance_after: number;
}

export interface ICoinsStoreData {
  balance: number;
  transactions: ICoinTransaction[];
  total_earned: number;
  total_spent: number;
  last_sync: ISODateString | null;
}

export class CoinsStore extends BaseStore<ICoinsStoreData> {
  constructor() {
    super('coins');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        balance: 0,
        transactions: [],
        total_earned: 0,
        total_spent: 0,
        last_sync: null,
      };
      this.save();
    }

    if (!this._data.transactions) this._data.transactions = [];
    if (this._data.total_earned === undefined) this._data.total_earned = 0;
    if (this._data.total_spent === undefined) this._data.total_spent = 0;
  }

  /**
   * Получить текущий баланс
   */
  getBalance(): number {
    return this._data.balance || 0;
  }

  /**
   * Получить все транзакции
   */
  getTransactions(): ICoinTransaction[] {
    return this._data.transactions || [];
  }

  /**
   * Получить последние N транзакций
   */
  getRecentTransactions(limit: number = 20): ICoinTransaction[] {
    const transactions = this._data.transactions || [];
    return transactions.slice(-limit).reverse();
  }

  /**
   * Получить статистику
   */
  getStats(): { balance: number; total_earned: number; total_spent: number } {
    return {
      balance: this._data.balance || 0,
      total_earned: this._data.total_earned || 0,
      total_spent: this._data.total_spent || 0,
    };
  }

  /**
   * Добавить монеты (локально)
   */
  addCoins(amount: number, source: string, description: string): ICoinTransaction {
    const newBalance = (this._data.balance || 0) + amount;
    const transaction: ICoinTransaction = {
      id: this.generateUUID(),
      amount: amount,
      type: this._determineType(source),
      source: source,
      description: description,
      created_at: new Date().toISOString(),
      balance_after: newBalance,
    };

    this._data.balance = newBalance;
    this._data.total_earned = (this._data.total_earned || 0) + amount;
    this._data.transactions.push(transaction);
    this.save();

    console.log(`💰 +${amount} монет (${description}). Баланс: ${newBalance}`);

    this._emitChange('coins:added', {
      amount,
      newBalance,
      source,
      description,
      transaction,
    });

    return transaction;
  }

  /**
   * Списать монеты (локально)
   */
  spendCoins(amount: number, source: string, description: string): ICoinTransaction | null {
    const currentBalance = this._data.balance || 0;
    if (currentBalance < amount) {
      console.warn(`⚠️ Недостаточно монет: ${currentBalance} < ${amount}`);
      return null;
    }

    const newBalance = currentBalance - amount;
    const transaction: ICoinTransaction = {
      id: this.generateUUID(),
      amount: -amount,
      type: this._determineType(source),
      source: source,
      description: description,
      created_at: new Date().toISOString(),
      balance_after: newBalance,
    };

    this._data.balance = newBalance;
    this._data.total_spent = (this._data.total_spent || 0) + amount;
    this._data.transactions.push(transaction);
    this.save();

    console.log(`💰 -${amount} монет (${description}). Баланс: ${newBalance}`);

    this._emitChange('coins:spent', {
      amount,
      newBalance,
      source,
      description,
      transaction,
    });

    return transaction;
  }

  /**
   * Синхронизировать баланс с сервера
   */
  syncBalance(balance: number, transactions?: ICoinTransaction[]): void {
    const oldBalance = this._data.balance;
    this._data.balance = balance;
    this._data.last_sync = new Date().toISOString();

    if (transactions && transactions.length > 0) {
      // Мержим транзакции (избегаем дублей по id)
      const existingIds = new Set(this._data.transactions.map(t => t.id));
      const newTransactions = transactions.filter(t => !existingIds.has(t.id));
      this._data.transactions = [...this._data.transactions, ...newTransactions];
    }

    this.save();

    if (oldBalance !== balance) {
      console.log(`💰 Баланс синхронизирован: ${oldBalance} → ${balance}`);
      this._emitChange('coins:synced', { oldBalance, newBalance: balance });
    }
  }

  /**
   * Очистить все данные
   */
  clear(): void {
    this._data = {
      balance: 0,
      transactions: [],
      total_earned: 0,
      total_spent: 0,
      last_sync: null,
    };
    this.save();
    console.log('🧹 CoinsStore очищен');
    this._emitChange('coins:cleared', {});
  }

  /**
   * Определить тип транзакции по источнику
   */
  private _determineType(source: string): ICoinTransaction['type'] {
    if (source.startsWith('referral')) return 'referral';
    if (source.startsWith('task') || source.startsWith('sponsor')) return 'task';
    if (source.startsWith('daily')) return 'bonus';
    if (source.startsWith('admin')) return 'admin';
    if (source.startsWith('exchange')) return 'exchange';
    return 'earn';
  }
}

export const coinsStore = new CoinsStore();
console.log('✅ CoinsStore v1.0.0 загружен');
