// ============================================
// api/economy/history.ts
// Получение истории транзакций
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

    const userId = auth.userId!;

    // 2. Параметры пагинации
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // 3. Получаем конфигурацию Supabase
    const config = getSupabaseConfig('service');

    // 4. Вызываем RPC
    const result = await supabaseRPC(
      'get_user_transactions',
      {
        p_user_id: userId,
        p_limit: Math.min(limit, 100),
        p_offset: offset,
      },
      config
    );

    // 5. Обрабатываем результат
    if (!result || typeof result !== 'object') {
      console.error('[economy/history] Invalid RPC response:', result);
      return errorResponse('Failed to get history', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to get history', 400);
    }

    // 6. Возвращаем успешный ответ
    return jsonResponse({
      success: true,
      transactions: result.transactions || [],
      total: result.total || 0,
      limit: result.limit || limit,
      offset: result.offset || offset,
    });

  } catch (err) {
    console.error('[economy/history] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
