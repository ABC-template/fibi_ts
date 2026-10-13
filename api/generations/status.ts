// ============================================
// api/generations/status.ts
// Состояние видео-задания для приложения (опрос раз в несколько секунд).
// Заодно доводит готовое задание до конца: если вебхук не пришёл или не
// отработал, результат всё равно будет сохранён и оплачен. Идемпотентно.
// Версия: 1.1.0 — лимит частоты (generation_status)
// Версия: 1.0.0
// ============================================

import { authenticate } from '../_lib/auth';
import { handleCORS, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { UUID_RE } from '../_lib/media';
import { keepAliveJson } from '../_lib/keepalive';
import { enforceRateLimit } from '../_lib/rate-limit';
import { finalizeVideoJob } from '../_lib/generation-store';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const limited = await enforceRateLimit('generation_status', auth.userId);
    if (limited) return limited;

    const body = await request.json();
    const messageId = String(body?.message_id || '');
    if (!UUID_RE.test(messageId)) {
      return errorResponse('Invalid message_id', 400);
    }

    const db = getSupabaseConfig('service');

    const owner = await supabaseFetch(
      `messages?id=eq.${messageId}&select=id,chats!inner(user_id)`,
      { method: 'GET' },
      db
    );
    const found = Array.isArray(owner) ? owner[0] : null;
    if (!found || Number(found.chats?.user_id) !== Number(auth.userId)) {
      return errorResponse('Message not found', 404);
    }

    // Завершение может включать скачивание видео — отвечаем потоком с пульсом
    return keepAliveJson(async () => {
      const result = await finalizeVideoJob(messageId, db);
      return {
        success: true,
        state: result.state,
        message: result.row,
      };
    });
  } catch (err) {
    console.error('Generation status error:', err);
    return errorResponse((err as Error).message || 'Internal error', 500);
  }
}
