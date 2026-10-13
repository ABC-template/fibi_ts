// ============================================
// api/organizer/reminders/create.ts
// Описание: Создание напоминания
// Версия: 2.1.0 - создание работало с ошибкой: раздел 'all' не проходил проверку,
//                 а user_uuid (обязательный в БД) не передавался; проверка даты,
//                 не больше 100 активных напоминаний
//          2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, getUserUuid } from '../../_lib/supabase-client';
import { normalizeOrganizerTopic } from '../../_lib/validators';

const MAX_TASK_TEXT = 500;
const MAX_PENDING_REMINDERS = 100;
/** Дальше года вперёд напоминание не ставим */
const MAX_AHEAD_MS = 366 * 24 * 3600 * 1000;

export const config = { runtime: 'edge' };

interface ICreateReminderRequest {
  topicId?: string;
  taskText: string;
  triggerAt: string;
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

    let body: ICreateReminderRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const topicId = normalizeOrganizerTopic(body?.topicId);
    const taskText = typeof body?.taskText === 'string' ? body.taskText.trim() : '';
    const triggerAt = typeof body?.triggerAt === 'string' ? body.triggerAt : '';

    if (!topicId) {
      return errorResponse('Invalid topicId', 400);
    }
    if (!taskText || !triggerAt) {
      return errorResponse('Missing taskText or triggerAt', 400);
    }
    if (taskText.length > MAX_TASK_TEXT) {
      return errorResponse(`Task text too long (max ${MAX_TASK_TEXT} characters)`, 400);
    }

    // Дата: корректная, в будущем, не дальше года
    const triggerDate = new Date(triggerAt);
    const triggerMs = triggerDate.getTime();
    if (!Number.isFinite(triggerMs)) {
      return errorResponse('Invalid triggerAt', 400);
    }
    if (triggerMs <= Date.now()) {
      return errorResponse('Trigger time must be in the future', 400);
    }
    if (triggerMs - Date.now() > MAX_AHEAD_MS) {
      return errorResponse('Trigger time is too far in the future', 400);
    }

    const userUuid = await getUserUuid(userId, config);
    if (!userUuid) {
      return errorResponse('User not found', 404);
    }

    const pending = await supabaseFetch(
      `reminders?user_id=eq.${userId}&status=eq.pending&select=id&limit=${MAX_PENDING_REMINDERS}`,
      { method: 'GET' },
      config
    );
    if (Array.isArray(pending) && pending.length >= MAX_PENDING_REMINDERS) {
      return errorResponse(`Не больше ${MAX_PENDING_REMINDERS} активных напоминаний`, 400);
    }

    const result = await supabaseFetch(
      'reminders',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          user_uuid: userUuid,
          topic_id: topicId,
          task_text: taskText,
          trigger_at: triggerDate.toISOString(),
          status: 'pending'
        })
      },
      config
    );

    return jsonResponse({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Create reminder error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
