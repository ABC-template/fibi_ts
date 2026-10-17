// ============================================
// api/organizer/reminders/get.ts
// Описание: Получение напоминаний
// Версия: 2.1.1 - без неиспользуемых импортов и переменных
//          2.1.0 - фильтр по разделу: 'all' — все записи, тема — её и общие; тема проверяется
//          2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';
import { isValidTopic } from '../../_lib/validators';

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
    // 'all' или пусто — всё; тема — записи этой темы и общие ('all')
    if (topicId && topicId !== 'all') {
      if (!isValidTopic(topicId)) {
        return errorResponse('Invalid topicId', 400);
      }
      query += `&topic_id=in.(${topicId},all)`;
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
