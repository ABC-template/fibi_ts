// ============================================
// src/modules/coins/CoinsStore.ts
// Локальное хранилище монет (ТЕПЕРЬ ТОЛЬКО ДЛЯ UI)
// Версия: 2.0.0 - ПЕРЕКЛЮЧЕНО НА EconomyStore
// ============================================

import { BaseStore } from '@/store/BaseStore';
import { eventBus } from '@/core/event-bus';
import type { UUID, ISODateString } from '@types';

export interface ICoinTransaction {
  id: UUID;
  amount: number;
  type: 'earn' | 'spend' | 'bonus' | 'referral' | 'task' | 'exchange' | 'admin';
  source: string;
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

    this._subscribeToBalance();
  }

  private _subscribeToBalance(): void {
    eventBus.on('economy:balance:updated', (data) => {
      this._data.balance = data.newBalance;
      this._data.last_sync = new Date().toISOString();
      this.save();
      
      this._emitChange('coins:synced', {
        balance: data.newBalance,
        delta: data.delta,
        source: data.source
      });
    }, this);
  }

  getBalance(): number {
    return this._data.balance || 0;
  }

  getTransactions(): ICoinTransaction[] {
    return this._data.transactions || [];
  }

  getRecentTransactions(limit: number = 20): ICoinTransaction[] {
    const transactions = this._data.transactions || [];
    return transactions.slice(-limit).reverse();
  }

  getStats(): { balance: number; total_earned: number; total_spent: number } {
    return {
      balance: this._data.balance || 0,
      total_earned: this._data.total_earned || 0,
      total_spent: this._data.total_spent || 0,
    };
  }

  syncBalance(balance: number, transactions?: ICoinTransaction[]): void {
    const oldBalance = this._data.balance;
    this._data.balance = balance;
    this._data.last_sync = new Date().toISOString();

    if (transactions && transactions.length > 0) {
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
}

export const coinsStore = new CoinsStore();
console.log('✅ CoinsStore v2.0.0 загружен (переключен на EconomyStore)');
