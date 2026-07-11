// ============================================
// api/organizer/trackers/get.ts
// Описание: Получение трекеров и их логов
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

    // Получаем трекеры
    let query = `trackers?user_id=eq.${userId}&status=eq.active&order=created_at.desc`;
    if (topicId) {
      query += `&topic_id=eq.${topicId}`;
    }

    const trackers = await supabaseFetch(
      query,
      { method: 'GET' },
      config
    );

    // Получаем логи для трекеров
    let logs: any[] = [];
    if (trackers && Array.isArray(trackers) && trackers.length > 0) {
      const trackerIds = trackers.map((t: any) => t.id).join(',');

      logs = await supabaseFetch(
        `tracker_logs?tracker_id=in.(${trackerIds})&order=logged_date.desc`,
        { method: 'GET' },
        config
      );
    }

    return jsonResponse({
      success: true,
      data: {
        trackers: trackers || [],
        logs: logs || []
      }
    });
  } catch (err) {
    console.error('Get trackers error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
