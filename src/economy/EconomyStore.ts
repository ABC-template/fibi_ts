// ============================================
// src/economy/EconomyStore.ts
// Хранилище для UI (кеш балансов)
// Версия: 3.0.2 - миграция старых данных + защита
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

    // ✅ ПРОВЕРКА И МИГРАЦИЯ СТАРЫХ ДАННЫХ
    // Если данные пустые или имеют неверную структуру — пересоздаем
    if (!this._data || typeof this._data !== 'object' || Object.keys(this._data).length === 0) {
      console.log('🔄 [EconomyStore] Создаем новую структуру данных');
      this._data = this.getDefaultData();
      this.save();
    }

    // ✅ Проверяем структуру coins
    if (!this._data.coins || typeof this._data.coins !== 'object') {
      console.log('🔄 [EconomyStore] Восстанавливаем coins');
      this._data.coins = { balance: 0, total_earned: 0, total_spent: 0 };
      this.save();
    }

    // ✅ Проверяем структуру tokens
    if (!this._data.tokens || typeof this._data.tokens !== 'object') {
      console.log('🔄 [EconomyStore] Восстанавливаем tokens');
      this._data.tokens = { bonus: 0, permanent: 0 };
      this.save();
    }

    // ✅ Проверяем transactions
    if (!this._data.transactions || typeof this._data.transactions !== 'object') {
      console.log('🔄 [EconomyStore] Восстанавливаем transactions');
      this._data.transactions = { coins: [], tokens: [] };
      this.save();
    }

    // ✅ Убеждаемся, что все поля есть
    if (this._data.coins.balance === undefined) this._data.coins.balance = 0;
    if (this._data.coins.total_earned === undefined) this._data.coins.total_earned = 0;
    if (this._data.coins.total_spent === undefined) this._data.coins.total_spent = 0;
    if (this._data.tokens.bonus === undefined) this._data.tokens.bonus = 0;
    if (this._data.tokens.permanent === undefined) this._data.tokens.permanent = 0;

    this.subscribeToEvents();
    console.log('✅ EconomyStore v3.0.2 инициализирован', this._data);
  }

  private getDefaultData(): IEconomyStoreData {
    return {
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
      if (result?.success) {
        this._data.coins.balance = result.coins?.balance || 0;
        this._data.coins.total_earned = result.coins?.total_earned || 0;
        this._data.coins.total_spent = result.coins?.total_spent || 0;
        this._data.tokens.bonus = result.tokens?.bonus || 0;
        this._data.tokens.permanent = result.tokens?.permanent || 0;
        this._data.lastUpdated = new Date().toISOString();
        this.save();
        
        this._emitChange('economy:coins:loaded', this._data.coins);
        this._emitChange('economy:tokens:loaded', this._data.tokens);
        console.log(`💰 Балансы загружены: ${this._data.coins.balance} 🪙, ${this._data.tokens.bonus + this._data.tokens.permanent} ⚡`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки балансов:', err);
    }
  }

  async loadConfig(): Promise<void> {
    try {
      const { economyService } = await import('./EconomyService');
      const result = await economyService.getConfig();
      if (result?.success) {
        this._data.config = result.config;
        this.save();
        this._emitChange('economy:config:loaded', result.config);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки конфига:', err);
    }
  }

  // ==========================================
  // ГЕТТЕРЫ (с защитой)
  // ==========================================

  getCoinBalance(): number {
    // ✅ МАКСИМАЛЬНАЯ ЗАЩИТА
    try {
      return this._data?.coins?.balance ?? 0;
    } catch (err) {
      console.warn('⚠️ [getCoinBalance] Ошибка, возвращаем 0');
      return 0;
    }
  }

  getCoinStats(): { total_earned: number; total_spent: number } {
    try {
      return {
        total_earned: this._data?.coins?.total_earned ?? 0,
        total_spent: this._data?.coins?.total_spent ?? 0,
      };
    } catch (err) {
      console.warn('⚠️ [getCoinStats] Ошибка, возвращаем 0');
      return { total_earned: 0, total_spent: 0 };
    }
  }

  getTokenBalances(): { bonus: number; permanent: number; total: number } {
    try {
      const bonus = this._data?.tokens?.bonus ?? 0;
      const permanent = this._data?.tokens?.permanent ?? 0;
      return {
        bonus,
        permanent,
        total: bonus + permanent,
      };
    } catch (err) {
      console.warn('⚠️ [getTokenBalances] Ошибка, возвращаем 0');
      return { bonus: 0, permanent: 0, total: 0 };
    }
  }

  getConfig(): any {
    try {
      return this._data?.config || null;
    } catch (err) {
      console.warn('⚠️ [getConfig] Ошибка, возвращаем null');
      return null;
    }
  }

  getTransactions(type: 'coins' | 'tokens'): any[] {
    try {
      return this._data?.transactions?.[type] || [];
    } catch (err) {
      console.warn('⚠️ [getTransactions] Ошибка, возвращаем []');
      return [];
    }
  }

  // ==========================================
  // СЕТТЕРЫ
  // ==========================================

  updateCoinBalance(balance: number): void {
    try {
      if (!this._data.coins) {
        this._data.coins = { balance: 0, total_earned: 0, total_spent: 0 };
      }
      this._data.coins.balance = balance;
      this._data.lastUpdated = new Date().toISOString();
      this.save();
    } catch (err) {
      console.error('❌ [updateCoinBalance] Ошибка:', err);
    }
  }

  updateBalance(userId: number, newBalance: number): void {
    if (userId === this.userId) {
      this.updateCoinBalance(newBalance);
    }
  }

  setStats(total_earned: number, total_spent: number): void {
    try {
      if (!this._data.coins) {
        this._data.coins = { balance: 0, total_earned: 0, total_spent: 0 };
      }
      this._data.coins.total_earned = total_earned;
      this._data.coins.total_spent = total_spent;
      this.save();
    } catch (err) {
      console.error('❌ [setStats] Ошибка:', err);
    }
  }

  updateTokenBalances(bonus: number, permanent: number): void {
    try {
      if (!this._data.tokens) {
        this._data.tokens = { bonus: 0, permanent: 0 };
      }
      this._data.tokens.bonus = bonus;
      this._data.tokens.permanent = permanent;
      this._data.lastUpdated = new Date().toISOString();
      this.save();
    } catch (err) {
      console.error('❌ [updateTokenBalances] Ошибка:', err);
    }
  }

  setTransactions(type: 'coins' | 'tokens', transactions: any[]): void {
    try {
      if (!this._data.transactions) {
        this._data.transactions = { coins: [], tokens: [] };
      }
      this._data.transactions[type] = (transactions || []).slice(0, 50);
      this.save();
    } catch (err) {
      console.error('❌ [setTransactions] Ошибка:', err);
    }
  }

  clear(): void {
    this._data = this.getDefaultData();
    this.save();
    console.log('🧹 EconomyStore очищен');
  }
}

export const economyStore = new EconomyStore();

(window as any).economyStore = economyStore;
