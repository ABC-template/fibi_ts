// ============================================
// api/tasks/sync.ts
// Полная синхронизация данных заданий
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

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    // 1. Инициализируем достижения (если ещё не созданы)
    await supabaseRPC('init_user_achievements', { p_user_id: userId }, config);

    // 2. Получаем статус бонуса
    const bonusStatus = await supabaseRPC('get_daily_bonus_status', { p_user_id: userId }, config);

    // 3. Получаем достижения
    const achievements = await supabaseRPC('sync_user_achievements', { p_user_id: userId }, config);

    // 4. Получаем задания
    const quests = await supabaseRPC('sync_user_quests', { p_user_id: userId }, config);

    return jsonResponse({
      success: true,
      dailyBonus: bonusStatus,
      achievements: achievements?.achievements || [],
      quests: quests?.quests || [],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[tasks/sync] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
