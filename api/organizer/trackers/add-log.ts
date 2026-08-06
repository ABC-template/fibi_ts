// ============================================
// api/organizer/trackers/add-log.ts
// Описание: Добавление лога в трекер
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';
import { isValidUUID, validateUUID } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface IAddLogRequest {
  trackerId: string;
  value: string;
  noteText?: string | null;
  loggedDate?: string;
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

    let body: IAddLogRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { trackerId, value, noteText, loggedDate } = body;

    if (!trackerId || !value) {
      return errorResponse('Missing trackerId or value', 400);
    }

    validateUUID(trackerId, 'Tracker ID');

    if (value.length > 100) {
      return errorResponse('Value too long (max 100 characters)', 400);
    }

    if (noteText && noteText.length > 500) {
      return errorResponse('Note too long (max 500 characters)', 400);
    }

    // Проверяем, что трекер принадлежит пользователю
    const check = await supabaseFetch(
      `trackers?id=eq.${trackerId}&user_id=eq.${userId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!check || !Array.isArray(check) || check.length === 0) {
      return errorResponse('Tracker not found or access denied', 404);
    }

    const result = await supabaseFetch(
      'tracker_logs',
      {
        method: 'POST',
        body: JSON.stringify({
          tracker_id: trackerId,
          value: value,
          note_text: noteText || null,
          logged_date: loggedDate || new Date().toISOString()
        })
      },
      config
    );

    return jsonResponse({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Add log error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
