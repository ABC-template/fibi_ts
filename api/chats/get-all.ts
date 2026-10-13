// ============================================
// api/chats/get-all.ts
// Описание: Получение ВСЕХ чатов с сообщениями для пользователя
// Версия: 4.2.0 - чаты и сообщения загружаются страницами по 1000 (раньше всё сверх
//                 1000 строк молча терялось); сообщения фильтруются через связь
//                 с чатом, а не длинным списком id в адресе
//          4.1.0 - agent_id/modality чатов и metadata сообщений (генерации);
//                 sync_token не перегенерируется; убран ложный Content-Encoding: gzip
//          4.0.0 - добавлен pinned, сортировка по pinned + updated_at
// ============================================

import { authenticate } from '../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch, getUserUuid, updateSyncToken, getSyncToken } from '../_lib/supabase-client';

export const config = {
  runtime: 'edge',
  maxDuration: 30
};

/** Сколько строк просим за один запрос (PostgREST отдаёт не больше max-rows, обычно 1000) */
const PAGE_SIZE = 1000;
/** Предохранитель: не больше стольких страниц (сообщений: 200 000) */
const MAX_PAGES = 200;

/**
 * Все строки по запросу, страницами. Раньше один запрос молча обрезался
 * на 1000 строк — часть чатов/сообщений не доходила до приложения.
 * Порядок обязан быть однозначным (последний ключ — id).
 */
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

/**
 * Получить все чаты пользователя с сообщениями
 * Возвращает ВСЕ чаты, включая удаленные (deleted_at)
 * Сортировка: сначала закреплённые (pinned = true), затем по updated_at DESC
 */
async function getAllChatsWithMessages(userUuid: string, config: any): Promise<any[]> {
  // 1. ВСЕ чаты пользователя (без фильтра deleted_at!), страницами
  const chats = await fetchAllPages(
    `chats?user_uuid=eq.${userUuid}&order=pinned.desc,updated_at.desc,id.asc`,
    config
  );

  if (chats.length === 0) {
    return [];
  }

  // 2. ВСЕ сообщения этих чатов (включая удалённые), страницами. Фильтр — через
  //    связь с чатом, а не списком id в адресе (на сотнях чатов адрес не помещался)
  const allMessages = await fetchAllPages(
    `messages?select=id,chat_id,text,msg_type,is_favorite,created_at,deleted_at,metadata,chats!inner(user_uuid)` +
      `&chats.user_uuid=eq.${userUuid}&order=created_at.asc,id.asc`,
    config
  );

  // 3. Группируем сообщения по чатам
  const messagesByChat: Record<string, any[]> = {};
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
      deleted_at: msg.deleted_at,
      metadata: msg.metadata || null
    });
  }

  // 4. Собираем полные данные
  return chats.map(chat => ({
    id: chat.id,
    title: chat.title,
    topic_id: chat.topic_id,
    max_context: chat.max_context || 15,
    user_renamed: chat.user_renamed || false,
    pinned: chat.pinned || false,
    agent_id: chat.agent_id || null,
    modality: chat.modality || null,
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
    let totalPinnedChats = 0;
    
    for (const chat of chats) {
      totalMessages += chat.messages.length;
      if (chat.deleted_at) {
        totalDeletedChats++;
      }
      if (chat.pinned) {
        totalPinnedChats++;
      }
    }

    console.log(`✅ [get-all] Загружено ${chats.length} чатов (${totalDeletedChats} в корзине, ${totalPinnedChats} закреплено), ${totalMessages} сообщений за ${elapsed}ms`);

    // Токен отдаём как есть: клиент сохранит его после полной загрузки.
    // Перегенерация здесь заставила бы другие устройства зря перезагружаться.
    let syncToken: string | null = null;
    if (sync) {
      syncToken = await getSyncToken(telegramId, config);
      if (!syncToken) {
        syncToken = await updateSyncToken(telegramId, config);
      }
    }

    const responseData = {
      success: true,
      chats: chats,
      total_chats: chats.length,
      total_messages: totalMessages,
      total_deleted_chats: totalDeletedChats,
      total_pinned_chats: totalPinnedChats,
      loaded_at: new Date().toISOString(),
      syncToken: syncToken || null
    };

    // Сжатие делает сама платформа; ручной Content-Encoding: gzip при
    // несжатом теле ломает разбор ответа в части клиентов
    return jsonResponse(responseData, 200, {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
  } catch (err) {
    console.error('Get all chats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
