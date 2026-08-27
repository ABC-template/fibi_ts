// ============================================
// api/economy/rules.ts
// Получение правил (для админки)
// Версия: 2.0.0
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
} from '../_lib/index';

export const config = { runtime: 'edge' };

const CREATOR_ID = 1541531808;

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
    if (auth.userId !== CREATOR_ID) {
      return errorResponse('Доступ запрещён', 403);
    }

    // 3. Параметры пагинации
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // 4. Получаем конфигурацию Supabase
    const config = getSupabaseConfig('service');

    // 5. Вызываем RPC
    const result = await supabaseRPC(
      'get_economy_rules',
      {
        p_limit: Math.min(limit, 100),
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
