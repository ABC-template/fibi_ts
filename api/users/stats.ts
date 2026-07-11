// ============================================
// api/users/stats.ts
// Описание: Получение статистики пользователя
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseRPC } from '../_lib/supabase-client';

export const config = { runtime: 'edge' };

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

    const stats = await supabaseRPC('get_user_stats', { uid: userId }, config);

    return jsonResponse({
      success: true,
      stats: stats || { total_chats: 0, total_messages: 0, total_favorites: 0 }
    });
  } catch (err) {
    console.error('Stats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
