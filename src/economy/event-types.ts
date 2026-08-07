// ============================================
// src/economy/event-types.ts
// Описание: Типы событий для экономической системы
// Версия: 1.0.0
// ============================================

import type { UUID } from '@types';

/**
 * Событие: запрос на начисление монет
 */
export interface IEconomyEarnEvent {
  userId: number;
  source: string;           // 'game:tetris:high_score', 'referral:reward', etc.
  amount?: number;          // если не указано, берется из economy_rules
  metadata?: Record<string, any>;
  currency?: string;        // по умолчанию 'FIBI'
}

/**
 * Событие: запрос на списание монет
 */
export interface IEconomySpendEvent {
  userId: number;
  source: string;
  amount: number;
  metadata?: Record<string, any>;
  currency?: string;
}

/**
 * Событие: баланс обновлен (для UI)
 */
export interface IEconomyBalanceUpdatedEvent {
  userId: number;
  newBalance: number;
  delta: number;
  source: string;
  transactionId?: UUID;
}

/**
 * Событие: ошибка в экономической операции
 */
export interface IEconomyErrorEvent {
  userId: number;
  source: string;
  error: string;
  metadata?: Record<string, any>;
}
