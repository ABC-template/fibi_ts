// ============================================
// api/organizer/reminders/create.ts
// Описание: Создание напоминания
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';
import { isValidTopic, validateTopic } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface ICreateReminderRequest {
  topicId: string;
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

    const { topicId, taskText, triggerAt } = body;

    if (!topicId || !taskText || !triggerAt) {
      return errorResponse('Missing topicId, taskText or triggerAt', 400);
    }

    validateTopic(topicId);

    if (taskText.length > 500) {
      return errorResponse('Task text too long (max 500 characters)', 400);
    }

    // Проверяем, что время не в прошлом
    const triggerDate = new Date(triggerAt);
    if (triggerDate <= new Date()) {
      return errorResponse('Trigger time must be in the future', 400);
    }

    const result = await supabaseFetch(
      'reminders',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          topic_id: topicId,
          task_text: taskText,
          trigger_at: triggerAt,
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
