// ============================================
// api/economy/balance.ts
// Получение балансов (коины + токены)
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

    // Получаем балансы через RPC
    const result = await supabaseRPC(
      'get_user_balances',
      { p_user_id: userId },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to get balances', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to get balances', 400);
    }

    return jsonResponse({
      success: true,
      coins: {
        balance: result.coins?.balance || 0,
        total_earned: result.coins?.total_earned || 0,
        total_spent: result.coins?.total_spent || 0,
      },
      tokens: {
        bonus: result.tokens?.bonus || 0,
        permanent: result.tokens?.permanent || 0,
        total: (result.tokens?.bonus || 0) + (result.tokens?.permanent || 0),
      },
      is_locked: result.is_locked || false,
    });
  } catch (err) {
    console.error('[economy/balance] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
