// ============================================
// api/_lib/tokens-usage.ts
// Оценка числа токенов по тексту
// Версия: 3.0.0 — удалён logOpenRouterUsage (таблица openrouter_usage): расходы пишутся
//                  в журнал ai_usage при списании (settle_energy)
//          2.2.0 — убраны заглушки checkOpenRouterLimit, getDailyTokenLimit, getTodayTokenUsage
// ============================================

/**
 * Оценка токенов по тексту сообщений (в т.ч. vision content[]; картинки не считаются —
 * их добавляет вызывающий код)
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
