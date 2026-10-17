// ============================================
// src/economy/event-types.ts
// Описание: Типы событий для экономической системы
// Версия: 1.2.0 - удалён IEconomyEarnEvent (начисления с клиента нет)
//          1.1.0 - удалены IEconomySpendEvent и IEconomyErrorEvent
//          1.0.1 - замена @types → @app-types
// ============================================

import type { UUID } from '@app-types';

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
