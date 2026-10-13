// ============================================
// src/modules/ad/AdModule.ts
// Реклама Adsgram (rewarded): показ и награда монетами.
// Версия: 3.0.0
//   - монеты начисляет только Reward URL Adsgram (сервер → сервер); приложение после
//     досмотра лишь ждёт начисления (опрос состояния до ~12 с) и обновляет баланс.
//     Начисление по запросу приложения убрано: его можно было вызвать без рекламы
//   2.0.0
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
  blockId: string | null;
  amount: number;
  dailyLimit: number;
  /** Сколько наград уже получено сегодня (по нему видно, что Adsgram начислил) */
  usedToday: number;
  remainingToday: number;
  waitSeconds: number;
}

/** Ждём начисления от Adsgram: столько попыток с таким шагом */
const AWARD_POLL_ATTEMPTS = 6;
const AWARD_POLL_STEP_MS = 2000;

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
        blockId: res.blockId || null,
        amount: Number(res.amount) || 0,
        dailyLimit: Number(res.dailyLimit) || 0,
        usedToday: Number(res.usedToday) || 0,
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
   * Показать rewarded-рекламу. Награду начисляет Adsgram через Reward URL;
   * здесь — показ, ожидание начисления и обновление баланса.
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

      // Награду начисляет Adsgram через Reward URL — ждём, пока она появится
      const awarded = await this._waitForAward(status.usedToday, status.amount);
      if (awarded) {
        toast?.(`🎉 +${status.amount} 🪙 за просмотр`, 'success', 2000);
        return { shown: true, awarded: status.amount };
      }
      // Adsgram иногда сообщает с задержкой — обновим баланс ещё раз позже
      setTimeout(() => void this._reloadBalance(), 30_000);
      toast?.('🎬 Спасибо! Монеты поступят в течение минуты', 'info', 2500);
      return { shown: true, awarded: 0, reason: 'pending' };
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

  /** true — начисление пришло (счётчик наград за день вырос); баланс обновлён */
  private async _waitForAward(usedBefore: number, amount: number): Promise<boolean> {
    for (let i = 0; i < AWARD_POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, AWARD_POLL_STEP_MS));
      const st = await this.getStatus(true);
      if (st && st.usedToday > usedBefore) {
        await this._reloadBalance();
        eventBus.emit('economy:balance:updated', {
          userId: 0,
          newBalance: (window as any).economyStore?.getCoinBalance?.() ?? 0,
          delta: amount,
          source: 'ad:rewarded',
        });
        return true;
      }
    }
    return false;
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
