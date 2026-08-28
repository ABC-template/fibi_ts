// ============================================
// src/store/SubscriptionStore.ts
// Хранилище подписок
// Версия: 1.0.0
// ============================================

import { BaseStore } from './BaseStore';
import { eventBus } from '@/core/event-bus';
import type { ITier, IUserSubscription } from '@/services/subscription';

interface ISubscriptionStoreData {
  tiers: ITier[];
  userSubscription: IUserSubscription | null;
  lastUpdated: string | null;
}

export class SubscriptionStore extends BaseStore<ISubscriptionStoreData> {
  constructor() {
    super('subscription');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        tiers: [],
        userSubscription: null,
        lastUpdated: null,
      };
      this.save();
    }

    if (!this._data.tiers) this._data.tiers = [];
    this._subscribeToEvents();
  }

  private _subscribeToEvents(): void {
    eventBus.on('user:changed', () => {
      this.loadUserSubscription();
    }, this);

    eventBus.on('subscription:updated', () => {
      this.loadUserSubscription();
    }, this);

    console.log('📡 SubscriptionStore подписан на события');
  }

  /**
   * Загрузить тарифы
   */
  async loadTiers(): Promise<void> {
    try {
      const { subscriptionService } = await import('@/services/subscription');
      const tiers = await subscriptionService.getTiers();
      this._data.tiers = tiers;
      this._data.lastUpdated = new Date().toISOString();
      this.save();
      this._emitChange('subscription:tiers_loaded', { tiers });
    } catch (err) {
      console.error('[SubscriptionStore] Error loading tiers:', err);
    }
  }

  /**
   * Загрузить подписку пользователя
   */
  async loadUserSubscription(): Promise<void> {
    try {
      const { subscriptionService } = await import('@/services/subscription');
      const subscription = await subscriptionService.getUserSubscription();
      this._data.userSubscription = subscription;
      this.save();
      this._emitChange('subscription:user_loaded', { subscription });
    } catch (err) {
      console.error('[SubscriptionStore] Error loading user subscription:', err);
    }
  }

  /**
   * Получить все тарифы
   */
  getTiers(): ITier[] {
    return this._data.tiers || [];
  }

  /**
   * Получить активные тарифы
   */
  getActiveTiers(): ITier[] {
    return (this._data.tiers || []).filter(t => t.is_active);
  }

  /**
   * Получить тариф по ключу
   */
  getTierByKey(tierKey: string): ITier | undefined {
    return (this._data.tiers || []).find(t => t.tier_key === tierKey);
  }

  /**
   * Получить подписку пользователя
   */
  getUserSubscription(): IUserSubscription | null {
    return this._data.userSubscription || null;
  }

  /**
   * Проверить, активна ли подписка
   */
  hasActiveSubscription(): boolean {
    const sub = this._data.userSubscription;
    if (!sub) return false;
    if (!sub.is_active) return false;
    return new Date(sub.expires_at) > new Date();
  }

  /**
   * Получить количество дней до окончания подписки
   */
  getDaysRemaining(): number {
    const sub = this._data.userSubscription;
    if (!sub || !sub.is_active) return 0;
    const diff = new Date(sub.expires_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * Очистить данные
   */
  clear(): void {
    this._data = {
      tiers: [],
      userSubscription: null,
      lastUpdated: null,
    };
    this.save();
    console.log('🧹 SubscriptionStore очищен');
  }
}

export const subscriptionStore = new SubscriptionStore();
console.log('✅ SubscriptionStore v1.0.0 загружен');
