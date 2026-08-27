// ============================================
// api/admin/economy/whitelist.ts
// Управление белым списком для обмена
// Версия: 1.0.0
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
} from '../../_lib/index';

export const config = { runtime: 'edge' };

const CREATOR_ID = 1541531808;

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Только для создателя
  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');

  // GET - список белого списка
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        'economy_whitelist?order=created_at.desc',
        { method: 'GET' },
        config
      );

      // Получаем имена пользователей
      const users = await supabaseFetch(
        `users?telegram_id=in.(${(result || []).map((w: any) => w.user_id).join(',')})&select=telegram_id,username`,
        { method: 'GET' },
        config
      );

      const userMap = new Map();
      for (const u of (users || [])) {
        userMap.set(u.telegram_id, u.username || 'Пользователь');
      }

      const list = (result || []).map((w: any) => ({
        ...w,
        username: userMap.get(w.user_id) || 'Пользователь',
      }));

      return jsonResponse({
        success: true,
        whitelist: list,
        count: list.length,
      });
    } catch (err) {
      console.error('[admin/economy/whitelist] GET error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST - добавить в белый список
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { user_id } = body;

      if (!user_id || user_id <= 0) {
        return errorResponse('Invalid user_id', 400);
      }

      // Проверяем, существует ли пользователь
      const userCheck = await supabaseFetch(
        `users?telegram_id=eq.${user_id}&select=telegram_id`,
        { method: 'GET' },
        config
      );

      if (!userCheck || !Array.isArray(userCheck) || userCheck.length === 0) {
        return errorResponse('User not found', 404);
      }

      // Добавляем в белый список
      const result = await supabaseFetch(
        'economy_whitelist',
        {
          method: 'POST',
          body: JSON.stringify({ user_id }),
          headers: { 'Prefer': 'return=representation' },
        },
        config
      );

      return jsonResponse({
        success: true,
        whitelist: Array.isArray(result) ? result[0] : result,
      });
    } catch (err) {
      console.error('[admin/economy/whitelist] POST error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // DELETE - удалить из белого списка
  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');

      if (!id) {
        return errorResponse('Missing id', 400);
      }

      await supabaseFetch(
        `economy_whitelist?id=eq.${id}`,
        { method: 'DELETE' },
        config
      );

      return jsonResponse({
        success: true,
        message: 'Removed from whitelist',
      });
    } catch (err) {
      console.error('[admin/economy/whitelist] DELETE error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
