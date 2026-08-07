// ============================================
// api/economy/spend.ts
// Списание монет (с проверками на сервере)
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

interface ISpendRequest {
  userId: number;
  amount: number;
  source: string;
  description?: string;
  metadata?: Record<string, any>;
}

export default async function handler(request: Request): Promise<Response> {
  // CORS
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Только POST
  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    // 1. Аутентификация
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;

    // 2. Парсинг тела запроса
    let body: ISpendRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { amount, source, description, metadata } = body;

    // 3. Валидация
    if (!amount || amount <= 0) {
      return errorResponse('Invalid amount (must be > 0)', 400);
    }

    if (!source) {
      return errorResponse('Source is required', 400);
    }

    // 4. Проверяем userId
    if (body.userId && body.userId !== userId) {
      return errorResponse('User ID mismatch', 403);
    }

    // 5. Получаем конфигурацию Supabase
    const config = getSupabaseConfig('service');

    // 6. Вызываем RPC
    const result = await supabaseRPC(
      'spend_coins_safe',
      {
        p_user_id: userId,
        p_amount: amount,
        p_source: source,
        p_description: description || `Списание за ${source}`,
        p_metadata: metadata || {},
      },
      config
    );

    // 7. Обрабатываем результат
    if (!result || typeof result !== 'object') {
      console.error('[economy/spend] Invalid RPC response:', result);
      return errorResponse('Failed to spend coins', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to spend coins', 400);
    }

    // 8. Возвращаем успешный ответ
    return jsonResponse({
      success: true,
      newBalance: result.new_balance || 0,
      transactionId: result.transaction_id || null,
      delta: result.delta || -amount,
    });

  } catch (err) {
    console.error('[economy/spend] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
