// ============================================
// api/chats/mutations/delete-with-confirm.ts
// Описание: Удаление с подтверждением (упрощенная версия)
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, updateSyncToken, getSyncToken } from '../../_lib/supabase-client';
import { isValidUUID, validateUUID } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface IDeleteRequest {
  action: 'delete_chat_with_confirm' | 'delete_message_with_confirm';
  chatId?: string;
  messageId?: string;
}

/**
 * Удалить чат (HARD DELETE) - упрощенная версия
 */
async function deleteChatHard(
  userId: number,
  chatId: string,
  config: any
): Promise<{ success: boolean; syncToken?: string | null; error?: string }> {
  try {
    validateUUID(chatId, 'Chat ID');

    // Проверяем, что чат принадлежит пользователю и уже в корзине
    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=not.is.null&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Chat not found or not in trash' };
    }

    // Удаляем все сообщения чата
    await supabaseFetch(
      `messages?chat_id=eq.${chatId}`,
      { method: 'DELETE' },
      config
    );

    // Удаляем сам чат
    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      { method: 'DELETE' },
      config
    );

    console.log(`🗑️ Чат ${chatId} удален навсегда (HARD DELETE)`);

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    return { success: true, syncToken: newSyncToken };
  } catch (err) {
    console.error('Delete chat hard error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Удалить сообщение (HARD DELETE) - упрощенная версия
 */
async function deleteMessageHard(
  userId: number,
  messageId: string,
  config: any
): Promise<{ success: boolean; syncToken?: string | null; error?: string }> {
  try {
    validateUUID(messageId, 'Message ID');

    // Проверяем, что сообщение принадлежит пользователю
    const msgCheck = await supabaseFetch(
      `messages?id=eq.${messageId}&select=chat_id`,
      { method: 'GET' },
      config
    );

    if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
      return { success: false, error: 'Message not found' };
    }

    const chatId = msgCheck[0].chat_id;

    // Проверяем, что чат принадлежит пользователю
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
      `messages?id=eq.${messageId}`,
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

    console.log(`🗑️ Сообщение ${messageId} удалено навсегда (HARD DELETE)`);

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    return { success: true, syncToken: newSyncToken };
  } catch (err) {
    console.error('Delete message hard error:', (err as Error).message);
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

    let body: IDeleteRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { action, chatId, messageId } = body;

    if (action === 'delete_chat_with_confirm') {
      if (!chatId) {
        return errorResponse('Missing chatId', 400);
      }

      const result = await deleteChatHard(userId, chatId, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        syncToken: result.syncToken
      });
    } else if (action === 'delete_message_with_confirm') {
      if (!messageId) {
        return errorResponse('Missing messageId', 400);
      }

      const result = await deleteMessageHard(userId, messageId, config);
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
    console.error('Delete with confirm error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
