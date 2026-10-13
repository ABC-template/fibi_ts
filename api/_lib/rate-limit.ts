// ============================================
// api/_lib/rate-limit.ts
// Ограничение частоты запросов на пользователя.
// Счётчик в БД (rate_limit_hit, окно фиксированной длины): экземпляры Edge-функций
// не делят память, поэтому счётчик в памяти ограничивал бы только один экземпляр.
// Если БД недоступна — запрос пропускается (лимит не должен ломать приложение).
// Версия: 4.0.0 — настоящий лимит (раньше заглушка, всегда allowed)
//          3.0.0 — no-op
// ============================================

import { getSupabaseConfig, supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { corsHeaders } from './cors';

/** Лимиты по действиям: не больше limit запросов за windowSec секунд на пользователя */
export const RATE_LIMITS = {
  /** /auth/check — вход в приложение (много запросов к БД) */
  auth_check: { limit: 20, windowSec: 60 },
  /** /auth/channel — запрос к Telegram API */
  auth_channel: { limit: 6, windowSec: 60 },
  /** /quests/submit — запрос к Telegram API */
  quest_submit: { limit: 10, windowSec: 60 },
  /** /media/upload-url */
  media_upload: { limit: 20, windowSec: 60 },
  /** /media/sign */
  media_sign: { limit: 60, windowSec: 60 },
  /** /chat/whisper — платное распознавание */
  whisper: { limit: 20, windowSec: 60 },
  /** /generations/create */
  generation_create: { limit: 10, windowSec: 60 },
  /** /generations/status — опрос раз в 10 с, каждый — запрос к OpenRouter */
  generation_status: { limit: 30, windowSec: 60 },
  /** /economy/game */
  economy_game: { limit: 30, windowSec: 60 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

export interface IRateLimitResult {
  allowed: boolean;
  /** Через сколько секунд можно повторить (при allowed = false) */
  retryAfter: number;
}

/** Засчитать запрос и проверить лимит */
export async function checkRateLimit(
  action: RateLimitAction,
  userId: number,
  config: ISupabaseConfig = getSupabaseConfig('service')
): Promise<IRateLimitResult> {
  const { limit, windowSec } = RATE_LIMITS[action];
  try {
    const res = await supabaseRPC(
      'rate_limit_hit',
      { p_key: `${action}:${userId}`, p_limit: limit, p_window_sec: windowSec },
      config
    );
    if (res && res.allowed === false) {
      return { allowed: false, retryAfter: Math.max(1, Number(res.retry_after) || windowSec) };
    }
    return { allowed: true, retryAfter: 0 };
  } catch (err) {
    console.warn(`⚠️ [rate-limit] ${action}: ${(err as Error).message}`);
    return { allowed: true, retryAfter: 0 };
  }
}

/** Ответ 429 с Retry-After */
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: 'Слишком много запросов. Попробуйте чуть позже.',
      code: 'rate_limited',
      retry_after: retryAfter,
    }),
    {
      status: 429,
      headers: { ...corsHeaders, 'Retry-After': String(retryAfter) },
    }
  );
}

/**
 * Проверка одной строкой в обработчике:
 *   const limited = await enforceRateLimit('whisper', userId);
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  action: RateLimitAction,
  userId: number,
  config?: ISupabaseConfig
): Promise<Response | null> {
  const result = await checkRateLimit(action, userId, config);
  return result.allowed ? null : rateLimitResponse(result.retryAfter);
}
