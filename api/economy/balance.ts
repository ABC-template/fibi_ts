// ============================================
// api/economy/balance.ts
// Получение баланса пользователя
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

    // 2. Получаем конфигурацию Supabase
    const config = getSupabaseConfig('service');

    // 3. Вызываем RPC
    const result = await supabaseRPC(
      'get_user_balance',
      {
        p_user_id: userId,
      },
      config
    );

    // 4. Обрабатываем результат
    if (!result || typeof result !== 'object') {
      console.error('[economy/balance] Invalid RPC response:', result);
      return errorResponse('Failed to get balance', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to get balance', 400);
    }

    // 5. Возвращаем успешный ответ
    return jsonResponse({
      success: true,
      balance: result.balance || 0,
      total_earned: result.total_earned || 0,
      total_spent: result.total_spent || 0,
      is_locked: result.is_locked || false,
    });

  } catch (err) {
    console.error('[economy/balance] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
