// ============================================
// api/chats/actions/create.ts
// Описание: Создание нового чата (с user_uuid и sync_token)
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import {
  getSupabaseConfig,
  supabaseFetch,
  getUserUuid,
  updateSyncToken,
  getSyncToken
} from '../../_lib/supabase-client';
import { isValidUUID, isValidTopic, validateTopic, validateUserId } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface ICreateChatRequest {
  chat: {
    id?: string;
    topic_id?: string;
    title?: string;
    max_context?: number;
    user_renamed?: boolean;
  };
  firstMessage?: {
    id?: string;
    text: string;
    type?: string;
    is_favorite?: boolean;
  };
  action?: string;
}

/**
 * Создать новый чат
 */
async function createChat(
  userId: number,
  userUuid: string,
  chatData: any,
  config: any
): Promise<{ success: boolean; chatId?: string; syncToken?: string | null; error?: string }> {
  try {
    const chatId = chatData.id || crypto.randomUUID();
    const topic = chatData.topic_id || 'fast';
    const title = chatData.title || `Чат в разделе ${topic}`;
    const maxContext = chatData.max_context || 15;
    const userRenamed = chatData.user_renamed || false;

    validateTopic(topic);

    const canSync = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=role,premium_until`,
      { method: 'GET' },
      config
    );

    let syncAllowed = false;
    if (canSync && Array.isArray(canSync) && canSync.length > 0) {
      const user = canSync[0];
      if (['admin', 'creator'].includes(user.role)) {
        syncAllowed = true;
      } else if (user.role === 'premium' && user.premium_until && new Date(user.premium_until) > new Date()) {
        syncAllowed = true;
      }
    }

    if (!syncAllowed) {
      return {
        success: false,
        error: 'Синхронизация недоступна для вашего тарифного плана'
      };
    }

    const result = await supabaseFetch(
      'chats',
      {
        method: 'POST',
        body: JSON.stringify({
          id: chatId,
          user_id: userId,
          user_uuid: userUuid,
          topic_id: topic,
          title: title,
          max_context: maxContext,
          user_renamed: userRenamed,
        })
      },
      config
    );

    if (!result || typeof result !== 'object' || !result.id) {
      console.error('Create chat failed:', result);
      return {
        success: false,
        error: 'Не удалось создать чат в облаке'
      };
    }

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    return {
      success: true,
      chatId: chatId,
      syncToken: newSyncToken,
      error: null
    };
  } catch (err) {
    console.error('Create chat error:', (err as Error).message);
    return {
      success: false,
      error: (err as Error).message
    };
  }
}

/**
 * Создать чат с первым сообщением
 */
async function createChatWithMessage(
  userId: number,
  userUuid: string,
  chatData: any,
  messageData: any | null,
  config: any
): Promise<{ success: boolean; chatId?: string; messageId?: string | null; syncToken?: string | null; error?: string }> {
  try {
    const chatResult = await createChat(userId, userUuid, chatData, config);
    if (!chatResult.success) {
      return chatResult;
    }

    const chatId = chatResult.chatId!;
    let messageId: string | null = null;

    if (messageData && messageData.text) {
      const msgId = messageData.id || crypto.randomUUID();
      const msgType = messageData.type || 'user-msg';

      const result = await supabaseFetch(
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

      if (result && typeof result === 'object' && result.id) {
        messageId = msgId;
      } else {
        console.warn('Message created but response invalid:', result);
        messageId = msgId;
      }
    }

    return {
      success: true,
      chatId: chatId,
      messageId: messageId,
      syncToken: chatResult.syncToken,
      error: null
    };
  } catch (err) {
    console.error('Create chat with message error:', (err as Error).message);
    return {
      success: false,
      error: (err as Error).message
    };
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

    const userUuid = await getUserUuid(userId, config);
    if (!userUuid) {
      console.error(`❌ Не найден UUID для пользователя ${userId}`);
      return errorResponse('User not found', 404);
    }

    let body: ICreateChatRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { chat, firstMessage, action } = body;

    if (!chat) {
      return errorResponse('Missing chat data', 400);
    }

    if (chat.topic_id && !isValidTopic(chat.topic_id)) {
      return errorResponse(`Invalid topic: ${chat.topic_id}`, 400);
    }

    const result = await createChatWithMessage(
      userId,
      userUuid,
      chat,
      firstMessage || null,
      config
    );

    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', 400);
    }

    return jsonResponse({
      success: true,
      chatId: result.chatId,
      messageId: result.messageId,
      syncToken: result.syncToken
    });
  } catch (err) {
    console.error('Create chat handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
