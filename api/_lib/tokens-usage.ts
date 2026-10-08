// ============================================
// api/_lib/tokens-usage.ts
// Оценка токенов + лог OpenRouter (лимит OR — no-op)
// Версия: 2.0.0
// ============================================

import { getSupabaseConfig, supabaseRPC, supabaseFetch } from './supabase-client';

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
 * Дневной лимит OpenRouter больше не ограничивает —
 * экономика идёт через abstract tokens + daily_spend_limit тарифа.
 * Функция оставлена для совместимости со stream.ts.
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
  return 0; // 0 = без лимита OpenRouter
}

export async function getTodayTokenUsage(
  userId: number,
  config: any = null
): Promise<number> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const today = new Date().toISOString().slice(0, 10);
    const result = await supabaseFetch(
      `openrouter_usage?user_id=eq.${userId}&date=eq.${today}&select=tokens_used`,
      { method: 'GET' },
      cfg
    );
    if (Array.isArray(result) && result.length > 0) {
      return result.reduce((s: number, r: any) => s + (r.tokens_used || 0), 0);
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function logOpenRouterUsage(
  userId: number,
  tokensUsed: number,
  model: string,
  config: any = null
): Promise<void> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const today = new Date().toISOString().slice(0, 10);

    await supabaseFetch(
      'openrouter_usage',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          date: today,
          tokens_used: tokensUsed,
          model,
          created_at: new Date().toISOString(),
        }),
      },
      cfg
    );
  } catch (err) {
    console.warn('logOpenRouterUsage:', err);
  }
}
