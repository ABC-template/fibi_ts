// ============================================
// api/organizer/reminders/get.ts
// Описание: Получение напоминаний
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';

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

    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get('topicId');

    let query = `reminders?user_id=eq.${userId}&status=eq.pending&order=trigger_at.asc`;
    if (topicId) {
      query += `&topic_id=eq.${topicId}`;
    }

    const reminders = await supabaseFetch(
      query,
      { method: 'GET' },
      config
    );

    return jsonResponse({
      success: true,
      data: reminders || []
    });
  } catch (err) {
    console.error('Get reminders error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
