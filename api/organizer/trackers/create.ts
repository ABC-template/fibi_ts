// ============================================
// api/organizer/trackers/create.ts
// Описание: Создание трекера
// Версия: 2.1.1 - без неиспользуемых импортов и переменных
//          2.1.0 - создание работало с ошибкой: раздел 'all' не проходил проверку,
//                 а user_uuid (обязательный в БД) не передавался; settings — только
//                 объект до 2 КБ; не больше 50 активных трекеров
//          2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, getUserUuid } from '../../_lib/supabase-client';
import { normalizeOrganizerTopic } from '../../_lib/validators';

const MAX_TITLE = 100;
const MAX_SETTINGS_BYTES = 2_000;
const MAX_ACTIVE_TRACKERS = 50;

export const config = { runtime: 'edge' };

interface ICreateTrackerRequest {
  topicId?: string;
  title: string;
  settings: any;
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
    const config = getSupabaseConfig('service');

    let body: ICreateTrackerRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const topicId = normalizeOrganizerTopic(body?.topicId);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';

    if (!topicId) {
      return errorResponse('Invalid topicId', 400);
    }
    if (!title) {
      return errorResponse('Missing title', 400);
    }
    if (title.length > MAX_TITLE) {
      return errorResponse(`Title too long (max ${MAX_TITLE} characters)`, 400);
    }

    // settings — объект разумного размера (раньше строка уходила в JSON.parse без проверки)
    let settings: Record<string, any> = {};
    try {
      const raw = typeof body?.settings === 'string' ? JSON.parse(body.settings) : body?.settings;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) settings = raw;
    } catch {
      return errorResponse('Invalid settings', 400);
    }
    if (JSON.stringify(settings).length > MAX_SETTINGS_BYTES) {
      return errorResponse('Settings too large', 400);
    }

    const userUuid = await getUserUuid(userId, config);
    if (!userUuid) {
      return errorResponse('User not found', 404);
    }

    const active = await supabaseFetch(
      `trackers?user_id=eq.${userId}&status=eq.active&select=id&limit=${MAX_ACTIVE_TRACKERS}`,
      { method: 'GET' },
      config
    );
    if (Array.isArray(active) && active.length >= MAX_ACTIVE_TRACKERS) {
      return errorResponse(`Не больше ${MAX_ACTIVE_TRACKERS} активных трекеров`, 400);
    }

    const result = await supabaseFetch(
      'trackers',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          user_uuid: userUuid,
          topic_id: topicId,
          title: title,
          settings,
          status: 'active'
        })
      },
      config
    );

    return jsonResponse({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Create tracker error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
