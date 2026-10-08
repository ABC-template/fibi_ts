// ============================================
// api/_lib/tokens-usage.ts
// Оценка токенов + лог OpenRouter (лимит OR — no-op)
// Версия: 2.1.0 — совместимый logOpenRouterUsage
// ============================================

import { getSupabaseConfig, supabaseFetch } from './supabase-client';

/**
 * Оценка токенов по тексту сообщений (в т.ч. vision content[])
 */
export function estimateTokens(
  messages: Array<{ role?: string; content?: string | any[] }>,
  systemPrompt: string = ''
): number {
  let totalChars = systemPrompt.length;

  for (const msg of messages || []) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && part.text) {
          totalChars += String(part.text).length;
        }
      }
    }
  }

  const hasCyrillic = /[а-яА-Я]/.test(systemPrompt + JSON.stringify(messages || []));
  const charsPerToken = hasCyrillic ? 2.5 : 4;
  return Math.ceil(totalChars / charsPerToken) + 50;
}

/**
 * Дневной лимит OpenRouter больше не ограничивает запросы.
 * Экономика — abstract tokens + daily_spend_limit тарифа.
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
    remaining: 999999999,
    limit: 0,
    used: 0,
  };
}

export async function getDailyTokenLimit(
  _userId: number,
  _config: any = null
): Promise<number> {
  return 0;
}

export async function getTodayTokenUsage(
  userId: number,
  config: any = null
): Promise<number> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const result = await supabaseFetch(
      `openrouter_usage?user_id=eq.${userId}&select=total_tokens&order=created_at.desc&limit=50`,
      { method: 'GET' },
      cfg
    );
    if (Array.isArray(result) && result.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      return result
        .filter((r: any) => (r.created_at || '').startsWith(today))
        .reduce((s: number, r: any) => s + (r.total_tokens || 0), 0);
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Лог usage OpenRouter — сигнатура как в stream.ts
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
): Promise<boolean> {
  try {
    const cfg = config || getSupabaseConfig('service');

    await supabaseFetch(
      'openrouter_usage',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          prompt_tokens: data.prompt_tokens,
          completion_tokens: data.completion_tokens,
          total_tokens: data.total_tokens,
          model: data.model,
          topic: data.topic || null,
          user_lang: data.user_lang || null,
        }),
      },
      cfg
    );

    return true;
  } catch (err) {
    console.error('Failed to log OpenRouter usage:', err);
    return false;
  }
}
