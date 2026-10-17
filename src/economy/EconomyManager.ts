// ============================================
// src/economy/EconomyManager.ts
// Упрощённый менеджер — только связь с API и обновление Store
// Версия: 3.4.0 — удалён заглушечный обработчик economy:earn (событие никто не отправляет:
//                 монеты начисляет сервер)
//          3.3.0 — удалено списание с клиента (economy:spend / handleSpend / economy:error)
//          3.2.0 — монеты начисляет только сервер: игры шлют economy:game,
//                 economy:earn с клиента больше не исполняется
//          3.1.0 — spent_today/daily_limit/bypass - исправлен total
// ============================================

import { eventBus } from '@/core/event-bus';
import { economyService } from './EconomyService';
import { economyStore } from './EconomyStore';
import type {
  IEconomyGameEvent,
  IEconomyBalanceUpdatedEvent,
} from './event-types';

export class EconomyManager {
  private initialized: boolean = false;
  private userId: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.initialized) return;
    this.subscribeToEvents();
    this.initialized = true;
  }

  private subscribeToEvents(): void {
    eventBus.on('economy:game', this.handleGame.bind(this));
    eventBus.on('user:changed', this.onUserChanged.bind(this));
    console.log('📡 EconomyManager подписан на экономические события');
  }

  private onUserChanged(data: { userId: number }): void {
    this.userId = data.userId;
    this.loadBalance();
  }

  async loadBalance(): Promise<void> {
    if (!this.userId) {
      const tg = (window as any).Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      if (user?.id) this.userId = user.id;
      else return;
    }

    try {
      const result = await economyService.getFullBalance(this.userId);
      if (result.success) {
        economyStore.updateCoinBalance(result.coins.balance);
        economyStore.updateTokenBalances(
          result.tokens.bonus,
          result.tokens.permanent,
          {
            spent_today: result.tokens.spent_today,
            daily_limit: result.tokens.daily_limit,
            bypass: result.tokens.bypass,
          }
        );
        const tokenTotal = (result.tokens?.bonus || 0) + (result.tokens?.permanent || 0);
        console.log(`💰 Балансы загружены: ${result.coins.balance} 🪙, ${tokenTotal} ⚡`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки балансов:', err);
    }
  }

  private async handleGame(event: IEconomyGameEvent): Promise<void> {
    if (!event?.event) return;

    const result = await economyService.awardGameCoins(event.event, event.metadata || {});
    const toast = (window as any).uiRenderer?.showToast?.bind((window as any).uiRenderer);

    if (!result.success) {
      console.warn(`⚠️ [EconomyManager] Игра: ${result.error || 'ошибка'} (${event.event})`);
      return;
    }

    if (result.awarded > 0) {
      if (typeof result.newBalance === 'number') {
        economyStore.updateCoinBalance(result.newBalance);
        const balanceEvent: IEconomyBalanceUpdatedEvent = {
          userId: this.userId || 0,
          newBalance: result.newBalance,
          delta: result.awarded,
          source: 'game:' + event.event,
        };
        eventBus.emit('economy:balance:updated', balanceEvent);
      }
      toast?.(`+${result.awarded} 🪙`, 'success', 1800);
    } else if (result.reason === 'daily_cap') {
      toast?.('🪙 Лимит монет из игр на сегодня исчерпан', 'info', 2200);
    }
  }

  async getBalance(userId: number): Promise<number> {
    const result = await economyService.getFullBalance(userId);
    return result.success ? result.coins.balance : 0;
  }
}

export const economyManager = new EconomyManager();
(window as any).economyManager = economyManager;
