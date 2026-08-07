// ============================================
// src/economy/EconomyStore.ts
// Описание: Хранилище для UI (кеш баланса)
// Версия: 1.0.0
// ============================================

import { BaseStore } from '@/store/BaseStore';
import { eventBus } from '@/core/event-bus';
import type { IEconomyBalanceUpdatedEvent } from './event-types';

interface IEconomyStoreData {
  balance: number;
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
        lastUpdated: null,
        transactions: [],
      };
      this.save();
    }

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
      // Пробуем получить userId из Telegram
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
      const balance = await economyService.getBalance(this.userId);
      this._data.balance = balance;
      this._data.lastUpdated = new Date().toISOString();
      this.save();
      this._emitChange('economy:balance:loaded', { balance });
      console.log(`💰 Баланс загружен: ${balance}`);
    } catch (err) {
      console.error('❌ Ошибка загрузки баланса:', err);
    }
  }

  getBalance(): number {
    return this._data.balance || 0;
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
      lastUpdated: null,
      transactions: [],
    };
    this.save();
  }
}

export const economyStore = new EconomyStore();

// Для глобального доступа
(window as any).economyStore = economyStore;
