// ============================================
// types/tasks.ts
// Типы для системы заданий и геймификации
// ============================================

import { UUID } from './common';

/** Ежедневное задание */
export interface IDailyQuest {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
  type: 'daily';
  bonus?: boolean;
}

/** Достижение */
export interface IAchievement {
  id: string;
  title: string;
  description: string;
  reward: number;
  unlocked: boolean;
  claimed: boolean;
  progress: number;
  target: number;
}

/** Результат обмена валюты */
export interface IExchangeResult {
  success: boolean;
  message?: string;
  tokens?: number;
  coins?: number;
}

/** Результат ежедневного бонуса */
export interface IDailyBonusResult {
  bonus: number;
  streak: number;
}

/** Обновление прогресса */
export interface IProgressUpdate {
  questId?: string;
  achievementId?: string;
  progress: number;
  target: number;
  completed: boolean;
}
