// ============================================
// api/chats/actions/message.ts
// Описание: Работа с сообщениями (создание, удаление) с sync_token
// Версия: 3.5.0 - delete_message удаляет сообщение навсегда (как вызывает приложение; раньше
//                 приложение ходило в дублирующий /chats/mutations/delete-with-confirm,
//                 а здесь оставалась неиспользуемая мягкая пометка)
//          3.4.0 - новые сообщения в облако — только при разрешённой синхронизации
//                 (can_sync: PRO/admin); удалять своё можно всегда
//          3.3.0 - удаление сообщения запрещено (409), пока в чате идёт ответ или
//                 генерация (иначе можно было стереть сообщение-задание и обойти
//                 ограничения); hold_id (заморозка энергии) — служебное поле
//          3.2.0 - служебные поля генерации в metadata (job_id, key_index, lock_token,
//                 charged, finalizing и др.) от клиента не принимаются; metadata
//                 существующего сообщения-генерации клиент не перезаписывает (раньше
//                 можно было поставить charged и не заплатить за видео); незавершённый
//                 статус генерации из клиента сохраняется как failed
//          3.1.0 - нельзя перезаписать сообщение из чужого чата по его id;
//                 metadata (генерации) при выгрузке локальных чатов; isFavorite
//          3.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, updateSyncToken, getSyncToken, canUserSync } from '../../_lib/supabase-client';
import { isValidUUID, validateUUID, validateMessageLength } from '../../_lib/validators';
import { assertChatsNotBusy, MESSAGE_DELETE_BUSY_MESSAGE } from '../../_lib/chat-lock';
import { HttpError } from '../../_lib/http-error';

export const config = { runtime: 'edge' };

interface IMessageRequest {
  action: 'new_message' | 'delete_message';
  chatId: string;
  message?: {
    id?: string;
    text: string;
    type?: string;
    is_favorite?: boolean;
    isFavorite?: boolean;
    metadata?: Record<string, any> | null;
  };
  messageId?: string;
}

/** Максимальный размер metadata сообщения (байт JSON) */
const MAX_METADATA_BYTES = 20_000;

const ALLOWED_TYPES = new Set(['user-msg', 'ai-msg']);

/** Поля metadata, которые пишет только сервер (генерации: задание, ключ, замок, оплата) */
const SERVER_METADATA_KEYS = [
  'job_id',
  'key_index',
  'lock_token',
  'hold_id',
  'charged',
  'charge',
  'finalizing',
  'finalize_attempts',
  'finalize_error',
  'usage',
  'cost_usd',
];

/** Незавершённые статусы генерации: из клиента такое сообщение не может быть «в работе» */
const ACTIVE_GENERATION_STATUSES = new Set(['pending', 'processing', 'running', 'in_progress', 'queued']);

/**
 * metadata принимаем только как объект разумного размера, без служебных полей.
 * Подделать чужие файлы через неё нельзя: ссылки на медиа выдаёт /media/sign
 * только владельцу файла.
 */
function sanitizeMetadata(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  try {
    const json = JSON.stringify(raw);
    if (json.length > MAX_METADATA_BYTES) return null;
    const meta: Record<string, any> = JSON.parse(json);
    for (const key of SERVER_METADATA_KEYS) delete meta[key];
    if (meta.kind === 'generation' && ACTIVE_GENERATION_STATUSES.has(String(meta.status))) {
      meta.status = 'failed';
    }
    return Object.keys(meta).length > 0 ? meta : null;
  } catch {
    return null;
  }
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

    const msgId = messageData.id && isValidUUID(messageData.id) ? messageData.id : crypto.randomUUID();
    const msgType = ALLOWED_TYPES.has(messageData.type) ? messageData.type : 'user-msg';
    const isFavorite = messageData.is_favorite === true || messageData.isFavorite === true;
    const metadata = sanitizeMetadata(messageData.metadata);

    const existingCheck = await supabaseFetch(
      `messages?id=eq.${msgId}&select=id,chat_id,metadata`,
      { method: 'GET' },
      config
    );

    if (existingCheck && Array.isArray(existingCheck) && existingCheck.length > 0) {
      // Сообщение с таким id уже есть. Переписать его можно, только если оно
      // лежит в чате этого же пользователя (иначе это чужое сообщение).
      const existingChatId = existingCheck[0].chat_id;
      if (existingChatId !== chatId) {
        const ownerCheck = existingChatId
          ? await supabaseFetch(
              `chats?id=eq.${existingChatId}&user_id=eq.${userId}&select=id`,
              { method: 'GET' },
              config
            )
          : [];
        if (!ownerCheck || !Array.isArray(ownerCheck) || ownerCheck.length === 0) {
          return { success: false, error: 'Message id conflict' };
        }
      }

      const patch: Record<string, any> = {
        chat_id: chatId,
        msg_type: msgType,
        text: messageData.text,
        is_favorite: isFavorite,
        deleted_at: null
      };
      // metadata генерации ведёт сервер (статус, оплата, файлы) — клиент её не меняет
      const serverMeta = existingCheck[0].metadata;
      const isGeneration = serverMeta && typeof serverMeta === 'object' && serverMeta.kind === 'generation';
      if (metadata && !isGeneration) patch.metadata = metadata;

      await supabaseFetch(
        `messages?id=eq.${msgId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch)
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
            is_favorite: isFavorite,
            metadata: metadata
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
 * Удалить сообщение навсегда (в корзину сообщения не попадают — так работает приложение)
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

    // Пока в чате идёт ответ или генерация, сообщения не удаляются (бросает 409)
    await assertChatsNotBusy(userId, [chatId], config, MESSAGE_DELETE_BUSY_MESSAGE);

    const msgCheck = await supabaseFetch(
      `messages?id=eq.${messageId}&chat_id=eq.${chatId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
      return { success: false, error: 'Message not found' };
    }

    await supabaseFetch(
      `messages?id=eq.${messageId}&chat_id=eq.${chatId}`,
      { method: 'DELETE' },
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

    console.log(`🗑️ Сообщение ${messageId} удалено навсегда`);
    return { success: true, syncToken: newSyncToken, error: null };
  } catch (err) {
    if (err instanceof HttpError) throw err;
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
      if (!(await canUserSync(userId, config))) {
        return errorResponse('Синхронизация недоступна для вашего тарифа', 403);
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
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('Message handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
