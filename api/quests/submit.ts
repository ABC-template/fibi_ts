// ============================================
// api/quests/submit.ts
// Отправить доказательство (для спонсорских)
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

interface ISubmitRequest {
  userQuestId: string;
  proofData?: any;
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

    let body: ISubmitRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { userQuestId, proofData = {} } = body;

    if (!userQuestId) {
      return errorResponse('userQuestId is required', 400);
    }

    const config = getSupabaseConfig('service');

    const result = await supabaseRPC(
      'submit_quest_proof',
      {
        p_user_id: userId,
        p_user_quest_id: userQuestId,
        p_proof_data: proofData,
      },
      config
    );

    if (result?.success === false) {
      return errorResponse(result.error || 'Failed to submit proof', 400);
    }

    return jsonResponse({
      success: true,
      status: result?.status || 'submitted',
      expiresAt: result?.expires_at || null,
    });
  } catch (err) {
    console.error('[quests/submit] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
