// ============================================
// api/_lib/cors.ts
// Описание: CORS-заголовки для всех Edge-функций
// Версия: 2.0.0 - TypeScript
// ============================================

export const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Device-Fingerprint, X-Audio-Type, X-Request-Part',
  'Access-Control-Max-Age': '86400',
} as const;

export type CorsHeaders = typeof corsHeaders;

/**
 * Обработать OPTIONS запрос
 * @param request - Request объект
 * @param extraHeaders - Дополнительные заголовки
 * @returns Response или null если не OPTIONS
 */
export function handleCORS(
  request: Request,
  extraHeaders: Record<string, string> = {}
): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, ...extraHeaders }
    });
  }
  return null;
}

/**
 * Создать JSON-ответ с CORS заголовками
 * @param data - Данные для ответа
 * @param status - HTTP статус
 * @param extraHeaders - Дополнительные заголовки
 * @returns Response
 */
export function jsonResponse<T = any>(
  data: T,
  status: number = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extraHeaders }
  });
}

/**
 * Создать ошибку с CORS заголовками
 * @param message - Сообщение об ошибке
 * @param status - HTTP статус
 * @param extraHeaders - Дополнительные заголовки
 * @returns Response
 */
export function errorResponse(
  message: string,
  status: number = 400,
  extraHeaders: Record<string, string> = {}
): Response {
  return jsonResponse({ error: message }, status, extraHeaders);
}
