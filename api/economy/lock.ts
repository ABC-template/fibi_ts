// ============================================
// api/economy/lock.ts
// Блокировка/разблокировка пользователя (для админки)
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

interface ILockRequest {
  userId: number;
  locked: boolean;
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

    // 2. Проверка прав (только создатель)
    if (auth.userId !== CREATOR_ID) {
      return errorResponse('Доступ запрещён', 403);
    }

    // 3. Парсинг тела запроса
    let body: ILockRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { userId, locked } = body;

    // 4. Валидация
    if (!userId || userId <= 0) {
      return errorResponse('Invalid user ID', 400);
    }

    if (typeof locked !== 'boolean') {
      return errorResponse('locked must be boolean', 400);
    }

    // 5. Получаем конфигурацию Supabase
    const config = getSupabaseConfig('service');

    // 6. Вызываем RPC
    const result = await supabaseRPC(
      'toggle_user_lock',
      {
        p_user_id: userId,
        p_locked: locked,
      },
      config
    );

    // 7. Обрабатываем результат
    if (!result || typeof result !== 'object') {
      console.error('[economy/lock] Invalid RPC response:', result);
      return errorResponse('Failed to toggle lock', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to toggle lock', 400);
    }

    // 8. Возвращаем успешный ответ
    return jsonResponse({
      success: true,
      userId: result.user_id,
      locked: result.locked,
      previousState: result.previous_state,
    });

  } catch (err) {
    console.error('[economy/lock] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
