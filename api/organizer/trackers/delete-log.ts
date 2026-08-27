// ============================================
// api/organizer/trackers/delete-log.ts
// Описание: Удаление лога из трекера
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';
import { isValidUUID, validateUUID } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface IDeleteLogRequest {
  id: string;
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

    let body: IDeleteLogRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { id } = body;

    if (!id) {
      return errorResponse('Missing log id', 400);
    }

    validateUUID(id, 'Log ID');

    // Проверяем, что лог принадлежит пользователю через трекер
    const check = await supabaseFetch(
      `tracker_logs?id=eq.${id}&select=tracker_id`,
      { method: 'GET' },
      config
    );

    if (!check || !Array.isArray(check) || check.length === 0) {
      return errorResponse('Log not found', 404);
    }

    const trackerId = check[0].tracker_id;

    const trackerCheck = await supabaseFetch(
      `trackers?id=eq.${trackerId}&user_id=eq.${userId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!trackerCheck || !Array.isArray(trackerCheck) || trackerCheck.length === 0) {
      return errorResponse('Access denied', 403);
    }

    await supabaseFetch(
      `tracker_logs?id=eq.${id}`,
      { method: 'DELETE' },
      config
    );

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Delete log error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
