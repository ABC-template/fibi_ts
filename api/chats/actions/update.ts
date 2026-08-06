// ============================================
// api/chats/actions/update.ts
// Описание: Обновление чата (переименование, контекст, удаление) с sync_token
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, updateSyncToken, getSyncToken } from '../../_lib/supabase-client';
import { isValidUUID, validateUUID } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface IUpdateRequest {
  action: 'rename_chat' | 'update_context' | 'delete_chat';
  chatId: string;
  newTitle?: string;
  maxContext?: number;
}

/**
 * Переименовать чат
 */
async function renameChat(
  userId: number,
  chatId: string,
  newTitle: string,
  config: any
): Promise<{ success: boolean; syncToken?: string | null; error?: string }> {
  try {
    validateUUID(chatId, 'Chat ID');

    if (!newTitle || newTitle.trim().length === 0) {
      return { success: false, error: 'Title is required' };
    }

    const title = newTitle.trim();
    if (title.length > 200) {
      return { success: false, error: 'Title too long (max 200 characters)' };
    }

    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Chat not found or access denied' };
    }

    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: title,
          user_renamed: true,
          updated_at: new Date().toISOString()
        })
      },
      config
    );

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    return { success: true, syncToken: newSyncToken, error: null };
  } catch (err) {
    console.error('Rename chat error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Обновить контекст (память) чата
 */
async function updateContext(
  userId: number,
  chatId: string,
  maxContext: number,
  config: any
): Promise<{ success: boolean; syncToken?: string | null; error?: string }> {
  try {
    validateUUID(chatId, 'Chat ID');

    const context = parseInt(maxContext as any, 10);
    if (isNaN(context) || context < 1 || context > 40) {
      return { success: false, error: 'Context must be between 1 and 40' };
    }

    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Chat not found or access denied' };
    }

    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          max_context: context,
          updated_at: new Date().toISOString()
        })
      },
      config
    );

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    return { success: true, syncToken: newSyncToken, error: null };
  } catch (err) {
    console.error('Update context error:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Удалить чат (soft delete) с пометкой всех сообщений
 */
async function deleteChat(
  userId: number,
  chatId: string,
  config: any
): Promise<{ success: boolean; syncToken?: string | null; error?: string }> {
  try {
    validateUUID(chatId, 'Chat ID');

    const chatCheck = await supabaseFetch(
      `chats?id=eq.${chatId}&user_id=eq.${userId}&deleted_at=is.null&select=id`,
      { method: 'GET' },
      config
    );

    if (!chatCheck || !Array.isArray(chatCheck) || chatCheck.length === 0) {
      return { success: false, error: 'Chat not found or already deleted' };
    }

    const now = new Date().toISOString();

    await supabaseFetch(
      `messages?chat_id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: now,
          updated_at: now
        })
      },
      config
    );

    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          deleted_at: now,
          updated_at: now
        })
      },
      config
    );

    // Обновляем sync_token
    await updateSyncToken(userId, config);
    const newSyncToken = await getSyncToken(userId, config);

    console.log(`🗑️ Чат ${chatId} и все его сообщения помечены как удалённые`);
    return { success: true, syncToken: newSyncToken, error: null };
  } catch (err) {
    console.error('Delete chat error:', (err as Error).message);
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

    let body: IUpdateRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { action, chatId, newTitle, maxContext } = body;

    if (action === 'rename_chat') {
      if (!chatId || !newTitle) {
        return errorResponse('Missing chatId or newTitle', 400);
      }

      const result = await renameChat(userId, chatId, newTitle, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        syncToken: result.syncToken
      });
    }

    if (action === 'update_context') {
      if (!chatId || maxContext === undefined) {
        return errorResponse('Missing chatId or maxContext', 400);
      }

      const result = await updateContext(userId, chatId, maxContext, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        syncToken: result.syncToken
      });
    }

    if (action === 'delete_chat') {
      if (!chatId) {
        return errorResponse('Missing chatId', 400);
      }

      const result = await deleteChat(userId, chatId, config);
      if (!result.success) {
        return errorResponse(result.error || 'Unknown error', 400);
      }

      return jsonResponse({
        success: true,
        syncToken: result.syncToken
      });
    }

    return errorResponse('Unknown action', 400);
  } catch (err) {
    console.error('Update handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
