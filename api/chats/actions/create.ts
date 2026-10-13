// ============================================
// api/chats/actions/create.ts
// Описание: Создание нового чата (с user_uuid, sync_token и agent_id)
// Версия: 5.2.0 — повторное создание того же чата (id уже есть у этого пользователя)
//                  считается успехом: повтор после сбоя сети больше не падает;
//                  первое сообщение проверяется по длине и не дублируется
//          5.1.0 — валидация topic_id пропускается для чатов с agent_id
//                  (тема кастомного агента — это его slug, а не встроенный
//                  topic из фиксированного списка; принадлежность к агенту
//                  уже определяется полем agent_id)
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
import { isValidUUID, isValidTopic, validateTopic, validateUserId, validateMessageLength } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface ICreateChatRequest {
  chat: {
    id?: string;
    topic_id?: string;
    title?: string;
    max_context?: number;
    user_renamed?: boolean;
    pinned?: boolean;
    agent_id?: string | null;
    modality?: string | null;
  };
  firstMessage?: {
    id?: string;
    text: string;
    type?: string;
    is_favorite?: boolean;
  };
  action?: string;
}

async function createChat(
  userId: number,
  userUuid: string,
  chatData: any,
  config: any
): Promise<{ success: boolean; chatId?: string; syncToken?: string | null; error?: string }> {
  try {
    if (chatData.id && !isValidUUID(chatData.id)) {
      return { success: false, error: 'Invalid chat id' };
    }
    const chatId = chatData.id || crypto.randomUUID();
    const topic = chatData.topic_id || 'fast';
    const title = chatData.title || `Чат в разделе ${topic}`;
    const maxContext = chatData.max_context || 15;
    const userRenamed = chatData.user_renamed || false;
    const pinned = chatData.pinned || false;
    const agentId = chatData.agent_id || null;
    const modality = chatData.modality || null;

    // Фиксированный список тем (ALLOWED_TOPICS в validators.ts) — это
    // встроенные темы приложения (code/creative/fast/kitchen/analytics).
    // Чаты с кастомными агентами используют в качестве topic_id slug
    // самого агента (например, "gen_img"), который в этот список не
    // входит и не должен в него входить — принадлежность к агенту уже
    // однозначно определяется полем agent_id. Поэтому валидируем topic
    // по фиксированному списку только для чатов без агента.
    if (!agentId) {
      validateTopic(topic);
    }

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

    // Чат с таким id уже есть: свой — повтор после сбоя, чужой — отказ
    const existing = await supabaseFetch(
      `chats?id=eq.${chatId}&select=id,user_id`,
      { method: 'GET' },
      config
    );
    if (Array.isArray(existing) && existing.length > 0) {
      if (Number(existing[0].user_id) !== Number(userId)) {
        return { success: false, error: 'Chat id conflict' };
      }
      const token = await getSyncToken(userId, config);
      return { success: true, chatId, syncToken: token, error: null };
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
          pinned: pinned,
          agent_id: agentId,
          modality: modality,
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
      const validation = validateMessageLength(messageData.text);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      const msgId = messageData.id && isValidUUID(messageData.id) ? messageData.id : crypto.randomUUID();
      const msgType = messageData.type === 'ai-msg' ? 'ai-msg' : 'user-msg';

      // Повтор с тем же id не создаёт дубль и не перезаписывает существующее
      const result = await supabaseFetch(
        'messages?on_conflict=id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
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

    if (chat.topic_id && !chat.agent_id && !isValidTopic(chat.topic_id)) {
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
      syncToken: result.syncToken,
      pinned: chat.pinned || false,
      agentId: chat.agent_id || null,
      modality: chat.modality || null,
    });
  } catch (err) {
    console.error('Create chat handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
