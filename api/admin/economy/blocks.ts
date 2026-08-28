// ============================================
// api/admin/economy/blocks.ts
// Управление блокировками пользователей (админ)
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

  // GET — получить все блокировки
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        'user_blocks?is_active=eq.true&order=blocked_at.desc',
        { method: 'GET' },
        config
      );

      // Получаем имена пользователей
      const userIds = (result || []).map((b: any) => b.user_id).join(',');
      let users: any[] = [];

      if (userIds) {
        users = await supabaseFetch(
          `users?telegram_id=in.(${userIds})&select=telegram_id,username`,
          { method: 'GET' },
          config
        );
      }

      const userMap = new Map();
      for (const u of (users || [])) {
        userMap.set(u.telegram_id, u.username || 'Пользователь');
      }

      const blocks = (result || []).map((b: any) => ({
        ...b,
        username: userMap.get(b.user_id) || 'Пользователь',
      }));

      return jsonResponse({
        success: true,
        blocks,
      });
    } catch (err) {
      console.error('[admin/economy/blocks] GET error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST — заблокировать пользователя
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { user_id, reason, expires_at } = body;

      if (!user_id) {
        return errorResponse('Missing user_id', 400);
      }

      // Проверяем, не заблокирован ли уже
      const existing = await supabaseFetch(
        `user_blocks?user_id=eq.${user_id}&is_active=eq.true`,
        { method: 'GET' },
        config
      );

      if (existing && Array.isArray(existing) && existing.length > 0) {
        return errorResponse('User already blocked', 400);
      }

      const result = await supabaseFetch(
        'user_blocks',
        {
          method: 'POST',
          body: JSON.stringify({
            user_id,
            reason: reason || null,
            blocked_by: CREATOR_ID,
            expires_at: expires_at || null,
            blocked_at: new Date().toISOString(),
            is_active: true,
          }),
          headers: { 'Prefer': 'return=representation' },
        },
        config
      );

      // Логируем
      await supabaseFetch(
        'system_logs',
        {
          method: 'POST',
          body: JSON.stringify({
            level: 'warning',
            event_type: 'user_blocked',
            message: `Пользователь ${user_id} заблокирован`,
            user_id,
            metadata: { reason, blocked_by: CREATOR_ID },
          }),
        },
        config
      );

      return jsonResponse({
        success: true,
        block: Array.isArray(result) ? result[0] : result,
      });
    } catch (err) {
      console.error('[admin/economy/blocks] POST error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // DELETE — разблокировать пользователя
  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const user_id = url.searchParams.get('user_id');

      if (!user_id) {
        return errorResponse('Missing user_id', 400);
      }

      await supabaseFetch(
        `user_blocks?user_id=eq.${user_id}&is_active=eq.true`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_active: false,
            updated_at: new Date().toISOString(),
          }),
        },
        config
      );

      // Логируем
      await supabaseFetch(
        'system_logs',
        {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            event_type: 'user_unblocked',
            message: `Пользователь ${user_id} разблокирован`,
            user_id,
          }),
        },
        config
      );

      return jsonResponse({
        success: true,
        message: 'User unblocked',
      });
    } catch (err) {
      console.error('[admin/economy/blocks] DELETE error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
