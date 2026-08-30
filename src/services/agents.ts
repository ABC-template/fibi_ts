// ============================================
// src/services/agents.ts
// Описание: Работа с ИИ-агентами (админка + пользовательская часть)
// Версия: 1.0.0
// ============================================

import { api } from './api'; // предполагаю, что у вас есть общий api-хелпер
import type { IAiAgent, IAiAgentInput, IAiAgentWithAccess, AgentModality } from '../../types/agents';

export interface OpenRouterModelOption {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

/**
 * Получить список моделей OpenRouter по modality (только для админки)
 */
export async function fetchModelsByModality(modality: AgentModality): Promise<OpenRouterModelOption[]> {
  const res = await api.get(`/api/admin/agents/models?modality=${modality}`);
  if (!res.success) {
    throw new Error(res.error || 'Failed to load models');
  }
  return res.models || [];
}

/**
 * Получить все агенты (админка)
 */
export async function fetchAllAgents(): Promise<IAiAgent[]> {
  const res = await api.get('/api/admin/agents');
  if (!res.success) {
    throw new Error(res.error || 'Failed to load agents');
  }
  return res.agents || [];
}

/**
 * Получить активные агенты + флаг доступа (для пользователей)
 */
export async function fetchAgentsWithAccess(): Promise<{
  agents: IAiAgentWithAccess[];
  user_role: string;
  user_pro_tier: string | null;
}> {
  const res = await api.get('/api/agents');
  if (!res.success) {
    throw new Error(res.error || 'Failed to load agents');
  }
  return {
    agents: res.agents || [],
    user_role: res.user_role || 'guest',
    user_pro_tier: res.user_pro_tier || null,
  };
}

/**
 * Создать агента
 */
export async function createAgent(data: IAiAgentInput): Promise<IAiAgent> {
  const res = await api.post('/api/admin/agents', data);
  if (!res.success) {
    throw new Error(res.error || 'Failed to create agent');
  }
  return res.agent;
}

/**
 * Обновить агента
 */
export async function updateAgent(id: string, data: Partial<IAiAgentInput> & { is_active?: boolean }): Promise<IAiAgent> {
  const res = await api.patch(`/api/admin/agents/${id}`, data);
  if (!res.success) {
    throw new Error(res.error || 'Failed to update agent');
  }
  return res.agent;
}

/**
 * Переключить активность агента
 */
export async function toggleAgentActive(id: string, isActive: boolean): Promise<IAiAgent> {
  return updateAgent(id, { is_active: isActive });
}
