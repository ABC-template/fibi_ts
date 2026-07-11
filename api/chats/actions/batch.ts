// ============================================
// api/chats/actions/batch.ts
// Описание: Массовые операции с сообщениями (с user_uuid)
// Версия: 3.0.1 - FIXED
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, canUserSync, getUserUuid } from '../../_lib/supabase-client';
import { isValidUUID, isValidTopic, validateTopic, validateMessageLength } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface IBatchRequest {
  action: 'batch_messages' | 'create_chat_batch';
  chatId?: string;
  topicId?: string;
  chatTitle?: string;
  maxContext?: number;
  userRenamed?: boolean;
  messages: Array<{
    id?: string;
    text: string;
    type?: string;
    is_favorite?: boolean;
  }>;
  chat?: {
    id?: string;
    topic_id?: string;
    title?: string;
    max_context?: number;
    user_renamed?: boolean;
  };
}

/**
 * Массовое добавление сообщений
 */
async function batchAddMessages(
  userId: number,
  userUuid: string,
  chatId: string,
  messages: any[],
  config: any
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!isValidUUID(chatId)) {
      return { success: false, count: 0, error: 'Invalid Chat ID format' };
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return { success: false, count: 0, error: 'No messages to save' };
    }

    const canSync = await canUserSync(userId, config);
    if (!canSync) {
      return {
        success: false,
        count: 0,
        error: 'Синхронизация недоступна для вашего тарифного плана'
      };
    }

    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, count: 0, error: 'Chat not found or access denied' };
    }

    let savedCount = 0;

    for (const msg of messages) {
      const validation = validateMessageLength(msg.text, 10000);
      if (!validation.valid) {
        console.warn('Skipping invalid message:', validation.error);
        continue;
      }

      const msgId = msg.id || crypto.randomUUID();
      const msgType = msg.type || 'user-msg';

      try {
        await supabaseFetch(
          'messages',
          {
            method: 'POST',
            body: JSON.stringify({
              id: msgId,
              chat_id: chatId,
              msg_type: msgType,
              text: msg.text,
              is_favorite: msg.is_favorite || false,
            })
          },
          config
        );
        savedCount++;
      } catch (err) {
        console.error('Failed to save message:', (err as Error).message);
      }
    }

    if (savedCount > 0) {
      await supabaseFetch(
        `chats?id=eq.${chatId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ updated_at: new Date().toISOString() })
        },
        config
      );
    }

    return { success: true, count: savedCount, error: null };
  } catch (err) {
    console.error('Batch add messages error:', (err as Error).message);
    return { success: false, count: 0, error: (err as Error).message };
  }
}

/**
 * Создать чат и добавить batch сообщений
 */
async function createChatWithBatch(
  userId: number,
  userUuid: string,
  chatData: any,
  messages: any[],
  config: any
): Promise<{ success: boolean; chatId?: string; count?: number; error?: string }> {
  try {
    const topic = chatData.topic_id || 'fast';
    validateTopic(topic);

    const canSync = await canUserSync(userId, config);
    if (!canSync) {
      return {
        success: false,
        error: 'Синхронизация недоступна для вашего тарифного плана'
      };
    }

    const chatId = chatData.id || crypto.randomUUID();

    // СОЗДАЕМ ЧАТ С user_uuid
    await supabaseFetch(
      'chats',
      {
        method: 'POST',
        body: JSON.stringify({
          id: chatId,
          user_id: userId,
          user_uuid: userUuid,
          topic_id: topic,
          title: chatData.title || `Чат в разделе ${topic}`,
          max_context: chatData.max_context || 15,
          user_renamed: chatData.user_renamed || false,
        })
      },
      config
    );

    let savedCount = 0;

    if (messages && Array.isArray(messages)) {
      for (const msg of messages) {
        const validation = validateMessageLength(msg.text);
        if (!validation.valid) {
          continue;
        }

        const msgId = msg.id || crypto.randomUUID();
        const msgType = msg.type || 'user-msg';

        try {
          await supabaseFetch(
            'messages',
            {
              method: 'POST',
              body: JSON.stringify({
                id: msgId,
                chat_id: chatId,
                msg_type: msgType,
                text: msg.text,
                is_favorite: msg.is_favorite || false,
              })
            },
            config
          );
          savedCount++;
        } catch (err) {
          console.error('Failed to save message in batch:', (err as Error).message);
        }
      }
    }

    return {
      success: true,
      chatId: chatId,
      count: savedCount,
      error: null
    };
  } catch (err) {
    console.error('Create chat with batch error:', (err as Error).message);
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

    // ПОЛУЧАЕМ UUID ПОЛЬЗОВАТЕЛЯ
    const userUuid = await getUserUuid(userId, config);
    if (!userUuid) {
      console.error(`❌ Не найден UUID для пользователя ${userId}`);
      return errorResponse('User not found', 404);
    }

    let body: IBatchRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { action, chatId, topicId, chatTitle, maxContext, userRenamed, messages, chat } = body;

    if (action === 'batch_messages') {
      if (!chatId || !messages) {
        return errorResponse('Missing chatId or messages', 400);
      }

      const result = await batchAddMessages(userId, userUuid, chatId, messages, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        synced: true,
        count: result.count,
        chatId: chatId
      });
    } else if (action === 'create_chat_batch') {
      if (!messages) {
        return errorResponse('Missing messages', 400);
      }

      const chatData = chat || {
        id: body.chatId || crypto.randomUUID(),
        topic_id: topicId || 'fast',
        title: chatTitle || 'Новый чат',
        max_context: maxContext || 15,
        user_renamed: userRenamed || false
      };

      const result = await createChatWithBatch(userId, userUuid, chatData, messages, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        chatId: result.chatId,
        count: result.count || 0
      });
    } else {
      return errorResponse('Unknown action', 400);
    }
  } catch (err) {
    console.error('Batch handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
