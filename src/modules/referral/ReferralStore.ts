// ============================================
// src/modules/referral/ReferralStore.ts
// Локальное хранилище рефералов
// Версия: 1.0.0
// ============================================

import { BaseStore } from '@/store/BaseStore';
import type { UUID, ISODateString } from '@types';

export interface IReferral {
  id: UUID;
  referred_id: number;
  referred_username: string;
  status: 'pending' | 'active' | 'rewarded';
  created_at: ISODateString;
  activated_at?: ISODateString;
  rewarded_at?: ISODateString;
  reward_amount: number;
}

export interface IReferralStats {
  total: number;
  pending: number;
  active: number;
  rewarded: number;
  total_reward: number;
  current_tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  next_tier_progress: number;
  referral_limit_reached: boolean;
}

export interface IReferralStoreData {
  referrals: IReferral[];
  total_reward: number;
  referral_link: string | null;
  last_sync: ISODateString | null;
}

// Конфигурация ступеней реферальной системы
export const REFERRAL_TIERS = [
  { from: 0, to: 100, reward: 10, name: 'bronze' as const },
  { from: 101, to: 500, reward: 5, name: 'silver' as const },
  { from: 501, to: 1000, reward: 3, name: 'gold' as const },
  { from: 1001, to: Infinity, reward: 1, name: 'platinum' as const },
];

export const REFERRAL_REWARD_LIMIT = 500; // макс монет с рефералов (ступенчато)

export class ReferralStore extends BaseStore<IReferralStoreData> {
  constructor() {
    super('referral');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        referrals: [],
        total_reward: 0,
        referral_link: null,
        last_sync: null,
      };
      this.save();
    }

    if (!this._data.referrals) this._data.referrals = [];
    if (this._data.total_reward === undefined) this._data.total_reward = 0;
  }

  /**
   * Получить список рефералов
   */
  getReferrals(): IReferral[] {
    return this._data.referrals || [];
  }

  /**
   * Получить статистику
   */
  getStats(): IReferralStats {
    const referrals = this._data.referrals || [];
    const total = referrals.length;
    const pending = referrals.filter(r => r.status === 'pending').length;
    const active = referrals.filter(r => r.status === 'active').length;
    const rewarded = referrals.filter(r => r.status === 'rewarded').length;

    // Определяем текущий уровень
    let current_tier: IReferralStats['current_tier'] = 'bronze';
    for (const tier of REFERRAL_TIERS) {
      if (total >= tier.from && total <= tier.to) {
        current_tier = tier.name;
        break;
      }
    }

    // Прогресс до следующего уровня
    let next_tier_progress = 0;
    for (let i = 0; i < REFERRAL_TIERS.length; i++) {
      const tier = REFERRAL_TIERS[i];
      if (total >= tier.from && total <= tier.to) {
        if (i < REFERRAL_TIERS.length - 1) {
          const nextTier = REFERRAL_TIERS[i + 1];
          const range = nextTier.from - tier.from;
          const progress = total - tier.from;
          next_tier_progress = Math.min(100, Math.round((progress / range) * 100));
        } else {
          next_tier_progress = 100;
        }
        break;
      }
    }

    // Проверяем лимит
    const referral_limit_reached = this._data.total_reward >= REFERRAL_REWARD_LIMIT;

    return {
      total,
      pending,
      active,
      rewarded,
      total_reward: this._data.total_reward || 0,
      current_tier,
      next_tier_progress,
      referral_limit_reached,
    };
  }

  /**
   * Получить награду за реферала (в зависимости от текущего уровня)
   */
  getRewardForReferral(): number {
    const total = this._data.referrals?.length || 0;
    for (const tier of REFERRAL_TIERS) {
      if (total >= tier.from && total <= tier.to) {
        return tier.reward;
      }
    }
    return 1; // fallback
  }

  /**
   * Добавить реферала
   */
  addReferral(referral: IReferral): void {
    this._data.referrals.push(referral);
    this.save();

    console.log(`🤝 Новый реферал: ${referral.referred_username} (${referral.status})`);
    this._emitChange('referral:added', { referral });
  }

  /**
   * Обновить статус реферала
   */
  updateReferralStatus(referralId: UUID, status: IReferral['status']): void {
    const referral = this._data.referrals.find(r => r.id === referralId);
    if (!referral) {
      console.warn(`⚠️ Реферал ${referralId} не найден`);
      return;
    }

    referral.status = status;
    if (status === 'active') {
      referral.activated_at = new Date().toISOString();
    }
    if (status === 'rewarded') {
      referral.rewarded_at = new Date().toISOString();
    }

    this.save();
    console.log(`🔄 Статус реферала ${referralId} обновлён: ${status}`);
    this._emitChange('referral:status_changed', { referralId, status });
  }

  /**
   * Начислить награду за реферала
   */
  rewardReferral(referralId: UUID, amount: number): void {
    const referral = this._data.referrals.find(r => r.id === referralId);
    if (!referral) {
      console.warn(`⚠️ Реферал ${referralId} не найден`);
      return;
    }

    if (referral.status === 'rewarded') {
      console.warn(`⚠️ Реферал ${referralId} уже награждён`);
      return;
    }

    // Проверяем лимит
    if (this._data.total_reward + amount > REFERRAL_REWARD_LIMIT) {
      const remaining = REFERRAL_REWARD_LIMIT - this._data.total_reward;
      if (remaining <= 0) {
        console.warn(`⚠️ Достигнут лимит реферальных наград (${REFERRAL_REWARD_LIMIT})`);
        return;
      }
      // Начисляем только остаток
      console.log(`⚠️ Лимит достигнут, начисляем ${remaining} вместо ${amount}`);
      this._data.total_reward += remaining;
      referral.reward_amount = remaining;
    } else {
      this._data.total_reward += amount;
      referral.reward_amount = amount;
    }

    referral.status = 'rewarded';
    referral.rewarded_at = new Date().toISOString();

    this.save();
    console.log(`💰 Начислено ${amount} монет за реферала ${referralId}`);
    this._emitChange('referral:rewarded', { referralId, amount });
  }

  /**
   * Получить реферальную ссылку
   */
  getReferralLink(): string | null {
    return this._data.referral_link;
  }

  /**
   * Установить реферальную ссылку
   */
  setReferralLink(link: string): void {
    this._data.referral_link = link;
    this.save();
    console.log(`🔗 Реферальная ссылка установлена: ${link}`);
  }

  /**
   * Синхронизировать данные с сервера
   */
  sync(data: { referrals: IReferral[]; total_reward: number; referral_link: string }): void {
    // Мержим рефералов (избегаем дублей по id)
    const existingIds = new Set(this._data.referrals.map(r => r.id));
    const newReferrals = data.referrals.filter(r => !existingIds.has(r.id));
    this._data.referrals = [...this._data.referrals, ...newReferrals];
    this._data.total_reward = data.total_reward || 0;
    this._data.referral_link = data.referral_link || null;
    this._data.last_sync = new Date().toISOString();
    this.save();

    console.log(`🔄 Рефералы синхронизированы (${this._data.referrals.length} всего)`);
    this._emitChange('referral:synced', { referrals: this._data.referrals });
  }

  /**
   * Очистить все данные
   */
  clear(): void {
    this._data = {
      referrals: [],
      total_reward: 0,
      referral_link: null,
      last_sync: null,
    };
    this.save();
    console.log('🧹 ReferralStore очищен');
    this._emitChange('referral:cleared', {});
  }
}

export const referralStore = new ReferralStore();
console.log('✅ ReferralStore v1.0.0 загружен');
