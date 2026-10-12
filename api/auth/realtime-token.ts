// ============================================
// api/auth/realtime-token.ts
// Токен для Supabase Realtime (синхронизация PRO между устройствами).
// Выдаётся только тем, кому разрешена синхронизация (can_sync).
// Клиент запрашивает новый токен заранее, до истечения старого.
// Версия: 1.0.0
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  getUserUuid,
  canUserSync,
  signRealtimeToken,
} from '../_lib/index';

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

    const telegramId = auth.userId!;
    const db = getSupabaseConfig('service');

    if (!(await canUserSync(telegramId, db))) {
      return errorResponse('Синхронизация доступна только в PRO', 403);
    }

    const userUuid = await getUserUuid(telegramId, db);
    if (!userUuid) {
      return errorResponse('User not found', 404);
    }

    const realtime = await signRealtimeToken(userUuid, telegramId);
    return jsonResponse({ success: true, realtime });
  } catch (err) {
    console.error('realtime-token error:', (err as Error).message);
    return errorResponse('Не удалось выдать токен', 500);
  }
}
