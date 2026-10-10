// ============================================
// api/_lib/rate-limit.ts
// Описание: Старый request-quota удалён. Всегда разрешаем (энергия управляет лимитами).
// Версия: 3.0.0 — no-op
// ============================================

export interface IRateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  error: string | null;
}

/**
 * Старый daily request limit удалён.
 * Всегда возвращаем allowed: true.
 * Реальные лимиты теперь через энергию (check_token_availability / spend_abstract_tokens).
 */
export async function checkRateLimit(
  _userId: number,
  _shouldIncrement: boolean = true,
  _config: any = null
): Promise<IRateLimitResult> {
  return {
    allowed: true,
    used: 0,
    limit: 999999,
    error: null,
  };
}

export function getRateLimitHeaders(
  _used: number,
  _limit: number,
  _reset: number | null = null
): Record<string, string> {
  return {};
}
