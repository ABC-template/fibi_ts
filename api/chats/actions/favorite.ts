// ============================================
// api/chats/actions/favorite.ts
// Описание: Управление избранными сообщениями с sync_token
// Версия: 3.0.0 - TypeScript
// ============================================

import { authenticate } from '../../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, updateSyncToken, getSyncToken } from '../../_lib/supabase-client';
import { isValidUUID, validateUUID } from '../../_lib/validators';

export const config = { runtime: 'edge' };

interface IFavoriteRequest {
  action: 'favorite_message';
  chatId: string;
  messageId: string;
  isFavorite: boolean;
}

/**
 * Переключить статус избранного для сообщения
 */
async function toggleFavorite(
  userId: number,
  chatId: string,
  messageId: string,
  isFavorite: boolean,
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
      return { success: false, error: 'Chat not found or access denied' };
    }

    const msgCheck = await supabaseFetch(
      `messages?id=eq.${messageId}&chat_id=eq.${chatId}&select=id`,
      { method: 'GET' },
      config
    );

    if (!msgCheck || !Array.isArray(msgCheck) || msgCheck.length === 0) {
      return { success: false, error: 'Message not found' };
    }

    await supabaseFetch(
      `messages?id=eq.${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          is_favorite: isFavorite,
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
    console.error('Toggle favorite error:', (err as Error).message);
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

    let body: IFavoriteRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { action, chatId, messageId, isFavorite } = body;

    if (action !== 'favorite_message') {
      return errorResponse('Unknown action', 400);
    }

    if (!chatId || !messageId || isFavorite === undefined) {
      return errorResponse('Missing chatId, messageId or isFavorite', 400);
    }

    const result = await toggleFavorite(userId, chatId, messageId, isFavorite, config);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', 400);
    }

    return jsonResponse({
      success: true,
      syncToken: result.syncToken
    });
  } catch (err) {
    console.error('Favorite handler error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
