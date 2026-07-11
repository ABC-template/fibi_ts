// ============================================
// api/organizer/trackers/create.ts
// Описание: Создание трекера
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';
import { isValidTopic, validateTopic } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface ICreateTrackerRequest {
  topicId: string;
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

    const { topicId, title, settings = {} } = body;

    if (!topicId || !title) {
      return errorResponse('Missing topicId or title', 400);
    }

    validateTopic(topicId);

    if (title.length > 100) {
      return errorResponse('Title too long (max 100 characters)', 400);
    }

    const result = await supabaseFetch(
      'trackers',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          topic_id: topicId,
          title: title,
          settings: typeof settings === 'string' ? JSON.parse(settings) : settings,
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
