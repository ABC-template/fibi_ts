// ============================================
// api/sync/pending.ts
// Описание: Получение списка pending удалений для устройства
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';

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

    const url = new URL(request.url);
    const deviceFingerprint = url.searchParams.get('device');

    if (!deviceFingerprint) {
      return errorResponse('Missing device fingerprint', 400);
    }

    // Получаем все pending записи пользователя
    const allPending = await supabaseFetch(
      `pending_deletions?user_id=eq.${userId}&select=id,entity_type,parent_id`,
      { method: 'GET' },
      config
    );

    // Фильтруем по устройствам
    const pending: any[] = [];

    for (const item of (allPending || [])) {
      const devices = await supabaseFetch(
        `pending_deletion_devices?pending_id=eq.${item.id}&select=device_fingerprint`,
        { method: 'GET' },
        config
      );

      const deviceFingerprints = (devices || []).map((d: any) => d.device_fingerprint);

      if (deviceFingerprints.includes(deviceFingerprint)) {
        pending.push(item);
      }
    }

    return jsonResponse({
      success: true,
      pending: pending
    });
  } catch (err) {
    console.error('Get pending error:', (err as Error).message);
    return jsonResponse({
      error: (err as Error).message,
      pending: []
    }, 500);
  }
}
