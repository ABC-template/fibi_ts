// ============================================
// api/quests/claim.ts
// Забрать награду за задание
// Версия: 3.0.0 - RPC claim_quest: проверка владельца, сумма только из квеста
//                 (бонус от клиента больше не принимается); daily_login
//                 начисляется через daily_checkin
//          2.0.0 - с поддержкой бонуса
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

interface IClaimRequest {
  userQuestId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    let body: IClaimRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { userQuestId } = body;

    if (!userQuestId || !UUID_RE.test(userQuestId)) {
      return errorResponse('userQuestId is required', 400);
    }

    const config = getSupabaseConfig('service');

    const result = await supabaseRPC(
      'claim_quest',
      {
        p_user_id: userId,
        p_user_quest_id: userQuestId,
      },
      config
    );

    if (result?.success === false) {
      return errorResponse(result.error || 'Failed to claim reward', 400);
    }

    return jsonResponse({
      success: true,
      reward: result?.reward || 0,
      newBalance: result?.new_balance || 0,
      transactionId: result?.transaction_id || null,
      streak: result?.streak,
      bonus: result?.bonus,
    });
  } catch (err) {
    console.error('[quests/claim] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
