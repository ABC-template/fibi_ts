// ============================================
// api/_lib/rate-limit.ts
// Описание: Проверка лимитов для Edge-функций
// Версия: 2.0.0 - TypeScript
// ============================================

import { checkUsageLimit, incrementUsage } from './supabase-client';

export interface IRateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  error: string | null;
}

/**
 * Проверить и инкрементировать лимит
 * @param userId - ID пользователя
 * @param shouldIncrement - Инкрементировать ли счетчик
 * @param config - Конфигурация Supabase
 * @returns Результат проверки лимита
 */
export async function checkRateLimit(
  userId: number,
  shouldIncrement: boolean = true,
  config: any = null
): Promise<IRateLimitResult> {
  if (!userId) {
    return {
      allowed: false,
      used: 0,
      limit: 0,
      error: 'User ID required'
    };
  }

  try {
    // Проверяем текущий лимит
    const limitCheck = await checkUsageLimit(userId, config);

    if (!limitCheck.allowed) {
      return {
        allowed: false,
        used: limitCheck.used,
        limit: limitCheck.limit,
        error: `Daily limit exceeded (${limitCheck.used}/${limitCheck.limit})`
      };
    }

    // Если нужно, инкрементируем счетчик
    if (shouldIncrement) {
      await incrementUsage(userId, config);
    }

    return {
      allowed: true,
      used: limitCheck.used,
      limit: limitCheck.limit,
      error: null
    };
  } catch (err) {
    console.error('Rate limit check failed:', (err as Error).message);
    // В случае ошибки пропускаем (fail open)
    return {
      allowed: true,
      used: 0,
      limit: 9999,
      error: null
    };
  }
}

/**
 * Создать заголовки для rate limit
 * @param used - Использовано
 * @param limit - Лимит
 * @param reset - Время сброса (timestamp)
 * @returns Объект с заголовками
 */
export function getRateLimitHeaders(
  used: number,
  limit: number,
  reset: number | null = null
): Record<string, string> {
  const remaining = Math.max(0, limit - used);
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Used': String(used)
  };
  if (reset) {
    headers['X-RateLimit-Reset'] = String(reset);
  }
  return headers;
}
