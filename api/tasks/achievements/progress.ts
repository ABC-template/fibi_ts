// ============================================
// api/tasks/achievements/progress.ts
// Обновить прогресс достижения
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

interface IProgressRequest {
  achievementId: string;
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

    const { achievementId, increment = 1 } = body;

    if (!achievementId) {
      return errorResponse('achievementId is required', 400);
    }

    const config = getSupabaseConfig('service');

    const result = await supabaseRPC(
      'update_achievement_progress',
      {
        p_user_id: userId,
        p_achievement_id: achievementId,
        p_increment: increment,
      },
      config
    );

    if (result?.success === false) {
      return errorResponse(result.error || 'Failed to update progress', 400);
    }

    return jsonResponse({
      success: true,
      unlocked: result?.unlocked || false,
      claimed: result?.claimed || false,
      progress: result?.progress || 0,
      target: result?.target || 1,
    });
  } catch (err) {
    console.error('[tasks/achievements/progress] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
