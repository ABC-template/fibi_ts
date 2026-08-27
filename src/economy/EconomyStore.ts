// ============================================
// src/economy/EconomyStore.ts
// Хранилище для UI (кеш балансов)
// Версия: 3.0.0 - добавлены токены
// ============================================

import { BaseStore } from '@/store/BaseStore';
import { eventBus } from '@/core/event-bus';
import type { IEconomyBalanceUpdatedEvent } from './event-types';

interface IEconomyStoreData {
  coins: {
    balance: number;
    total_earned: number;
    total_spent: number;
  };
  tokens: {
    bonus: number;
    permanent: number;
  };
  lastUpdated: string | null;
  transactions: {
    coins: any[];
    tokens: any[];
  };
  config: {
    exchange_enabled: boolean;
    exchange_rate: number;
    max_exchange_percent: number;
    bonus_tokens_per_day: number;
    whitelist_enabled: boolean;
  } | null;
}

export class EconomyStore extends BaseStore<IEconomyStoreData> {
  private userId: number | null = null;

  constructor() {
    super('economy');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        coins: {
          balance: 0,
          total_earned: 0,
          total_spent: 0,
        },
        tokens: {
          bonus: 0,
          permanent: 0,
        },
        lastUpdated: null,
        transactions: {
          coins: [],
          tokens: [],
        },
        config: null,
      };
      this.save();
    }

    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    eventBus.on('economy:balance:updated', this.onBalanceUpdated.bind(this));
    eventBus.on('user:changed', this.onUserChanged.bind(this));
    eventBus.on('tokens:updated', this.onTokensUpdated.bind(this));
    console.log('📡 EconomyStore подписан на события');
  }

  private onBalanceUpdated(event: IEconomyBalanceUpdatedEvent): void {
    if (this.userId && event.userId === this.userId) {
      this._data.coins.balance = event.newBalance;
      this._data.lastUpdated = new Date().toISOString();
      this.save();
      this._emitChange('economy:coins:updated', {
        balance: event.newBalance,
        delta: event.delta,
        source: event.source,
      });
    }
  }

  private onTokensUpdated(data: { bonus: number; permanent: number }): void {
    this._data.tokens.bonus = data.bonus;
    this._data.tokens.permanent = data.permanent;
    this._data.lastUpdated = new Date().toISOString();
    this.save();
    this._emitChange('economy:tokens:updated', data);
  }

  private onUserChanged(data: { userId: number }): void {
    this.userId = data.userId;
    this.loadBalances();
  }

  async loadBalances(): Promise<void> {
    if (!this.userId) {
      const tg = (window as any).Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      if (user?.id) this.userId = user.id;
      else return;
    }

    try {
      const { economyService } = await import('./EconomyService');
      const result = await economyService.getFullBalance(this.userId);
      if (result.success) {
        this._data.coins.balance = result.coins.balance;
        this._data.coins.total_earned = result.coins.total_earned;
        this._data.coins.total_spent = result.coins.total_spent;
        this._data.tokens.bonus = result.tokens.bonus;
        this._data.tokens.permanent = result.tokens.permanent;
        this._data.lastUpdated = new Date().toISOString();
        this.save();
        
        this._emitChange('economy:coins:loaded', result.coins);
        this._emitChange('economy:tokens:loaded', result.tokens);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки балансов:', err);
    }
  }

  async loadConfig(): Promise<void> {
    try {
      const { economyService } = await import('./EconomyService');
      const result = await economyService.getConfig();
      if (result.success) {
        this._data.config = result.config;
        this.save();
        this._emitChange('economy:config:loaded', result.config);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки конфига:', err);
    }
  }

  // ==========================================
  // ГЕТТЕРЫ
  // ==========================================

  getCoinBalance(): number {
    return this._data.coins.balance || 0;
  }

  getCoinStats(): { total_earned: number; total_spent: number } {
    return {
      total_earned: this._data.coins.total_earned || 0,
      total_spent: this._data.coins.total_spent || 0,
    };
  }

  getTokenBalances(): { bonus: number; permanent: number; total: number } {
    return {
      bonus: this._data.tokens.bonus || 0,
      permanent: this._data.tokens.permanent || 0,
      total: (this._data.tokens.bonus || 0) + (this._data.tokens.permanent || 0),
    };
  }

  getConfig(): any {
    return this._data.config || null;
  }

  getTransactions(type: 'coins' | 'tokens'): any[] {
    return this._data.transactions[type] || [];
  }

  // ==========================================
  // СЕТТЕРЫ
  // ==========================================

  updateCoinBalance(balance: number): void {
    this._data.coins.balance = balance;
    this._data.lastUpdated = new Date().toISOString();
    this.save();
  }

  updateTokenBalances(bonus: number, permanent: number): void {
    this._data.tokens.bonus = bonus;
    this._data.tokens.permanent = permanent;
    this._data.lastUpdated = new Date().toISOString();
    this.save();
  }

  setTransactions(type: 'coins' | 'tokens', transactions: any[]): void {
    this._data.transactions[type] = transactions.slice(0, 50);
    this.save();
  }

  clear(): void {
    this._data = {
      coins: {
        balance: 0,
        total_earned: 0,
        total_spent: 0,
      },
      tokens: {
        bonus: 0,
        permanent: 0,
      },
      lastUpdated: null,
      transactions: {
        coins: [],
        tokens: [],
      },
      config: null,
    };
    this.save();
  }
}

export const economyStore = new EconomyStore();

(window as any).economyStore = economyStore;
