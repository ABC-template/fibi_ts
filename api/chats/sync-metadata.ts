// ============================================
// api/chats/sync-metadata.ts
// Описание: Получение метаданных чатов для синхронизации
// Версия: 3.1.0 - чаты и избранное страницами по 1000 (раньше обрезалось на 1000);
//                 избранное фильтруется через связь с чатом, а не списком id в адресе
//          3.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch, canUserSync } from '../_lib/supabase-client';

export const config = { runtime: 'edge' };

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

/** Все строки по запросу, страницами (порядок должен быть однозначным) */
async function fetchAllPages(pathWithOrder: string, config: any): Promise<any[]> {
  const all: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await supabaseFetch(
      `${pathWithOrder}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      { method: 'GET' },
      config
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

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
    const chats = await fetchAllPages(
      `chats?user_id=eq.${userId}&deleted_at=is.null&select=id,topic_id,title,max_context,user_renamed,updated_at,created_at&order=updated_at.desc,id.asc`,
      config
    );

    // Получаем избранные сообщения (только из живых чатов пользователя)
    let favorites: any[] = [];
    if (chats.length > 0) {
      favorites = await fetchAllPages(
        `messages?is_favorite=eq.true&deleted_at=is.null` +
          `&select=id,chat_id,text,is_favorite,updated_at,chats!inner(user_id,deleted_at)` +
          `&chats.user_id=eq.${userId}&chats.deleted_at=is.null&order=updated_at.desc,id.asc`,
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
