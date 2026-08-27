// ============================================
// api/quests/progress.ts
// Обновить прогресс задания
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

interface IProgressRequest {
  questId: string;
  increment?: number;
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

    let body: IProgressRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { questId, increment = 1 } = body;

    if (!questId) {
      return errorResponse('questId is required', 400);
    }

    const config = getSupabaseConfig('service');

    const result = await supabaseRPC(
      'update_quest_progress',
      {
        p_user_id: userId,
        p_quest_id: questId,
        p_increment: increment,
      },
      config
    );

    if (result?.success === false) {
      return errorResponse(result.error || 'Failed to update progress', 400);
    }

    return jsonResponse({
      success: true,
      completed: result?.completed || false,
      claimed: result?.claimed || false,
      progress: result?.progress || 0,
      target: result?.target || 1,
    });
  } catch (err) {
    console.error('[quests/progress] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
