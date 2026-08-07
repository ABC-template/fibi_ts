// ============================================
// src/economy/EconomyStore.ts
// Хранилище для UI (кеш баланса)
// Версия: 2.0.0 - обновлён
// ============================================

import { BaseStore } from '@/store/BaseStore';
import { eventBus } from '@/core/event-bus';
import type { IEconomyBalanceUpdatedEvent } from './event-types';

interface IEconomyStoreData {
  balance: number;
  total_earned: number;
  total_spent: number;
  lastUpdated: string | null;
  transactions: any[];
}

export class EconomyStore extends BaseStore<IEconomyStoreData> {
  private userId: number | null = null;

  constructor() {
    super('economy');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        balance: 0,
        total_earned: 0,
        total_spent: 0,
        lastUpdated: null,
        transactions: [],
      };
      this.save();
    }

    if (this._data.total_earned === undefined) this._data.total_earned = 0;
    if (this._data.total_spent === undefined) this._data.total_spent = 0;

    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    eventBus.on('economy:balance:updated', this.onBalanceUpdated.bind(this));
    eventBus.on('user:changed', this.onUserChanged.bind(this));
    console.log('📡 EconomyStore подписан на события');
  }

  private onBalanceUpdated(event: IEconomyBalanceUpdatedEvent): void {
    // Обновляем только если это наш пользователь
    if (this.userId && event.userId === this.userId) {
      this._data.balance = event.newBalance;
      this._data.lastUpdated = new Date().toISOString();
      this.save();
      this._emitChange('economy:balance:changed', {
        balance: event.newBalance,
        delta: event.delta,
        source: event.source,
      });
      console.log(`💰 Balance updated: ${event.delta} (${event.source}), new: ${event.newBalance}`);
    }
  }

  private onUserChanged(data: { userId: number }): void {
    this.userId = data.userId;
    // Перезагружаем баланс при смене пользователя
    this.loadBalance();
  }

  async loadBalance(): Promise<void> {
    if (!this.userId) {
      const tg = (window as any).Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      if (user?.id) {
        this.userId = user.id;
      } else {
        return;
      }
    }

    try {
      const { economyService } = await import('./EconomyService');
      const result = await economyService.getBalance(this.userId);
      if (result.success) {
        this._data.balance = result.balance;
        this._data.total_earned = result.total_earned;
        this._data.total_spent = result.total_spent;
        this._data.lastUpdated = new Date().toISOString();
        this.save();
        this._emitChange('economy:balance:loaded', {
          balance: result.balance,
          total_earned: result.total_earned,
          total_spent: result.total_spent,
        });
        console.log(`💰 Баланс загружен: ${result.balance}`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки баланса:', err);
    }
  }

  getBalance(): number {
    return this._data.balance || 0;
  }

  getStats(): { total_earned: number; total_spent: number } {
    return {
      total_earned: this._data.total_earned || 0,
      total_spent: this._data.total_spent || 0,
    };
  }

  setStats(total_earned: number, total_spent: number): void {
    this._data.total_earned = total_earned;
    this._data.total_spent = total_spent;
    this.save();
  }

  updateBalance(userId: number, newBalance: number): void {
    if (this.userId && userId === this.userId) {
      this._data.balance = newBalance;
      this._data.lastUpdated = new Date().toISOString();
      this.save();
    }
  }

  clear(): void {
    this._data = {
      balance: 0,
      total_earned: 0,
      total_spent: 0,
      lastUpdated: null,
      transactions: [],
    };
    this.save();
  }
}

export const economyStore = new EconomyStore();

// Для глобального доступа
(window as any).economyStore = economyStore;
