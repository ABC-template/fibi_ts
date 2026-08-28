// ============================================
// api/subscription/activate-trial.ts
// Активация пробного периода
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

    const result = await supabaseRPC(
      'activate_trial',
      { p_user_id: userId },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to activate trial', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to activate trial', 400);
    }

    return jsonResponse({
      success: true,
      tier: result.tier || 'trial',
      days: result.days || 3,
      permanent_tokens: result.permanent_tokens || 50,
      expires_at: result.expires_at,
    });
  } catch (err) {
    console.error('[subscription/activate-trial] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
