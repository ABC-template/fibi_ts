// ============================================
// api/tasks/daily-bonus/status.ts
// Статус ежедневного бонуса
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
} from '../../_lib/index';

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

    const result = await supabaseRPC('get_daily_bonus_status', { p_user_id: userId }, config);

    return jsonResponse({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[tasks/daily-bonus/status] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
