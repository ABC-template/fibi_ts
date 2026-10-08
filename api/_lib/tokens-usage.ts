// ============================================
// api/_lib/tokens-usage.ts
// Учёт использования OpenRouter (статистика)
// Версия: 2.0.0 — убран тарифный openrouter_limit
// ============================================

import { getSupabaseConfig, supabaseFetch } from './supabase-client';

/**
 * Получить использованные токены OpenRouter за сегодня (для статистики)
 */
export async function getTodayTokenUsage(
  userId: number,
  config: any = null
): Promise<number> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const today = new Date().toISOString().slice(0, 10);

    const result = await supabaseFetch(
      `openrouter_usage?user_id=eq.${userId}&created_at=gte.${today}&select=total_tokens`,
      { method: 'GET' },
      cfg
    );

    if (!result || !Array.isArray(result)) {
      return 0;
    }

    return result.reduce((sum: number, row: any) => sum + (row.total_tokens || 0), 0);
  } catch (err) {
    console.error('Failed to get today token usage:', err);
    return 0;
  }
}

/**
 * Сохранить использование токенов OpenRouter
 */
export async function logOpenRouterUsage(
  userId: number,
  data: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    model: string;
    topic?: string;
    user_lang?: string;
  },
  config: any = null
): Promise<void> {
  try {
    const cfg = config || getSupabaseConfig('service');

    await supabaseFetch(
      'openrouter_usage',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          prompt_tokens: data.prompt_tokens || 0,
          completion_tokens: data.completion_tokens || 0,
          total_tokens: data.total_tokens || 0,
          model: data.model || 'unknown',
          topic: data.topic || null,
          user_lang: data.user_lang || null,
        }),
      },
      cfg
    );
  } catch (err) {
    console.error('Failed to log OpenRouter usage:', err);
  }
}

/**
 * Грубая оценка токенов (для pre-check контекста)
 */
export function estimateTokens(
  messages: Array<{ role?: string; content?: string }>,
  systemPrompt: string = ''
): number {
  let chars = systemPrompt.length;
  for (const m of messages) {
    chars += (m.content || '').length;
  }
  // ~4 символа ≈ 1 токен
  return Math.ceil(chars / 4);
}

/**
 * Раньше здесь был checkOpenRouterLimit.
 * Теперь дневной лимит живёт в check_token_availability (daily_spend_limit).
 * Функция оставлена как no-op для совместимости со stream.ts
 */
export async function checkOpenRouterLimit(
  _userId: number,
  _estimatedTokens: number = 1000,
  _config: any = null
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  error?: string;
}> {
  return {
    allowed: true,
    remaining: 9999999,
    limit: 9999999,
    used: 0,
  };
}

/**
 * Раньше брали лимит из economy_config — больше не используется.
 */
export async function getDailyTokenLimit(
  _userId: number,
  _config: any = null
): Promise<number> {
  return 9999999;
}
