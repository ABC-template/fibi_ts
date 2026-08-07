// ============================================
// src/economy/EconomyManager.ts
// Описание: Центральный менеджер экономических операций
// Версия: 1.0.0
// ============================================

import { eventBus } from '@/core/event-bus';
import { economyService } from './EconomyService';
import { economyStore } from './EconomyStore';
import type { 
  IEconomyEarnEvent, 
  IEconomySpendEvent, 
  IEconomyBalanceUpdatedEvent,
  IEconomyErrorEvent 
} from './event-types';

// Дефолтные правила (fallback, если в БД нет)
const DEFAULT_RULES: Record<string, { amount: number; cooldown: number; maxPerUser: number | null }> = {
  'game:tetris:high_score': { amount: 30, cooldown: 0, maxPerUser: null },
  'game:tetris:achievement': { amount: 10, cooldown: 0, maxPerUser: 10 },
  'game:sudoku:win': { amount: 20, cooldown: 0, maxPerUser: null },
  'referral:reward': { amount: 0, cooldown: 0, maxPerUser: null },
  'daily:bonus': { amount: 2, cooldown: 24, maxPerUser: 1 },
  'task:daily': { amount: 5, cooldown: 24, maxPerUser: 1 },
  'achievement:unlock': { amount: 15, cooldown: 0, maxPerUser: null },
  'sponsor:task': { amount: 0, cooldown: 0, maxPerUser: null },
  'admin:manual': { amount: 0, cooldown: 0, maxPerUser: null },
};

interface IRule {
  id: string;
  source: string;
  amount: number;
  cooldown_hours: number;
  max_per_user: number | null;
  is_active: boolean;
}

export class EconomyManager {
  private initialized: boolean = false;
  private rulesCache: Map<string, IRule> = new Map();
  private cooldownCache: Map<string, number> = new Map(); // userId:source -> timestamp

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.initialized) return;

    // Подписываемся на события
    this.subscribeToEvents();
    
    // Загружаем правила из БД
    this.loadRules();

    this.initialized = true;
    console.log('✅ EconomyManager инициализирован');
  }

  private subscribeToEvents(): void {
    // Запрос на начисление
    eventBus.on('economy:earn', this.handleEarn.bind(this));
    
    // Запрос на списание
    eventBus.on('economy:spend', this.handleSpend.bind(this));
    
    console.log('📡 EconomyManager подписан на экономические события');
  }

  /**
   * Загрузить правила из БД
   */
  private async loadRules(): Promise<void> {
    try {
      const { supabaseFetch } = await import('@api/_lib/supabase-client');
      const { getSupabaseConfig } = await import('@api/_lib/supabase-client');
      
      const config = getSupabaseConfig('service');
      const result = await supabaseFetch(
        'economy_rules?is_active=eq.true',
        { method: 'GET' },
        config
      );

      if (result && Array.isArray(result)) {
        this.rulesCache.clear();
        for (const rule of result) {
          this.rulesCache.set(rule.source, rule);
        }
        console.log(`✅ Загружено ${this.rulesCache.size} правил из БД`);
      }
    } catch (err) {
      console.warn('⚠️ Не удалось загрузить правила из БД, используем fallback');
    }
  }

  /**
   * Получить правило (с fallback)
   */
  private getRule(source: string): { amount: number; cooldown: number; maxPerUser: number | null } {
    const dbRule = this.rulesCache.get(source);
    
    if (dbRule) {
      return {
        amount: dbRule.amount,
        cooldown: dbRule.cooldown_hours,
        maxPerUser: dbRule.max_per_user,
      };
    }

    // Fallback на дефолтные правила
    const defaultRule = DEFAULT_RULES[source];
    if (defaultRule) {
      return defaultRule;
    }

    // Если правила нет нигде — возвращаем безопасное значение
    console.warn(`⚠️ Нет правила для источника: ${source}, используем дефолт (0)`);
    return { amount: 0, cooldown: 0, maxPerUser: null };
  }

  /**
   * Обработка начисления
   */
  private async handleEarn(event: IEconomyEarnEvent, sender: any, eventName: string): Promise<void> {
    const { userId, source, amount: eventAmount, metadata, currency } = event;

    console.log(`💰 [EconomyManager] Начисление: userId=${userId}, source=${source}`);

    try {
      // 1. Проверяем, не заблокирован ли пользователь
      const isLocked = await economyService.isUserLocked(userId);
      if (isLocked) {
        this.emitError(userId, source, 'User is locked from economy operations');
        return;
      }

      // 2. Получаем правило
      const rule = this.getRule(source);
      
      // 3. Определяем сумму (из события или из правила)
      const amount = eventAmount || rule.amount;
      if (amount <= 0) {
        this.emitError(userId, source, 'Amount must be greater than 0');
        return;
      }

      // 4. Проверяем кулдаун
      if (rule.cooldown > 0) {
        const cacheKey = `${userId}:${source}`;
        const lastEarn = this.cooldownCache.get(cacheKey) || 0;
        const cooldownMs = rule.cooldown * 3600000;
        
        if (Date.now() - lastEarn < cooldownMs) {
          const remaining = Math.ceil((cooldownMs - (Date.now() - lastEarn)) / 60000);
          this.emitError(userId, source, `Cooldown active. ${remaining} minutes remaining`);
          return;
        }
      }

      // 5. Проверяем лимит на пользователя
      if (rule.maxPerUser !== null) {
        // TODO: реализовать проверку лимита через БД
        // Пока пропускаем
      }

      // 6. Выполняем начисление
      const description = `Награда за ${source}`;
      const result = await economyService.addCoins(userId, amount, source, description, metadata);

      if (!result.success) {
        this.emitError(userId, source, result.error || 'Failed to add coins');
        return;
      }

      // 7. Сохраняем в кэш для кулдауна
      if (rule.cooldown > 0) {
        this.cooldownCache.set(`${userId}:${source}`, Date.now());
      }

      // 8. Генерируем событие об обновлении баланса
      const balanceEvent: IEconomyBalanceUpdatedEvent = {
        userId,
        newBalance: result.newBalance,
        delta: amount,
        source,
        transactionId: result.transactionId,
      };
      eventBus.emit('economy:balance:updated', balanceEvent);

      // 9. Обновляем локальный кэш
      economyStore.updateBalance(userId, result.newBalance);

      console.log(`✅ Начислено ${amount} монет пользователю ${userId} (${source})`);

    } catch (err) {
      console.error('❌ Ошибка в handleEarn:', err);
      this.emitError(userId, source, (err as Error).message);
    }
  }

  /**
   * Обработка списания
   */
  private async handleSpend(event: IEconomySpendEvent, sender: any, eventName: string): Promise<void> {
    const { userId, source, amount, metadata } = event;

    console.log(`💰 [EconomyManager] Списание: userId=${userId}, source=${source}, amount=${amount}`);

    try {
      // 1. Проверяем, не заблокирован ли пользователь
      const isLocked = await economyService.isUserLocked(userId);
      if (isLocked) {
        this.emitError(userId, source, 'User is locked from economy operations');
        return;
      }

      // 2. Проверяем сумму
      if (amount <= 0) {
        this.emitError(userId, source, 'Amount must be greater than 0');
        return;
      }

      // 3. Выполняем списание
      const description = `Списание за ${source}`;
      const result = await economyService.spendCoins(userId, amount, source, description, metadata);

      if (!result.success) {
        this.emitError(userId, source, result.error || 'Failed to spend coins');
        return;
      }

      // 4. Генерируем событие об обновлении баланса
      const balanceEvent: IEconomyBalanceUpdatedEvent = {
        userId,
        newBalance: result.newBalance,
        delta: -amount,
        source,
        transactionId: result.transactionId,
      };
      eventBus.emit('economy:balance:updated', balanceEvent);

      // 5. Обновляем локальный кэш
      economyStore.updateBalance(userId, result.newBalance);

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
   * Перезагрузить правила из БД
   */
  async reloadRules(): Promise<void> {
    console.log('🔄 Перезагрузка правил...');
    await this.loadRules();
  }

  /**
   * Получить текущий баланс пользователя
   */
  async getBalance(userId: number): Promise<number> {
    return economyService.getBalance(userId);
  }

  /**
   * Очистить кэш
   */
  clearCache(): void {
    this.cooldownCache.clear();
    console.log('🧹 Кэш EconomyManager очищен');
  }
}

// Создаем экземпляр
export const economyManager = new EconomyManager();

// Для глобального доступа (временно, для отладки)
(window as any).economyManager = economyManager;
