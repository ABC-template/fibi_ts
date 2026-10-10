// ============================================
// types/agents.ts
// Типы для конструктора ИИ-агентов
// Версия: 1.3.0 — multi-tier access, markup_by_tier, welcome_message, inject_balance
// ============================================

import { UUID, ISODateString } from './common';

export type AgentModality = 'text' | 'image' | 'video' | 'audio';

export type ProTier = 'trial' | 'basic' | 'plus' | 'pro' | 'ultra';

export interface IAgentName {
  ru: string;
  en?: string;
  it?: string;
  [key: string]: string | undefined;
}

export interface IAiAgent {
  id: UUID;
  slug: string;
  name: IAgentName;
  description?: IAgentName | null;
  modality: AgentModality;
  model_id: string;
  /** Окно контекста модели в токенах (от OpenRouter) */
  context_length: number | null;
  system_prompt: string;
  /** Базовый markup (fallback, если нет значения в markup_by_tier) */
  markup_coefficient: number;
  min_charge: number;
  /** @deprecated не используется в проверке доступа с v3.0.0 */
  allowed_roles: string[];
  /** @deprecated используйте allowed_tiers */
  min_pro_tier: ProTier | null;
  /**
   * Массив tier_key, которым разрешён доступ.
   * NULL или [] = доступен всем авторизованным.
   */
  allowed_tiers: string[] | null;
  /**
   * Наценка по тарифу пользователя.
   * Пример: { "trial": 2.5, "basic": 1.8, "pro": 1.2 }
   * Если для текущего tier ключа нет — используется markup_coefficient.
   */
  markup_by_tier: Record<string, number> | null;
  /**
   * Приветственное сообщение (i18n).
   * Показывается по центру при создании нового чата.
   * NULL = не показывать.
   */
  welcome_message: IAgentName | null;
  /**
   * Если true — перед стримом в system prompt добавляется
   * текущий баланс энергии пользователя.
   */
  inject_balance: boolean;
  owner_id: UUID | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Агент с информацией о доступе для текущего пользователя */
export interface IAiAgentWithAccess extends IAiAgent {
  has_access: boolean;
  access_reason?: 'auth' | 'tier' | 'inactive' | null;
}

/** Данные для создания/обновления агента */
export interface IAiAgentInput {
  slug: string;
  name: IAgentName;
  description?: IAgentName | null;
  modality: AgentModality;
  model_id: string;
  context_length?: number | null;
  system_prompt: string;
  markup_coefficient?: number;
  min_charge?: number;
  /** @deprecated */
  allowed_roles?: string[];
  /** @deprecated */
  min_pro_tier?: ProTier | null;
  allowed_tiers?: string[] | null;
  markup_by_tier?: Record<string, number> | null;
  welcome_message?: IAgentName | null;
  inject_balance?: boolean;
  is_active?: boolean;
  is_system?: boolean;
  sort_order?: number;
}
