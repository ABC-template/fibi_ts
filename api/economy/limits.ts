// ============================================
// api/economy/limits.ts
// Получение лимитов для пользователя
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

    const result = await supabaseRPC(
      'get_user_limits',
      { p_user_id: userId },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to get limits', 500);
    }

    return jsonResponse({
      success: true,
      limits: result,
    });
  } catch (err) {
    console.error('[economy/limits] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
