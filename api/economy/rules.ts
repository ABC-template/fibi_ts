// ============================================
// api/economy/rules.ts
// Получение правил (для админки)
// Версия: 2.2.0 — limit/offset проверяются (нечисловые и отрицательные значения ломали запрос)
//          2.1.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId), без ID в коде
//          2.0.0
// ============================================

import {
  authenticate,
  intParam,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
  isAdminTelegramId,
} from '../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  // CORS
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Только GET
  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    // 1. Аутентификация
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    // 2. Проверка прав (только создатель)
    if (!isAdminTelegramId(auth.userId)) {
      return errorResponse('Доступ запрещён', 403);
    }

    // 3. Параметры пагинации
    const url = new URL(request.url);
    const limit = intParam(url.searchParams.get('limit'), 50, 1, 100);
    const offset = intParam(url.searchParams.get('offset'), 0, 0, 1_000_000);

    // 4. Получаем конфигурацию Supabase
    const config = getSupabaseConfig('service');

    // 5. Вызываем RPC
    const result = await supabaseRPC(
      'get_economy_rules',
      {
        p_limit: limit,
        p_offset: offset,
      },
      config
    );

    // 6. Обрабатываем результат
    if (!result || typeof result !== 'object') {
      console.error('[economy/rules] Invalid RPC response:', result);
      return errorResponse('Failed to get rules', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to get rules', 400);
    }

    // 7. Возвращаем успешный ответ
    return jsonResponse({
      success: true,
      rules: result.rules || [],
      total: result.total || 0,
      limit: result.limit || limit,
      offset: result.offset || offset,
    });

  } catch (err) {
    console.error('[economy/rules] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
