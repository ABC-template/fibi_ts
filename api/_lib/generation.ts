// ============================================
// api/_lib/generation.ts
// Общая логика генеративных агентов: загрузка агента + доступ,
// режим, валидация параметров и промптов по generation_config.
// Используется в api/generations/create.ts и api/media/upload-url.ts,
// чтобы правила не расходились.
// Версия: 1.1.0 — заблокированный пользователь и тариф trial (в т.ч. истёкшая
//                 подписка) к генерации не допускаются
//          1.0.0
// ============================================

import { supabaseFetch, supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { checkAgentAccess } from './agent-access';
import { HttpError } from './http-error';
import { MEDIA_LIMITS, UUID_RE } from './media';

export type GenerationParamValue = string | number | boolean;

/** Загружает генеративного агента и проверяет доступ пользователя */
export async function loadGenerativeAgent(
  agentId: unknown,
  userId: number,
  config: ISupabaseConfig
): Promise<{ agent: any; user: any }> {
  if (typeof agentId !== 'string' || !UUID_RE.test(agentId)) {
    throw new HttpError(400, 'Invalid agent_id');
  }

  const agents = await supabaseFetch(
    `ai_agents?id=eq.${agentId}&select=*`,
    { method: 'GET' },
    config
  );
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new HttpError(404, 'Agent not found');
  }

  const agent = agents[0];
  if (!agent.is_active) throw new HttpError(403, 'Agent is inactive');
  if (!['image', 'video', 'audio'].includes(agent.modality)) {
    throw new HttpError(400, 'Agent modality is not generative');
  }

  const userRes = await supabaseFetch(
    `users?telegram_id=eq.${userId}&select=role,subscription_tier,premium_until`,
    { method: 'GET' },
    config
  );
  const user = Array.isArray(userRes) ? userRes[0] : null;

  const blocked = await supabaseRPC('is_user_blocked', { p_user_id: userId }, config).catch(() => false);
  if (blocked === true) {
    throw new HttpError(403, 'Доступ к приложению ограничен администратором');
  }

  // Подписка истекла, а роль в БД ещё не обновлена (обновится при входе) — считаем trial
  const expired = user?.premium_until && new Date(user.premium_until).getTime() < Date.now();
  const tier = expired ? 'trial' : (user?.subscription_tier || null);

  const access = checkAgentAccess(agent, user?.role, tier);
  if (!access.hasAccess && access.reason === 'tier') {
    throw new HttpError(403, 'Генерация доступна на платном тарифе');
  }
  if (!access.hasAccess) {
    throw new HttpError(403, `Access denied: ${access.reason}`);
  }

  return { agent, user };
}

/**
 * Режим из generation_config. Если у агента режимов нет — null.
 * Если режимы есть, ключ обязателен и должен существовать.
 */
export function resolveMode(gen: any, modeKey: unknown): any | null {
  const modes: any[] = Array.isArray(gen?.modes) ? gen.modes : [];
  if (modes.length === 0) return null;

  const key = typeof modeKey === 'string' ? modeKey : '';
  const mode = modes.find((m) => m?.key === key);
  if (!mode) throw new HttpError(400, 'Unknown or missing mode');
  return mode;
}

/** Принимает ли режим изображения-референсы */
export function modeAcceptsImages(mode: any | null): boolean {
  return !!mode && Array.isArray(mode.media_types) && mode.media_types.includes('image');
}

/** Сколько референсов разрешено в этом режиме */
export function maxInputsForMode(mode: any | null): number {
  const own = Number(mode?.max_media);
  const limit = Number.isFinite(own) && own > 0 ? own : MEDIA_LIMITS.maxInputsPerRequest;
  return Math.min(limit, MEDIA_LIMITS.maxInputsPerRequest);
}

/** Проверка и очистка params по описанию из generation_config. Неизвестные ключи — ошибка. */
export function validateParams(
  gen: any,
  rawParams: unknown
): Record<string, GenerationParamValue> {
  const raw: Record<string, any> =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? (rawParams as Record<string, any>)
      : {};

  const defs: any[] = Array.isArray(gen?.params) ? gen.params : [];
  const hasModes = Array.isArray(gen?.modes) && gen.modes.length > 0;

  const known = new Set<string>(defs.map((d) => d.key));
  if (hasModes) known.add('mode');

  for (const key of Object.keys(raw)) {
    if (!known.has(key)) throw new HttpError(400, `Unknown param: ${key}`);
  }

  const out: Record<string, GenerationParamValue> = {};
  if (hasModes && typeof raw.mode === 'string') out.mode = raw.mode;

  for (const def of defs) {
    const key: string = def.key;
    const v = raw[key];
    const empty = v === undefined || v === null || v === '';

    if (empty) {
      if (def.required) throw new HttpError(400, `Param is required: ${key}`);
      continue;
    }

    switch (def.type) {
      case 'select': {
        const options: string[] = (Array.isArray(def.options) ? def.options : []).map((o: any) =>
          typeof o === 'string' ? o : o?.value
        );
        if (!options.includes(String(v))) throw new HttpError(400, `Invalid value for param: ${key}`);
        out[key] = String(v);
        break;
      }
      case 'number':
      case 'slider': {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new HttpError(400, `Invalid number for param: ${key}`);
        if (typeof def.min === 'number' && n < def.min) throw new HttpError(400, `Param below minimum: ${key}`);
        if (typeof def.max === 'number' && n > def.max) throw new HttpError(400, `Param above maximum: ${key}`);
        out[key] = n;
        break;
      }
      case 'boolean': {
        if (typeof v !== 'boolean') throw new HttpError(400, `Invalid boolean for param: ${key}`);
        out[key] = v;
        break;
      }
      default: {
        if (typeof v !== 'string') throw new HttpError(400, `Invalid text for param: ${key}`);
        const max = typeof def.max_length === 'number' ? def.max_length : 500;
        if (v.length > max) throw new HttpError(400, `Param too long: ${key}`);
        out[key] = v;
      }
    }
  }

  return out;
}

/** Проверка промпта и негативного промпта по generation_config */
export function validatePrompts(
  gen: any,
  prompt: unknown,
  negativePrompt: unknown
): { prompt: string; negative: string | null } {
  const p = typeof prompt === 'string' ? prompt.trim() : '';
  if (!p) throw new HttpError(400, 'prompt is required');

  const promptMax = typeof gen?.prompt?.max_length === 'number' ? gen.prompt.max_length : 4000;
  if (p.length > promptMax) throw new HttpError(400, 'prompt is too long');

  const n = typeof negativePrompt === 'string' ? negativePrompt.trim() : '';
  if (n) {
    if (!gen?.negative_prompt?.enabled) {
      throw new HttpError(400, 'Negative prompt is not supported by this agent');
    }
    const negMax =
      typeof gen.negative_prompt.max_length === 'number' ? gen.negative_prompt.max_length : 2000;
    if (n.length > negMax) throw new HttpError(400, 'negative_prompt is too long');
  }

  return { prompt: p, negative: n || null };
}
