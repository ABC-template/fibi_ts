// ============================================
// api/chats/trash.ts
// Описание: Работа с корзиной (GET, POST, DELETE) с sync_token
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch, updateSyncToken, getSyncToken } from '../_lib/supabase-client';
import { isValidUUID, validateUUID } from '../_lib/validators';

export const config = { runtime: 'edge' };

/**
 * Получить содержимое корзины
 */
async function getTrash(
  userId: number,
  config: any,
  limit: number = 100,
  offset: number = 0
): Promise<{ chats: any[]; messages: any[] }> {
  const deletedChats = await supabaseFetch(
    `chats?user_id=eq.${userId}&deleted_at=not.is.null&select=id,title,topic_id,deleted_at,created_at&order=deleted_at.desc&limit=${limit}&offset=${offset}`,
    { method: 'GET' },
    config
  );

  let deletedMessages: any[] = [];

  if (deletedChats && Array.isArray(deletedChats) && deletedChats.length > 0) {
    const chatIds = deletedChats.map((c: any) => c.id).join(',');

    const messagesWithChats = await supabaseFetch(
      `messages?chat_id=in.(${chatIds})&deleted_at=not.is.null&select=id,text,chat_id,deleted_at,created_at,chats!inner(title)&order=deleted_at.desc&limit=${limit}&offset=${offset}`,
      { method: 'GET' },
      config
    );

    if (messagesWithChats && Array.isArray(messagesWithChats)) {
      deletedMessages = messagesWithChats.map((msg: any) => ({
        ...msg,
        chat_title: msg.chats?.title || 'Unknown'
      }));
      deletedMessages = deletedMessages.map(({ chats, ...rest }: any) => rest);
    }
  }

  return {
    chats: deletedChats || [],
    messages: deletedMessages || []
  };
}

/**
 * Восстановить из корзины
 */
async function restoreFromTrash(
  userId: number,
  id: string,
  type: 'chat' | 'message',
  config: any
): Promise<{ success: boolean; error?: string; syncToken?: string | null }> {
  validateUUID(id, 'ID');

  const now = new Date().toISOString();

  if (type === 'chat') {
    const chatCheck = await supabaseFetch(
      `chats?id=eq.${id}&user_id=eq.${userId}&deleted_at=not.is.null&select=id,deleted_at`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Chat not found or not in trash' };
    }

    const chatDeletedAt = chatCheck[0].deleted_at;

    await supabaseFetch(
      `messages?chat_id=eq.${id}&deleted_at=eq.${encodeURIComponent(chatDeletedAt)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: null,
          updated_at: now
        })
      },
      config
    );

    await supabaseFetch(
      `chats?id=eq.${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: null,
          updated_at: now
        })
      },
      config
    );

    console.log(`♻️ Восстановлен чат ${id} и сообщения, удаленные с ним`);
  } else if (type === 'message') {
    const msgCheck = await supabaseFetch(
      `messages?id=eq.${id}&deleted_at=not.is.null&select=chat_id`,
      { method: 'GET' },
      config
    );

    if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
      return { success: false, error: 'Message not found or not in trash' };
    }

    const chatId = msgCheck[0].chat_id;
    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Access denied' };
    }

    await supabaseFetch(
      `messages?id=eq.${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: null,
          updated_at: now
        })
      },
      config
    );

    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: now })
      },
      config
    );

    console.log(`♻️ Восстановлено сообщение ${id}`);
  } else {
    return { success: false, error: 'Invalid type' };
  }

  // Обновляем sync_token
  await updateSyncToken(userId, config);
  const newSyncToken = await getSyncToken(userId, config);

  return { success: true, syncToken: newSyncToken };
}

/**
 * Удалить навсегда (HARD DELETE)
 */
async function permanentDeleteFromTrash(
  userId: number,
  id: string,
  type: 'chat' | 'message',
  config: any
): Promise<{ success: boolean; error?: string; syncToken?: string | null }> {
  validateUUID(id, 'ID');

  if (type === 'chat') {
    const chatCheck = await supabaseFetch(
      `chats?id=eq.${id}&user_id=eq.${userId}&deleted_at=not.is.null&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Chat not found or not in trash' };
    }

    // Удаляем все сообщения чата
    await supabaseFetch(
      `messages?chat_id=eq.${id}`,
      { method: 'DELETE' },
      config
    );

    // Удаляем сам чат
    await supabaseFetch(
      `chats?id=eq.${id}`,
      { method: 'DELETE' },
      config
    );

    console.log(`🗑️ Чат ${id} удален навсегда (HARD DELETE)`);
  } else if (type === 'message') {
    const msgCheck = await supabaseFetch(
      `messages?id=eq.${id}&select=chat_id`,
      { method: 'GET' },
      config
    );

    if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
      return { success: false, error: 'Message not found' };
    }

    const chatId = msgCheck[0].chat_id;
    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Access denied' };
    }

    // Удаляем сообщение
    await supabaseFetch(
      `messages?id=eq.${id}`,
      { method: 'DELETE' },
      config
    );

    // Обновляем updated_at чата
    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      },
      config
    );

    console.log(`🗑️ Сообщение ${id} удалено навсегда (HARD DELETE)`);
  } else {
    return { success: false, error: 'Invalid type' };
  }

  // Обновляем sync_token
  await updateSyncToken(userId, config);
  const newSyncToken = await getSyncToken(userId, config);

  return { success: true, syncToken: newSyncToken };
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    // GET - получить корзину
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const trash = await getTrash(userId, config, Math.min(limit, 500), offset);
      return jsonResponse({
        success: true,
        ...trash,
        limit: Math.min(limit, 500),
        offset: offset
      });
    }

    // POST - восстановление
    if (request.method === 'POST') {
      let body: { id: string; type: 'chat' | 'message' };
      try {
        body = await request.json();
      } catch (err) {
        return errorResponse('Invalid JSON body', 400);
      }

      const { id, type } = body;
      if (!id || !type) {
        return errorResponse('Missing id or type', 400);
      }

      const result = await restoreFromTrash(userId, id, type, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        syncToken: result.syncToken
      });
    }

    // DELETE - удаление навсегда
    if (request.method === 'DELETE') {
      let body: { id: string; type: 'chat' | 'message' };
      try {
        body = await request.json();
      } catch (err) {
        return errorResponse('Invalid JSON body', 400);
      }

      const { id, type } = body;
      if (!id || !type) {
        return errorResponse('Missing id or type', 400);
      }

      const result = await permanentDeleteFromTrash(userId, id, type, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        syncToken: result.syncToken
      });
    }

    return errorResponse('Method Not Allowed', 405);
  } catch (err) {
    console.error('Trash handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
