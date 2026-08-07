// ============================================
// api/tasks/daily-bonus/claim.ts
// Забрать ежедневный бонус
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

const DAILY_BONUS_AMOUNT = 2;

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
      'claim_daily_bonus',
      {
        p_user_id: userId,
        p_bonus_amount: DAILY_BONUS_AMOUNT,
      },
      config
    );

    if (result?.success === false) {
      return errorResponse(result.error || 'Failed to claim bonus', 400);
    }

    return jsonResponse({
      success: true,
      bonus: result?.bonus || DAILY_BONUS_AMOUNT,
      streak: result?.streak || 0,
      newBalance: result?.new_balance || 0,
      transactionId: result?.transaction_id || null,
    });
  } catch (err) {
    console.error('[tasks/daily-bonus/claim] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
