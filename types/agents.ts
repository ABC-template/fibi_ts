// ============================================
// types/agents.ts
// Типы для конструктора ИИ-агентов
// Версия: 1.5.0 — IAiAgentWithAccess заменён на IPublicAgent: пользователю
//                  уходят только поля для интерфейса (без system_prompt, model_id, наценок по тарифам)
//          1.4.0 — добавлен generation_config
// ============================================

import { UUID, ISODateString } from './common';
import type { IGenerationConfig } from './generation';

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
  /**
   * Конфигурация формы генерации для image/video/audio агентов.
   * NULL для text-агентов.
   */
  generation_config: IGenerationConfig | null;
  owner_id: UUID | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/**
 * Агент для пользователя (GET /api/agents).
 * Только то, что нужно интерфейсу: без system_prompt, model_id и таблицы наценок.
 */
export interface IPublicAgent {
  id: UUID;
  slug: string;
  name: IAgentName;
  description: IAgentName | null;
  modality: AgentModality;
  welcome_message: IAgentName | null;
  /** Форма генерации (modes / params / prompt / negative_prompt / pricing); NULL для text */
  generation_config: IGenerationConfig | null;
  /** Тарифы с доступом; NULL или [] = всем авторизованным */
  allowed_tiers: string[] | null;
  /** Наценка для тарифа текущего пользователя (уже выбрана сервером) */
  markup: number;
  min_charge: number;
  sort_order: number;
  is_active: boolean;
  has_access: boolean;
  access_reason: 'auth' | 'tier' | 'inactive' | null;
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
  generation_config?: IGenerationConfig | null;
  is_active?: boolean;
  is_system?: boolean;
  sort_order?: number;
}
