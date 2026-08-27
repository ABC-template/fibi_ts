// ============================================
// api/users/streak.ts
// Обновление стрика пользователя
// Версия: 2.0.0 - с бонусами
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

    const result = await supabaseRPC(
      'update_user_streak',
      { p_user_id: userId },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to update streak', 500);
    }

    return jsonResponse({
      success: result.success === true,
      streak: result.streak || 0,
      bonus: result.bonus || 0,
      already_claimed: result.already_claimed || false,
    });
  } catch (err) {
    console.error('Streak error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
