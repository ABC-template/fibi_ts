// ============================================
// api/admin/economy/whitelist.ts
// Управление белым списком для обмена
// Версия: 1.3.0 — пустой список больше не ломает GET (запрос users с пустым in.());
//                  user_id при добавлении — целое Telegram ID
//          1.2.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId), без ID в коде
//          1.1.0 — удаление по user_id (так вызывает админка), не только по id записи
//          1.0.0
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  isAdminTelegramId,
} from '../../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Только для админов
  const auth = await authenticate(request);
  if (auth.error || !isAdminTelegramId(auth.userId)) {
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
      const rows: any[] = Array.isArray(result) ? result : [];

      // Имена пользователей (пустой список — без запроса: in.() PostgREST не принимает)
      const ids = rows.map((w) => Number(w.user_id)).filter((id) => Number.isInteger(id) && id > 0);
      const users = ids.length > 0
        ? await supabaseFetch(
            `users?telegram_id=in.(${ids.join(',')})&select=telegram_id,username`,
            { method: 'GET' },
            config
          )
        : [];

      const userMap = new Map();
      for (const u of (Array.isArray(users) ? users : [])) {
        userMap.set(Number(u.telegram_id), u.username || 'Пользователь');
      }

      const list = rows.map((w: any) => ({
        ...w,
        username: userMap.get(Number(w.user_id)) || 'Пользователь',
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
      const user_id = Number(body?.user_id);

      if (!Number.isSafeInteger(user_id) || user_id <= 0) {
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
      const userId = url.searchParams.get('user_id');

      // Удаление по id записи или по user_id (так вызывает вкладка «Безопасность»)
      let filter: string | null = null;
      if (id && /^[0-9a-f-]{36}$/i.test(id)) filter = `id=eq.${id}`;
      else if (userId && /^\d{1,20}$/.test(userId)) filter = `user_id=eq.${userId}`;

      if (!filter) {
        return errorResponse('Missing id or user_id', 400);
      }

      await supabaseFetch(
        `economy_whitelist?${filter}`,
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
