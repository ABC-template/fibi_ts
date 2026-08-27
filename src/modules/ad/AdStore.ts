// ============================================
// src/modules/ad/AdStore.ts
// Статистика по рекламе
// Версия: 1.0.0
// ============================================

import { BaseStore } from '@/store/BaseStore';

export interface IAdStoreData {
  total_shows: number;
  total_rewarded: number;
  total_coins_earned: number;
  last_show: string | null;
}

export class AdStore extends BaseStore<IAdStoreData> {
  constructor() {
    super('ad');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        total_shows: 0,
        total_rewarded: 0,
        total_coins_earned: 0,
        last_show: null,
      };
      this.save();
    }
  }

  incrementShows(): void {
    this._data.total_shows += 1;
    this._data.last_show = new Date().toISOString();
    this.save();
  }

  incrementRewarded(coins: number): void {
    this._data.total_rewarded += 1;
    this._data.total_coins_earned += coins;
    this.save();
  }

  getStats(): IAdStoreData {
    return { ...this._data };
  }

  clear(): void {
    this._data = {
      total_shows: 0,
      total_rewarded: 0,
      total_coins_earned: 0,
      last_show: null,
    };
    this.save();
  }
}

export const adStore = new AdStore();
console.log('✅ AdStore v1.0.0 загружен');
