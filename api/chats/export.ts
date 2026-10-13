// ============================================
// api/chats/export.ts
// Описание: Экспорт облачного архива (PRO и льготный период после окончания подписки)
// Версия: 4.0.0 - локальный экспорт (POST) удалён: работал без авторизации и был
//                 бесплатным вычислительным эндпоинтом в обход блокировки и подписки
//                 на канал; локальный архив собирает приложение (src/modules/export-local.ts)
//          3.2.0 - облачный архив: агент/тип чата, запрос генерации и ссылки на медиа
//                  (действуют до удаления облака или 7 дней)
//          3.1.0 - исправлены импорты
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch
} from '../_lib/index';
import { getOwnedFiles, signUrls } from '../_lib/media';

export const config = { runtime: 'edge' };

const MAX_EXPORT_SIZE_BYTES = 10000000; // 10MB
const MAX_MESSAGES_PER_CHUNK = 1000;

/**
 * Экспорт облачного архива (только PRO или льготный период)
 */
async function exportCloudArchive(userId: number, config: any): Promise<any> {
  try {
    // Проверяем права
    const userCheck = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=role,data_deadline,premium_until`,
      { method: 'GET' },
      config
    );

    if (!userCheck || !Array.isArray(userCheck) || userCheck.length === 0) {
      return { success: false, error: 'User not found' };
    }

    const currentUser = userCheck[0];
    const isPro = ['creator', 'admin', 'premium'].includes(currentUser.role);

    let hasGracePeriod = false;
    let daysLeft = 0;

    if (currentUser.data_deadline) {
      const deadline = new Date(currentUser.data_deadline);
      const now = new Date();
      if (deadline > now) {
        hasGracePeriod = true;
        daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    if (!isPro && !hasGracePeriod) {
      return {
        success: false,
        error: 'Скачивание облачного архива доступно только PRO-пользователям',
        fallbackToLocal: true
      };
    }

    // Получаем чаты
    const chats = await supabaseFetch(
      `chats?user_id=eq.${userId}&deleted_at=is.null&select=*&order=updated_at.desc`,
      { method: 'GET' },
      config
    );

    const compiledArchive: any[] = [];
    let totalMessages = 0;

    if (chats && Array.isArray(chats) && chats.length > 0) {
      // Получаем все сообщения
      let allMessages: any[] = [];

      for (const chat of chats) {
        const encodedChatId = encodeURIComponent(chat.id);
        let offset = 0;
        const limit = 500;
        let hasMore = true;

        while (hasMore) {
          const messagesBatch = await supabaseFetch(
            `messages?chat_id=eq.${encodedChatId}&order=created_at.asc&limit=${limit}&offset=${offset}`,
            { method: 'GET' },
            config
          );

          if (messagesBatch && Array.isArray(messagesBatch) && messagesBatch.length > 0) {
            allMessages.push(...messagesBatch);
            offset += limit;
          } else {
            hasMore = false;
          }
        }
      }

      totalMessages = allMessages.length;

      // Ссылки на медиа генераций: живут до удаления облака (льготный период)
      // или 7 дней у PRO. Подписываются только файлы пользователя.
      const mediaPaths: string[] = [];
      for (const m of allMessages) {
        const media = m.metadata?.kind === 'generation' && Array.isArray(m.metadata.media) ? m.metadata.media : [];
        for (const item of media) if (item?.storage_path) mediaPaths.push(item.storage_path);
      }
      const linkTtlSec = hasGracePeriod
        ? Math.max(3600, Math.min(7 * 86400, Math.floor((new Date(currentUser.data_deadline).getTime() - Date.now()) / 1000)))
        : 7 * 86400;
      const linkExpiresAt = new Date(Date.now() + linkTtlSec * 1000).toISOString();
      const mediaLinks: Record<string, string> = {};
      try {
        for (let i = 0; i < mediaPaths.length; i += 50) {
          const chunk = mediaPaths.slice(i, i + 50);
          const owned = await getOwnedFiles(userId, chunk, config);
          Object.assign(mediaLinks, await signUrls(owned.map((f) => f.storage_path), linkTtlSec, config));
        }
      } catch (err) {
        console.warn('⚠️ [export] Ссылки на медиа не получены:', (err as Error).message);
      }

      for (const chat of chats) {
        const chatMessages = allMessages.filter((m: any) => m.chat_id === chat.id);
        compiledArchive.push({
          chat_id: chat.id,
          title: chat.title,
          topic_id: chat.topic_id,
          max_context: chat.max_context,
          user_renamed: chat.user_renamed,
          agent_id: chat.agent_id || null,
          modality: chat.modality || null,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          messages: chatMessages.map((m: any) => {
            const out: any = {
              id: m.id,
              type: m.msg_type,
              text: m.text,
              is_favorite: m.is_favorite,
              created_at: m.created_at
            };
            const meta = m.metadata;
            if (meta?.kind === 'generation') {
              out.generation = {
                role: meta.role || null,
                status: meta.status || null,
                modality: meta.modality || null,
                prompt: meta.prompt || null,
                media: (Array.isArray(meta.media) ? meta.media : []).map((item: any) => ({
                  type: item.type,
                  mime: item.mime,
                  url: mediaLinks[item.storage_path] || null,
                  url_expires_at: mediaLinks[item.storage_path] ? linkExpiresAt : null
                }))
              };
            }
            return out;
          })
        });
      }
    }

    return {
      success: true,
      exported_at: new Date().toISOString(),
      user_id: userId,
      grace_period_days_left: hasGracePeriod ? daysLeft : null,
      archive: compiledArchive,
      total_messages: totalMessages
    };
  } catch (err) {
    console.error('Cloud export error:', (err as Error).message);
    return { success: false, error: (err as Error).message, fallbackToLocal: true };
  }
}

/**
 * Разбить архив на части по размеру и числу сообщений
 */
function splitIntoChunks(archive: any[]): any[][] {
  const chunks: any[][] = [];
  let currentChunk: any[] = [];
  let currentSize = 0;
  let currentMessages = 0;

  for (const chat of archive) {
    const chatSize = new TextEncoder().encode(JSON.stringify(chat)).length;
    const chatMessages = chat.messages.length;

    if (currentChunk.length > 0 &&
      (currentSize + chatSize > MAX_EXPORT_SIZE_BYTES ||
        currentMessages + chatMessages > MAX_MESSAGES_PER_CHUNK)) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
      currentMessages = 0;
    }

    currentChunk.push(chat);
    currentSize += chatSize;
    currentMessages += chatMessages;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
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

    const result = await exportCloudArchive(userId, config);
    if (!result.success) {
      if (result.fallbackToLocal) {
        return jsonResponse({
          success: false,
          error: result.error,
          fallbackToLocal: true
        }, 403);
      }
      return errorResponse(result.error, 400);
    }

    // Разбивка на части, если архив большой
    const archiveSize = new TextEncoder().encode(JSON.stringify(result)).length;
    const totalMessages = result.total_messages || 0;

    if (archiveSize > MAX_EXPORT_SIZE_BYTES || totalMessages > MAX_MESSAGES_PER_CHUNK) {
      const chunks = splitIntoChunks(result.archive || []);
      const part = parseInt(request.headers.get('X-Request-Part') || '1', 10);
      const totalParts = chunks.length;

      if (!Number.isInteger(part) || part < 1 || part > totalParts) {
        return errorResponse('Invalid part number', 400);
      }

      return jsonResponse({
        success: true,
        total_parts: totalParts,
        current_part: part,
        total_messages: totalMessages,
        grace_period_days_left: result.grace_period_days_left,
        archive: chunks[part - 1]
      }, 200, {
        'X-Total-Parts': totalParts.toString(),
        'X-Current-Part': part.toString()
      });
    }

    return jsonResponse(result);
  } catch (err) {
    console.error('Export handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
