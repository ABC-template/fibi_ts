// ============================================
// src/modules/ad/AdModule.ts
// Реклама Adsgram (rewarded): показ и награда монетами.
// Версия: 2.0.0
//   - настоящий SDK Adsgram (sad.min.js, Adsgram.init({ blockId }).show())
//     вместо несуществующих showRewardedAd/showInterstitialAd
//   - blockId и состояние (сумма, остаток на сегодня, ожидание) — с сервера
//     (GET /api/ads/reward); SDK загружается при первом показе, не при старте
//   - монеты начисляет сервер: после досмотра POST /api/ads/reward (режим client)
//     или Reward URL Adsgram (режим server — тогда только обновляем баланс)
// ============================================

import { eventBus } from '@/core/event-bus';
import { apiClient } from '@/services/api';

const SDK_URL = 'https://sad.adsgram.ai/js/sad.min.js';

export interface IAdStatus {
  enabled: boolean;
  mode: 'client' | 'server';
  blockId: string | null;
  amount: number;
  dailyLimit: number;
  remainingToday: number;
  waitSeconds: number;
}

export interface IAdRewardResult {
  shown: boolean;
  awarded: number;
  reason?: string | null;
  error?: string;
}

export class AdModule {
  private sdkPromise: Promise<void> | null = null;
  private controller: any = null;
  private controllerBlockId: string | null = null;
  private busy = false;
  private status: IAdStatus | null = null;

  constructor() {
    eventBus.on('ad:show:rewarded', () => {
      void this.showRewarded();
    });
  }

  /** Совместимость со стартом приложения: ничего не грузим заранее */
  async init(): Promise<void> {
    eventBus.emit('ad:initialized', { success: true });
  }

  /** Состояние кнопки «Смотреть рекламу» */
  async getStatus(force = false): Promise<IAdStatus | null> {
    if (this.status && !force) return this.status;
    try {
      const res = await apiClient.get('/ads/reward');
      if (!res?.success) return null;
      this.status = {
        enabled: res.enabled === true,
        mode: res.mode === 'server' ? 'server' : 'client',
        blockId: res.blockId || null,
        amount: Number(res.amount) || 0,
        dailyLimit: Number(res.dailyLimit) || 0,
        remainingToday: Number(res.remainingToday) || 0,
        waitSeconds: Number(res.waitSeconds) || 0,
      };
      return this.status;
    } catch (err) {
      console.warn('⚠️ [Ad] Не удалось получить состояние рекламы:', err);
      return null;
    }
  }

  getCachedStatus(): IAdStatus | null {
    return this.status;
  }

  private _loadSdk(): Promise<void> {
    if ((window as any).Adsgram) return Promise.resolve();
    if (this.sdkPromise) return this.sdkPromise;

    this.sdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => ((window as any).Adsgram ? resolve() : reject(new Error('Adsgram SDK не найден')));
      script.onerror = () => reject(new Error('Не удалось загрузить рекламу'));
      document.head.appendChild(script);
    }).catch((err) => {
      this.sdkPromise = null;
      throw err;
    });
    return this.sdkPromise;
  }

  private _getController(blockId: string): any {
    if (this.controller && this.controllerBlockId === blockId) return this.controller;
    this.controller = (window as any).Adsgram.init({ blockId });
    this.controllerBlockId = blockId;
    return this.controller;
  }

  /**
   * Показать rewarded-рекламу. Награду начисляет сервер; здесь — показ,
   * запрос награды и обновление баланса.
   */
  async showRewarded(): Promise<IAdRewardResult> {
    if (this.busy) return { shown: false, awarded: 0, error: 'Реклама уже показывается' };
    this.busy = true;
    const toast = (window as any).uiRenderer?.showToast?.bind((window as any).uiRenderer);

    try {
      const status = await this.getStatus(true);
      if (!status?.enabled || !status.blockId) {
        return { shown: false, awarded: 0, error: 'Реклама сейчас недоступна' };
      }
      if (status.remainingToday <= 0) {
        toast?.('🎬 Лимит просмотров на сегодня исчерпан', 'info', 2200);
        return { shown: false, awarded: 0, reason: 'daily_limit' };
      }
      if (status.waitSeconds > 0) {
        toast?.(`⏳ Следующая реклама через ${status.waitSeconds} с`, 'info', 2000);
        return { shown: false, awarded: 0, reason: 'too_soon' };
      }

      await this._loadSdk();
      const controller = this._getController(status.blockId);

      let done = false;
      try {
        const result = await controller.show();
        done = result?.done === true;
      } catch (result: any) {
        // Пропуск, ошибка или нет рекламы: show() отклоняется
        const description = result?.description || '';
        console.log('ℹ️ [Ad] Реклама не досмотрена:', description || result);
        return { shown: true, awarded: 0, reason: 'not_completed' };
      }

      if (!done) return { shown: true, awarded: 0, reason: 'not_completed' };

      if (status.mode === 'server') {
        // Награда придёт через Reward URL — обновим баланс чуть позже
        setTimeout(() => void this._reloadBalance(), 2500);
        toast?.(`🎉 Спасибо! +${status.amount} 🪙 скоро поступят`, 'success', 2200);
        return { shown: true, awarded: 0, reason: 'server_mode' };
      }

      const res = await apiClient.post('/ads/reward', {});
      const awarded = Number(res?.awarded) || 0;

      if (awarded > 0) {
        if (typeof res.newBalance === 'number') {
          const store = (window as any).economyStore;
          store?.updateCoinBalance?.(res.newBalance);
          eventBus.emit('economy:balance:updated', {
            userId: 0,
            newBalance: res.newBalance,
            delta: awarded,
            source: 'ad:rewarded',
          });
        }
        toast?.(`🎉 +${awarded} 🪙 за просмотр`, 'success', 2000);
      } else if (res?.reason === 'daily_limit') {
        toast?.('🎬 Лимит просмотров на сегодня исчерпан', 'info', 2200);
      } else if (res?.reason === 'too_soon') {
        toast?.('⏳ Слишком часто — попробуйте чуть позже', 'info', 2000);
      }

      return { shown: true, awarded, reason: res?.reason || null };
    } catch (err) {
      const message = (err as Error).message || 'Ошибка рекламы';
      console.error('❌ [Ad]', message);
      toast?.(`⚠️ ${message}`, 'error', 2000);
      return { shown: false, awarded: 0, error: message };
    } finally {
      this.busy = false;
      void this.getStatus(true).then(() => eventBus.emit('ad:status_updated', this.status));
    }
  }

  private async _reloadBalance(): Promise<void> {
    try {
      const store = (window as any).economyStore;
      await store?.loadBalances?.();
      eventBus.emit('economy:balance:loaded', { balance: store?.getCoinBalance?.() ?? 0 });
    } catch {
      // не критично
    }
  }
}

export const adModule = new AdModule();
(window as any).adModule = adModule;
