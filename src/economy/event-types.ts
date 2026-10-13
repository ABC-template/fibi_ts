// ============================================
// src/economy/event-types.ts
// Описание: Типы событий для экономической системы
// Версия: 1.1.0 - удалены IEconomySpendEvent и IEconomyErrorEvent
//          1.0.1 - замена @types → @app-types
// ============================================

import type { UUID } from '@app-types';

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
 * Событие игры. Сумму монет и суточный потолок определяет сервер
 * (economy_rules: source = 'game:' + event).
 */
export interface IEconomyGameEvent {
  event: string;            // 'tetris:high_score', 'tetris:achievement:line10', 'sudoku:win'
  metadata?: Record<string, any>;
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
