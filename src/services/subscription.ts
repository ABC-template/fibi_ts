// ============================================
// src/services/subscription.ts
// Сервис для работы с подписками
// Версия: 1.0.0
// ============================================

import { apiClient } from './api';
import { userStore } from '@/store/UserStore';
import { eventBus } from '@/core/event-bus';

export interface ITier {
  id: string;
  tier_key: string;
  name: string;
  name_en: string;
  days: number;
  price_stars: number;
  permanent_tokens: number;
  is_active: boolean;
  is_trial: boolean;
  is_one_time: boolean;
  description: string | null;
  sort_order: number;
}

export interface IUserSubscription {
  id: string;
  user_id: number;
  tier_key: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
}

export class SubscriptionService {
  private userId: number | null = null;

  constructor() {
    this.userId = userStore.userId;
    this._subscribeToEvents();
  }

  private _subscribeToEvents(): void {
    eventBus.on('user:changed', (data) => {
      this.userId = data.userId;
    }, this);
  }

  /**
   * Получить все доступные тарифы
   */
  async getTiers(): Promise<ITier[]> {
    try {
      const response = await apiClient.get('/subscription/tiers');
      if (response.success) {
        return response.tiers || [];
      }
      return [];
    } catch (err) {
      console.error('[SubscriptionService] Error getting tiers:', err);
      return [];
    }
  }

  /**
   * Активировать пробный период
   */
  async activateTrial(): Promise<{ success: boolean; tier?: string; days?: number; tokens?: number; expires_at?: string; error?: string }> {
    try {
      const response = await apiClient.post('/subscription/activate-trial');
      if (response.success) {
        // Обновляем пользователя в сторе
        if (userStore) {
          userStore.markTrialUsed();
          userStore.setRole('premium', 100, true);
        }
        return {
          success: true,
          tier: response.tier,
          days: response.days,
          tokens: response.permanent_tokens,
          expires_at: response.expires_at,
        };
      }
      return {
        success: false,
        error: response.error || 'Failed to activate trial',
      };
    } catch (err) {
      console.error('[SubscriptionService] Error activating trial:', err);
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Купить подписку
   */
  async purchaseSubscription(tierKey: string): Promise<{ success: boolean; tier?: string; days?: number; tokens?: number; expires_at?: string; error?: string }> {
    try {
      const response = await apiClient.post('/subscription/purchase', { tier_key: tierKey });
      if (response.success) {
        // Обновляем пользователя в сторе
        if (userStore) {
          userStore.setRole('premium', 100, true);
        }
        return {
          success: true,
          tier: response.tier,
          days: response.days,
          tokens: response.permanent_tokens,
          expires_at: response.expires_at,
        };
      }
      return {
        success: false,
        error: response.error || 'Failed to purchase subscription',
      };
    } catch (err) {
      console.error('[SubscriptionService] Error purchasing subscription:', err);
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Получить активную подписку пользователя
   */
  async getUserSubscription(): Promise<IUserSubscription | null> {
    if (!this.userId) return null;

    try {
      const response = await apiClient.get(`/subscription/user/${this.userId}`);
      if (response.success && response.subscription) {
        return response.subscription;
      }
      return null;
    } catch (err) {
      console.error('[SubscriptionService] Error getting user subscription:', err);
      return null;
    }
  }

  /**
   * Отменить подписку (отключить автопродление)
   */
  async cancelSubscription(): Promise<boolean> {
    if (!this.userId) return false;

    try {
      const response = await apiClient.post('/subscription/cancel', { user_id: this.userId });
      return response.success === true;
    } catch (err) {
      console.error('[SubscriptionService] Error canceling subscription:', err);
      return false;
    }
  }
}

export const subscriptionService = new SubscriptionService();
console.log('✅ SubscriptionService v1.0.0 загружен');
