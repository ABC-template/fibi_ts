// ============================================
// api/quests/claim.ts
// Забрать награду за задание (с бонусом за стрик)
// Версия: 2.0.0 - с поддержкой бонуса
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

interface IClaimRequest {
  userQuestId: string;
  bonusAmount?: number;
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

    const { userQuestId, bonusAmount = 0 } = body;

    if (!userQuestId) {
      return errorResponse('userQuestId is required', 400);
    }

    const config = getSupabaseConfig('service');

    // Используем новую функцию с бонусом
    const result = await supabaseRPC(
      'claim_quest_with_bonus',
      {
        p_user_quest_id: userQuestId,
        p_bonus_amount: bonusAmount,
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
    console.error('[quests/claim] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
