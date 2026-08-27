// ============================================
// src/economy/EconomyManager.ts
// Упрощённый менеджер — только связь с API и обновление Store
// Версия: 3.0.1 - исправлен total
// ============================================

import { eventBus } from '@/core/event-bus';
import { economyService } from './EconomyService';
import { economyStore } from './EconomyStore';
import type {
  IEconomyEarnEvent,
  IEconomySpendEvent,
  IEconomyBalanceUpdatedEvent,
  IEconomyErrorEvent,
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
    console.log('✅ EconomyManager v3.0.1 инициализирован');
  }

  private subscribeToEvents(): void {
    eventBus.on('economy:earn', this.handleEarn.bind(this));
    eventBus.on('economy:spend', this.handleSpend.bind(this));
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
        economyStore.updateTokenBalances(result.tokens.bonus, result.tokens.permanent);
        const tokenTotal = (result.tokens?.bonus || 0) + (result.tokens?.permanent || 0);
        console.log(`💰 Балансы загружены: ${result.coins.balance} 🪙, ${tokenTotal} ⚡`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки балансов:', err);
    }
  }

  private async handleEarn(
    event: IEconomyEarnEvent,
    sender: any,
    eventName: string
  ): Promise<void> {
    const { userId, source, amount: eventAmount, metadata } = event;

    console.log(`💰 [EconomyManager] Начисление: userId=${userId}, source=${source}`);

    try {
      const amount = eventAmount || 0;
      if (amount <= 0) {
        this.emitError(userId, source, 'Amount must be greater than 0');
        return;
      }

      const result = await economyService.addCoins(
        userId,
        amount,
        source,
        `Награда за ${source}`,
        metadata
      );

      if (!result.success) {
        this.emitError(userId, source, result.error || 'Failed to add coins');
        return;
      }

      economyStore.updateCoinBalance(result.newBalance);

      const balanceEvent: IEconomyBalanceUpdatedEvent = {
        userId,
        newBalance: result.newBalance,
        delta: result.delta || amount,
        source,
        transactionId: result.transactionId,
      };
      eventBus.emit('economy:balance:updated', balanceEvent);

      console.log(`✅ Начислено ${amount} монет пользователю ${userId} (${source})`);
    } catch (err) {
      console.error('❌ Ошибка в handleEarn:', err);
      this.emitError(userId, source, (err as Error).message);
    }
  }

  private async handleSpend(
    event: IEconomySpendEvent,
    sender: any,
    eventName: string
  ): Promise<void> {
    const { userId, source, amount, metadata } = event;

    console.log(`💰 [EconomyManager] Списание: userId=${userId}, source=${source}, amount=${amount}`);

    try {
      if (amount <= 0) {
        this.emitError(userId, source, 'Amount must be greater than 0');
        return;
      }

      const result = await economyService.spendCoins(
        userId,
        amount,
        source,
        `Списание за ${source}`,
        metadata
      );

      if (!result.success) {
        this.emitError(userId, source, result.error || 'Failed to spend coins');
        return;
      }

      economyStore.updateCoinBalance(result.newBalance);

      const balanceEvent: IEconomyBalanceUpdatedEvent = {
        userId,
        newBalance: result.newBalance,
        delta: result.delta || -amount,
        source,
        transactionId: result.transactionId,
      };
      eventBus.emit('economy:balance:updated', balanceEvent);

      console.log(`✅ Списано ${amount} монет у пользователя ${userId} (${source})`);
    } catch (err) {
      console.error('❌ Ошибка в handleSpend:', err);
      this.emitError(userId, source, (err as Error).message);
    }
  }

  private emitError(userId: number, source: string, error: string): void {
    const errorEvent: IEconomyErrorEvent = {
      userId,
      source,
      error,
    };
    eventBus.emit('economy:error', errorEvent);
    console.warn(`⚠️ [EconomyManager] Ошибка: ${error} (${source})`);
  }

  async getBalance(userId: number): Promise<number> {
    const result = await economyService.getFullBalance(userId);
    return result.success ? result.coins.balance : 0;
  }
}

export const economyManager = new EconomyManager();
(window as any).economyManager = economyManager;
