// ============================================
// src/services/subscription.ts
// Сервис для работы с подписками
// Версия: 1.3.1 - без console.log с устаревшим номером версии
//          1.3.0 — убраны activateTrial и is_trial (пробного периода больше нет)
//          1.2.0 — подписка пользователя берётся из данных входа (эндпоинта
//                  /subscription/user нет); убран cancelSubscription (эндпоинта нет)
//          1.1.0 — после активации пробной подписки доступ перепроверяется на сервере:
//                  синхронизация и Realtime включаются сразу, локальные чаты выгружаются
//          1.0.0
// ============================================

import { apiClient } from './api';
import { userStore } from '@/store/UserStore';

export interface ITier {
  id: string;
  tier_key: string;
  name: string;
  name_en: string;
  days: number;
  price_stars: number;
  permanent_tokens: number;
  is_active: boolean;
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

  /** Перепроверить доступ на сервере и применить переход trial → PRO */
  private async refreshAccess(): Promise<void> {
    try {
      const { authService } = await import('./auth');
      const { applyAccessTransition } = await import('./access-transition');
      const result = await authService.checkSubscription();
      await applyAccessTransition(result);
    } catch (err) {
      console.error('[SubscriptionService] Не удалось обновить доступ:', err);
    }
  }

  /**
   * Купить подписку
   */
  async purchaseSubscription(tierKey: string): Promise<{ success: boolean; tier?: string; days?: number; tokens?: number; expires_at?: string; error?: string }> {
    try {
      const response = await apiClient.post('/subscription/purchase', { tier_key: tierKey });
      if (response.success) {
        await this.refreshAccess();
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
   * Текущая подписка пользователя — из данных входа (auth/check). Раньше запрашивался
   * несуществующий /subscription/user, и проверка разового тарифа не работала.
   * Окончательно разовый тариф проверяет сервер при покупке.
   */
  async getUserSubscription(): Promise<IUserSubscription | null> {
    const tierKey = userStore.subscriptionTier;
    const until = userStore.premiumUntil;
    if (!tierKey || tierKey === 'trial' || !until) return null;
    return {
      id: '',
      user_id: userStore.userId || 0,
      tier_key: tierKey,
      starts_at: '',
      expires_at: until,
      is_active: new Date(until).getTime() > Date.now(),
    };
  }
}

export const subscriptionService = new SubscriptionService();
