// ============================================
// api/chats/actions/message.ts
// Описание: Работа с сообщениями (создание, удаление) с sync_token
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, updateSyncToken, getSyncToken } from '../../_lib/supabase-client';
import { isValidUUID, validateUUID, validateMessageLength } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface IMessageRequest {
  action: 'new_message' | 'delete_message';
  chatId: string;
  message?: {
    id?: string;
    text: string;
    type?: string;
    is_favorite?: boolean;
  };
  messageId?: string;
}

/**
 * Добавить сообщение в чат
 */
async function addMessage(
  userId: number,
  chatId: string,
  messageData: any,
  config: any
): Promise<{ success: boolean; messageId?: string; syncToken?: string | null; error?: string }> {
  try {
    validateUUID(chatId, 'Chat ID');

    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Chat not found or access denied' };
    }

    const validation = validateMessageLength(messageData.text);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const msgId = messageData.id || crypto.randomUUID();
    const msgType = messageData.type || 'user-msg';

    const existingCheck = await supabaseFetch(
      `messages?id=eq.${msgId}&select=id`,
      { method: 'GET' },
      config
    );

    if (existingCheck && Array.isArray(existingCheck) && existingCheck.length > 0) {
      await supabaseFetch(
        `messages?id=eq.${msgId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            chat_id: chatId,
            msg_type: msgType,
            text: messageData.text,
            is_favorite: messageData.is_favorite || false,
            deleted_at: null
          })
        },
        config
      );
    } else {
      await supabaseFetch(
        'messages',
        {
          method: 'POST',
          body: JSON.stringify({
            id: msgId,
            chat_id: chatId,
            msg_type: msgType,
            text: messageData.text,
            is_favorite: messageData.is_favorite || false,
          })
        },
        config
      );
    }

    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      },
      config
    );

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    return { success: true, messageId: msgId, syncToken: newSyncToken, error: null };
  } catch (err) {
    console.error('Add message error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Удалить сообщение (soft delete)
 */
async function deleteMessage(
  userId: number,
  chatId: string,
  messageId: string,
  config: any
): Promise<{ success: boolean; syncToken?: string | null; error?: string }> {
  try {
    validateUUID(chatId, 'Chat ID');
    validateUUID(messageId, 'Message ID');

    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Access denied' };
    }

    const msgCheck = await supabaseFetch(
      `messages?id=eq.${messageId}&chat_id=eq.${chatId}&deleted_at=is.null&select=id`,
      { method: 'GET' },
      config
    );

    if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
      return { success: false, error: 'Message not found or already deleted' };
    }

    await supabaseFetch(
      `messages?id=eq.${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      },
      config
    );

    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      },
      config
    );

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    console.log(`🗑️ Сообщение ${messageId} помечено как удалённое`);
    return { success: true, syncToken: newSyncToken, error: null };
  } catch (err) {
    console.error('Delete message error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
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

    let body: IMessageRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { action, chatId, message, messageId } = body;

    if (action === 'new_message') {
      if (!chatId || !message) {
        return errorResponse('Missing chatId or message', 400);
      }

      const result = await addMessage(userId, chatId, message, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        synced: true,
        messageId: result.messageId,
        chatId: chatId,
        syncToken: result.syncToken
      });
    } else if (action === 'delete_message') {
      if (!chatId || !messageId) {
        return errorResponse('Missing chatId or messageId', 400);
      }

      const result = await deleteMessage(userId, chatId, messageId, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        syncToken: result.syncToken
      });
    } else {
      return errorResponse('Unknown action', 400);
    }
  } catch (err) {
    console.error('Message handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
