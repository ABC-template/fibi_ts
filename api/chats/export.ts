// ============================================
// api/chats/export.ts
// Описание: Экспорт чатов (локальный и облачный)
// Версия: 3.1.0 - исправлены импорты
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch
} from '../_lib/index';

export const config = { runtime: 'edge' };

const MAX_EXPORT_SIZE_BYTES = 10000000; // 10MB
const MAX_MESSAGES_PER_CHUNK = 1000;

interface IExportRequest {
  chatHistories?: Record<string, any[]>;
  topicNames?: Record<string, string>;
  exportOptions?: {
    part?: string;
  };
}

/**
 * Экспорт локального архива (доступен всем)
 */
async function exportLocalArchive(body: IExportRequest): Promise<any> {
  try {
    const { chatHistories, topicNames, exportOptions = {} } = body;

    if (!chatHistories) {
      return { success: false, error: 'No chat histories provided' };
    }

    const archive: any[] = [];
    let totalMessages = 0;

    for (const [topicId, chats] of Object.entries(chatHistories)) {
      for (const chat of (chats || [])) {
        const sortedMessages = [...(chat.messages || [])].sort((a: any, b: any) => {
          if (a.created_at && b.created_at) {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }
          return 0;
        });

        archive.push({
          chat_id: chat.id,
          title: chat.title,
          topic_id: topicId,
          topic_name: (topicNames || {})[topicId] || topicId,
          max_context: chat.maxContext,
          user_renamed: chat.userRenamed || false,
          created_at: chat.created_at || new Date().toISOString(),
          updated_at: chat.updated_at || new Date().toISOString(),
          messages: sortedMessages
        });

        totalMessages += sortedMessages.length;
      }
    }

    const archiveJson = JSON.stringify(archive);
    const totalSize = new TextEncoder().encode(archiveJson).length;

    // Разбивка на части если нужно
    if (totalSize > MAX_EXPORT_SIZE_BYTES || totalMessages > MAX_MESSAGES_PER_CHUNK) {
      return splitArchive(archive, totalMessages, exportOptions);
    }

    return {
      success: true,
      total_parts: 1,
      current_part: 1,
      total_messages: totalMessages,
      archive: archive
    };
  } catch (err) {
    console.error('Local export error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Разбить архив на части
 */
function splitArchive(archive: any[], totalMessages: number, exportOptions: any): any {
  const chunks: any[] = [];
  let currentChunk: any[] = [];
  let currentSize = 0;
  let currentMessages = 0;

  for (const chat of archive) {
    const chatJson = JSON.stringify(chat);
    const chatSize = new TextEncoder().encode(chatJson).length;
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

  const part = parseInt(exportOptions.part || '1', 10);
  const totalParts = chunks.length;

  if (part > totalParts) {
    return { success: false, error: 'Invalid part number' };
  }

  return {
    success: true,
    total_parts: totalParts,
    current_part: part,
    total_messages: totalMessages,
    archive: chunks[part - 1]
  };
}

/**
 * Экспорт облачного архива (только PRO)
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

      for (const chat of chats) {
        const chatMessages = allMessages.filter((m: any) => m.chat_id === chat.id);
        compiledArchive.push({
          chat_id: chat.id,
          title: chat.title,
          topic_id: chat.topic_id,
          max_context: chat.max_context,
          user_renamed: chat.user_renamed,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          messages: chatMessages.map((m: any) => ({
            id: m.id,
            type: m.msg_type,
            text: m.text,
            is_favorite: m.is_favorite,
            created_at: m.created_at
          }))
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

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  try {
    const isLocalExport = request.method === 'POST';

    // Локальный экспорт (доступен всем)
    if (isLocalExport) {
      let body: IExportRequest;
      try {
        body = await request.json();
      } catch (err) {
        return errorResponse('Invalid JSON body', 400);
      }

      const result = await exportLocalArchive(body);
      if (!result.success) {
        return errorResponse(result.error, 400);
      }

      return jsonResponse(result);
    }

    // Облачный экспорт (только GET + PRO)
    if (request.method !== 'GET') {
      return errorResponse('Method Not Allowed', 405);
    }

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

    // Разбивка на части если нужно
    const archiveJson = JSON.stringify(result);
    const archiveSize = new TextEncoder().encode(archiveJson).length;
    const totalMessages = result.total_messages || 0;

    if (archiveSize > MAX_EXPORT_SIZE_BYTES || totalMessages > MAX_MESSAGES_PER_CHUNK) {
      const chunks: any[] = [];
      let currentChunk: any[] = [];
      let currentSize = 0;
      let currentMessages = 0;

      for (const chat of (result.archive || [])) {
        const chatJson = JSON.stringify(chat);
        const chatSize = new TextEncoder().encode(chatJson).length;
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

      const part = parseInt(request.headers.get('X-Request-Part') || '1', 10);
      const totalParts = chunks.length;

      if (part > totalParts) {
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
