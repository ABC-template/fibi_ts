// ============================================
// api/quests/my.ts
// Получить мои задания с прогрессом
// Версия: 1.0.0
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
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    // Инициализируем задания (если ещё не созданы)
    await supabaseRPC('init_user_quests', { p_user_id: userId }, config);

    // Получаем задания
    const result = await supabaseRPC('get_user_quests', { p_user_id: userId }, config);

    return jsonResponse({
      success: true,
      quests: result?.quests || [],
    });
  } catch (err) {
    console.error('[quests/my] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
