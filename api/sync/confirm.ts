// ============================================
// api/sync/confirm.ts
// Описание: Подтверждение удаления на устройстве
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { isValidUUID, validateUUID } from '../_lib/validators';

export const config = { runtime: 'edge' };

interface IConfirmRequest {
  id: string;
  deviceFingerprint: string;
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

    let body: IConfirmRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { id, deviceFingerprint } = body;

    if (!id || !deviceFingerprint) {
      return errorResponse('Missing id or deviceFingerprint', 400);
    }

    validateUUID(id, 'Pending ID');

    // Проверяем, что запись принадлежит пользователю
    const pending = await supabaseFetch(
      `pending_deletions?id=eq.${id}&user_id=eq.${userId}&select=id,is_cleaned`,
      { method: 'GET' },
      config
    );

    if (!pending || !Array.isArray(pending) || pending.length === 0) {
      return jsonResponse({ success: true, alreadyCleaned: true });
    }

    if (pending[0].is_cleaned) {
      return jsonResponse({ success: true, alreadyCleaned: true });
    }

    // Удаляем устройство из списка pending
    await supabaseFetch(
      `pending_deletion_devices?pending_id=eq.${id}&device_fingerprint=eq.${deviceFingerprint}`,
      { method: 'DELETE' },
      config
    );

    // Проверяем, остались ли еще устройства
    const remaining = await supabaseFetch(
      `pending_deletion_devices?pending_id=eq.${id}&select=device_fingerprint`,
      { method: 'GET' },
      config
    );

    if (!remaining || !Array.isArray(remaining) || remaining.length === 0) {
      // Помечаем как очищенное
      await supabaseFetch(
        `pending_deletions?id=eq.${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ is_cleaned: true })
        },
        config
      );

      return jsonResponse({ success: true, cleaned: true });
    }

    return jsonResponse({
      success: true,
      cleaned: false,
      remaining: remaining.length
    });
  } catch (err) {
    console.error('Confirm error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
