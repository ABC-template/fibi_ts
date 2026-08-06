// ============================================
// src/modules/admin/AdminStore.ts
// Хранилище для админ-панели
// Версия: 1.0.0
// ============================================

import { BaseStore } from '@/store/BaseStore';
import type { UUID, ISODateString } from '@types';

export interface IAdminStats {
  total_users: number;
  total_chats: number;
  total_messages: number;
  total_referrals: number;
  total_coins_earned: number;
  total_coins_spent: number;
  premium_users: number;
  trial_users: number;
  active_users: number; // за последние 7 дней
}

export interface IAdminStoreData {
  stats: IAdminStats | null;
  last_sync: ISODateString | null;
}

export class AdminStore extends BaseStore<IAdminStoreData> {
  constructor() {
    super('admin');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        stats: null,
        last_sync: null,
      };
      this.save();
    }
  }

  /**
   * Получить статистику
   */
  getStats(): IAdminStats | null {
    return this._data.stats;
  }

  /**
   * Установить статистику
   */
  setStats(stats: IAdminStats): void {
    this._data.stats = stats;
    this._data.last_sync = new Date().toISOString();
    this.save();
    this._emitChange('admin:stats_updated', { stats });
  }

  /**
   * Очистить данные
   */
  clear(): void {
    this._data = {
      stats: null,
      last_sync: null,
    };
    this.save();
    console.log('🧹 AdminStore очищен');
    this._emitChange('admin:cleared', {});
  }
}

export const adminStore = new AdminStore();
console.log('✅ AdminStore v1.0.0 загружен');
