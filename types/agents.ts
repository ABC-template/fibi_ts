// ============================================
// types/agents.ts
// Типы для конструктора ИИ-агентов
// Версия: 1.0.0
// ============================================

import { UUID, ISODateString } from './common';

export type AgentModality = 'text' | 'image' | 'video' | 'audio';

export type ProTier = 'basic' | 'plus' | 'ultra';

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
  system_prompt: string;
  markup_coefficient: number;
  min_charge: number;
  allowed_roles: string[];
  min_pro_tier: ProTier | null;
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
  access_reason?: 'role' | 'tier' | 'inactive' | null;
}

/** Данные для создания/обновления агента */
export interface IAiAgentInput {
  slug: string;
  name: IAgentName;
  description?: IAgentName | null;
  modality: AgentModality;
  model_id: string;
  system_prompt: string;
  markup_coefficient?: number;
  min_charge?: number;
  allowed_roles: string[];
  min_pro_tier?: ProTier | null;
  is_active?: boolean;
  is_system?: boolean;
  sort_order?: number;
}
