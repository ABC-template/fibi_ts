// ============================================
// api/quests/my.ts
// Получить мои задания с прогрессом + сброс ежедневных
// Версия: 2.1.0 - без отдельного init_user_quests (его вызывают reset_daily_quests и
//                 get_user_quests); auth: проверка userId; текст исключения наружу не уходит
//          2.0.0 - с reset_daily_quests
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
} from '../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const userId = auth.userId;
    const config = getSupabaseConfig('service');

    // 1. Сброс ежедневных заданий (внутри — init_user_quests: недостающие задания)
    await supabaseRPC('reset_daily_quests', { p_user_id: userId }, config);

    // 2. Задания пользователя
    const result = await supabaseRPC('get_user_quests', { p_user_id: userId }, config);

    return jsonResponse({
      success: true,
      quests: result?.quests || [],
    });
  } catch (err) {
    console.error('[quests/my] Error:', err);
    return errorResponse('Failed to load quests', 500);
  }
}
