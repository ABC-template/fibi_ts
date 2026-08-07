// ============================================
// api/tasks/quests/claim.ts
// Забрать награду за задание
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

interface IClaimRequest {
  questId: string;
}

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

    const { questId } = body;

    if (!questId) {
      return errorResponse('questId is required', 400);
    }

    const config = getSupabaseConfig('service');

    const result = await supabaseRPC(
      'claim_quest_reward',
      {
        p_user_id: userId,
        p_quest_id: questId,
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
    });
  } catch (err) {
    console.error('[tasks/quests/claim] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
