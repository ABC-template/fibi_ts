// ============================================
// api/chats/sync-metadata.ts
// Описание: Получение метаданных чатов для синхронизации
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch, canUserSync } from '../_lib/supabase-client';

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

    // Проверяем права на синхронизацию
    const syncEnabled = await canUserSync(userId, config);

    if (!syncEnabled) {
      return jsonResponse({
        syncEnabled: false,
        message: 'Sync not allowed - insufficient privileges',
        chats: [],
        favorites: []
      });
    }

    // Получаем чаты
    const chats = await supabaseFetch(
      `chats?user_id=eq.${userId}&deleted_at=is.null&select=id,topic_id,title,max_context,user_renamed,updated_at,created_at&order=updated_at.desc`,
      { method: 'GET' },
      config
    );

    // Получаем избранные сообщения
    let favorites: any[] = [];
    if (chats && Array.isArray(chats) && chats.length > 0) {
      const chatIds = chats.map((c: any) => c.id).join(',');

      favorites = await supabaseFetch(
        `messages?is_favorite=eq.true&chat_id=in.(${chatIds})&deleted_at=is.null&select=id,chat_id,text,is_favorite,updated_at&order=updated_at.desc`,
        { method: 'GET' },
        config
      );

      // Форматируем для клиента
      favorites = (favorites || []).map((m: any) => ({
        msg_id: m.id,
        chat_id: m.chat_id,
        text_preview: (m.text || '').substring(0, 100),
        updated_at: m.updated_at
      }));
    }

    return jsonResponse({
      syncEnabled: true,
      chats: chats || [],
      favorites: favorites || []
    });
  } catch (err) {
    console.error('Sync metadata error:', (err as Error).message);
    return jsonResponse({
      error: (err as Error).message,
      syncEnabled: false,
      chats: [],
      favorites: []
    }, 500);
  }
}
