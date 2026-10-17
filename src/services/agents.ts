// ============================================
// src/services/agents.ts
// Описание: ИИ-агенты для пользователя — список с флагом доступа, кэш списка,
//           открытие нового чата с агентом
// Версия: 2.0.0 - кэш списка (сайдбар, раздел «Агенты»); openNewAgentChat — один способ
//                 начать чат с агентом (раздел «Агенты» и кнопка «Создать» в сайдбаре);
//                 значки типов агентов; удалены неиспользуемые функции админки
//                 (админка работает с /admin/agents напрямую)
//          1.1.0 - пользовательский список агентов типизирован как IPublicAgent
// ============================================

import { apiClient } from './api';
import { chatStore } from '@/store/ChatStore';
import { eventBus } from '@/core/event-bus';
import type { IPublicAgent, AgentModality } from '../../types/agents';
import type { TopicId } from '@app-types';

/** Значок типа агента */
export const AGENT_MODALITY_EMOJI: Record<AgentModality, string> = {
  text: '💬',
  image: '🖼️',
  video: '🎬',
  audio: '🎧',
};

/** Список агентов меняется редко: повторно запрашиваем не чаще раза в минуту */
const AGENTS_CACHE_MS = 60_000;

let cachedAgents: IPublicAgent[] | null = null;
let cachedAt = 0;
let inflight: Promise<IPublicAgent[]> | null = null;

/**
 * Получить активные агенты + флаг доступа (всегда с сервера; обновляет кэш)
 */
export async function fetchAgentsWithAccess(): Promise<{
  agents: IPublicAgent[];
  user_role: string;
  user_pro_tier: string | null;
}> {
  const res = await apiClient.get('/agents');
  if (!res.success) {
    throw new Error(res.error || 'Failed to load agents');
  }
  const agents: IPublicAgent[] = res.agents || [];
  cachedAgents = agents;
  cachedAt = Date.now();
  return {
    agents,
    user_role: res.user_role || 'guest',
    user_pro_tier: res.user_pro_tier || null,
  };
}

/** Последний загруженный список (null — ещё не загружался) */
export function getCachedAgents(): IPublicAgent[] | null {
  return cachedAgents;
}

/** Список из кэша, если он свежий; иначе — с сервера (параллельные вызовы ждут один запрос) */
export async function loadAgentsCached(): Promise<IPublicAgent[]> {
  if (cachedAgents && Date.now() - cachedAt < AGENTS_CACHE_MS) return cachedAgents;
  if (!inflight) {
    inflight = fetchAgentsWithAccess()
      .then((data) => data.agents)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Новый чат с агентом (старые — в сайдбаре и избранном). Название чат получит
 * из первого сообщения. false — чат создать не удалось.
 */
export function openNewAgentChat(agent: IPublicAgent): boolean {
  const chat = chatStore.createTempChat(agent.slug as TopicId, {
    agent_id: agent.id,
    modality: agent.modality,
  });
  if (!chat) return false;
  eventBus.emit('navigation:open_chat', { chatId: chat.id, topic: agent.slug });
  return true;
}
