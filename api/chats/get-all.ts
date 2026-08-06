// ============================================
// api/chats/get-all.ts
// Описание: Получение ВСЕХ чатов с сообщениями для пользователя
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch, getUserUuid, updateSyncToken, getSyncToken } from '../_lib/supabase-client';

export const config = {
  runtime: 'edge',
  maxDuration: 30
};

/**
 * Получить все чаты пользователя с сообщениями
 * Возвращает ВСЕ чаты, включая удаленные (deleted_at)
 */
async function getAllChatsWithMessages(userUuid: string, config: any): Promise<any[]> {
  // 1. Получаем ВСЕ чаты пользователя (без фильтра deleted_at!)
  const chats = await supabaseFetch(
    `chats?user_uuid=eq.${userUuid}&order=updated_at.desc`,
    { method: 'GET' },
    config
  );

  if (!chats || !Array.isArray(chats) || chats.length === 0) {
    return [];
  }

  // 2. Получаем ID всех чатов
  const chatIds = chats.map(c => c.id);
  const chatIdsStr = chatIds.join(',');

  // 3. Получаем ВСЕ сообщения для этих чатов (включая удаленные сообщения)
  let allMessages: any[] = [];
  if (chatIds.length > 0) {
    allMessages = await supabaseFetch(
      `messages?chat_id=in.(${chatIdsStr})&order=created_at.asc`,
      { method: 'GET' },
      config
    );
  }

  // 4. Группируем сообщения по чатам
  const messagesByChat: Record<string, any[]> = {};
  if (allMessages && Array.isArray(allMessages)) {
    for (const msg of allMessages) {
      if (!messagesByChat[msg.chat_id]) {
        messagesByChat[msg.chat_id] = [];
      }
      messagesByChat[msg.chat_id].push({
        id: msg.id,
        text: msg.text,
        msg_type: msg.msg_type,
        is_favorite: msg.is_favorite || false,
        created_at: msg.created_at,
        deleted_at: msg.deleted_at
      });
    }
  }

  // 5. Собираем полные данные
  return chats.map(chat => ({
    id: chat.id,
    title: chat.title,
    topic_id: chat.topic_id,
    max_context: chat.max_context || 15,
    user_renamed: chat.user_renamed || false,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
    deleted_at: chat.deleted_at || null,
    messages: messagesByChat[chat.id] || []
  }));
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
    const telegramId = auth.userId!;
    const config = getSupabaseConfig('service');

    // Получаем UUID пользователя
    const userUuid = await getUserUuid(userId, config);
    if (!userUuid) {
      console.error(`❌ Не найден UUID для пользователя ${userId}`);
      return errorResponse('User not found', 404);
    }

    // Проверяем параметр sync
    const { searchParams } = new URL(request.url);
    const sync = searchParams.get('sync') === 'true';

    console.log(`📋 [get-all] Загружаем ВСЕ чаты для пользователя ${userId} (sync=${sync})`);

    const startTime = Date.now();
    const chats = await getAllChatsWithMessages(userUuid, config);
    const elapsed = Date.now() - startTime;

    // Подсчитываем статистику
    let totalMessages = 0;
    let totalDeletedChats = 0;
    for (const chat of chats) {
      totalMessages += chat.messages.length;
      if (chat.deleted_at) {
        totalDeletedChats++;
      }
    }

    console.log(`✅ [get-all] Загружено ${chats.length} чатов (${totalDeletedChats} в корзине), ${totalMessages} сообщений за ${elapsed}ms`);

    // ЕСЛИ sync=true → ПРОВЕРЯЕМ, НУЖНО ЛИ ОБНОВЛЯТЬ ТОКЕН
    let syncToken: string | null = null;
    if (sync) {
      // Получаем токен клиента из заголовка
      const clientSyncToken = request.headers.get('x-sync-token') || null;
      const dbSyncToken = await getSyncToken(telegramId, config);

      if (clientSyncToken !== dbSyncToken) {
        // НЕ СОВПАДАЮТ → ОБНОВЛЯЕМ!
        syncToken = await updateSyncToken(telegramId, config);
        console.log(`🔄 [get-all] sync_token обновлен (не совпадал): ${syncToken?.substring(0, 8)}...`);
      } else {
        // СОВПАДАЮТ → ОСТАВЛЯЕМ
        syncToken = dbSyncToken;
        console.log(`✅ [get-all] sync_token совпадает, обновление не требуется`);
      }
    }

    const responseData = {
      success: true,
      chats: chats,
      total_chats: chats.length,
      total_messages: totalMessages,
      total_deleted_chats: totalDeletedChats,
      loaded_at: new Date().toISOString(),
      syncToken: syncToken || null
    };

    return jsonResponse(responseData, 200, {
      'Content-Encoding': 'gzip',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
  } catch (err) {
    console.error('Get all chats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
