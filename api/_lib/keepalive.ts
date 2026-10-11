// ============================================
// api/_lib/keepalive.ts
// Ответ-поток для долгих операций на Vercel Edge: ответ нужно начать за ~25 с,
// после этого функция может работать дольше. Сразу отдаём заголовки и пробел,
// затем пробелы-«пульс», в конце — JSON. JSON.parse игнорирует пробелы в начале,
// поэтому клиент читает такой ответ обычным response.json().
// Версия: 1.0.0
// ============================================

import { corsHeaders } from './cors';

const KEEPALIVE_MS = 8000;

/**
 * work возвращает объект для JSON-ответа. Если work бросает исключение,
 * вызывается onError (например, пометить сообщение failed), а клиенту
 * уходит { success: false, error }.
 */
export function keepAliveJson(
  work: () => Promise<unknown>,
  onError?: (err: Error) => Promise<void>
): Response {
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          // клиент ушёл — работа всё равно доводится до конца
        }
      };
      write(' ');
      const timer = setInterval(() => write(' '), KEEPALIVE_MS);

      try {
        write(JSON.stringify(await work()));
      } catch (err) {
        const error = err as Error;
        console.error('keepAliveJson work failed:', error);
        if (onError) {
          try {
            await onError(error);
          } catch (e) {
            console.error('keepAliveJson onError failed:', (e as Error).message);
          }
        }
        write(JSON.stringify({ success: false, error: error.message || 'Internal error' }));
      } finally {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // уже закрыт
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
