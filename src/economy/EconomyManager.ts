// ============================================
// src/economy/EconomyManager.ts
// Упрощённый менеджер — только связь с API и обновление Store
// Версия: 2.0.0 - полностью переписан
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

    // Подписываемся на события
    this.subscribeToEvents();

    this.initialized = true;
    console.log('✅ EconomyManager v2.0.0 инициализирован (упрощённый)');
  }

  private subscribeToEvents(): void {
    // Запрос на начисление
    eventBus.on('economy:earn', this.handleEarn.bind(this));

    // Запрос на списание
    eventBus.on('economy:spend', this.handleSpend.bind(this));

    // Обновление пользователя
    eventBus.on('user:changed', this.onUserChanged.bind(this));

    console.log('📡 EconomyManager подписан на экономические события');
  }

  private onUserChanged(data: { userId: number }): void {
    this.userId = data.userId;
    // Загружаем баланс при смене пользователя
    this.loadBalance();
  }

  /**
   * Загрузить баланс текущего пользователя
   */
  async loadBalance(): Promise<void> {
    if (!this.userId) {
      // Пробуем получить из Telegram
      const tg = (window as any).Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      if (user?.id) {
        this.userId = user.id;
      } else {
        return;
      }
    }

    try {
      const result = await economyService.getBalance(this.userId);
      if (result.success) {
        economyStore.updateBalance(this.userId, result.balance);
        economyStore.setStats(result.total_earned, result.total_spent);
        console.log(`💰 Баланс загружен: ${result.balance}`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки баланса:', err);
    }
  }

  /**
   * Обработка начисления
   */
  private async handleEarn(
    event: IEconomyEarnEvent,
    sender: any,
    eventName: string
  ): Promise<void> {
    const { userId, source, amount: eventAmount, metadata } = event;

    console.log(`💰 [EconomyManager] Начисление: userId=${userId}, source=${source}`);

    try {
      // Определяем сумму
      const amount = eventAmount || 0;
      if (amount <= 0) {
        this.emitError(userId, source, 'Amount must be greater than 0');
        return;
      }

      // Вызываем API
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

      // Обновляем Store
      economyStore.updateBalance(userId, result.newBalance);

      // Генерируем событие об обновлении баланса
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

  /**
   * Обработка списания
   */
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

      // Вызываем API
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

      // Обновляем Store
      economyStore.updateBalance(userId, result.newBalance);

      // Генерируем событие об обновлении баланса
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

  /**
   * Отправить ошибку
   */
  private emitError(userId: number, source: string, error: string): void {
    const errorEvent: IEconomyErrorEvent = {
      userId,
      source,
      error,
    };
    eventBus.emit('economy:error', errorEvent);
    console.warn(`⚠️ [EconomyManager] Ошибка: ${error} (${source})`);
  }

  /**
   * Получить текущий баланс пользователя
   */
  async getBalance(userId: number): Promise<number> {
    const result = await economyService.getBalance(userId);
    return result.success ? result.balance : 0;
  }
}

// Создаём экземпляр
export const economyManager = new EconomyManager();

// Для глобального доступа
(window as any).economyManager = economyManager;
