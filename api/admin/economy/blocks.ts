// ============================================
// api/admin/economy/blocks.ts
// Управление блокировками пользователей (админ)
// Версия: 2.0.0 — блокировка закрывает ВСЁ API (проверка в authenticate, access-gate);
//                  разблокировка не работала: PATCH писал несуществующую колонку
//                  updated_at; user_id и срок проверяются; админов (ADMIN_TELEGRAM_IDS)
//                  заблокировать нельзя; срок можно задать в днях (days)
//          1.1.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId)
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
import { forgetAccessState } from '../../_lib/access-gate';

export const config = { runtime: 'edge' };

const MAX_REASON = 300;
const MAX_DAYS = 3650;

function toUserId(value: unknown): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function logEvent(
  level: string,
  eventType: string,
  message: string,
  userId: number,
  metadata: Record<string, any>,
  config: any
): Promise<void> {
  try {
    await supabaseFetch(
      'system_logs',
      {
        method: 'POST',
        body: JSON.stringify({ level, event_type: eventType, message, user_id: userId, metadata }),
      },
      config
    );
  } catch (err) {
    console.warn('[admin/economy/blocks] log failed:', (err as Error).message);
  }
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Только для админов
  const auth = await authenticate(request);
  if (auth.error || !isAdminTelegramId(auth.userId)) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');
  const nowIso = new Date().toISOString();

  // GET — действующие блокировки
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        `user_blocks?is_active=eq.true&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(nowIso)})` +
          `&order=blocked_at.desc&limit=500`,
        { method: 'GET' },
        config
      );
      const rows: any[] = Array.isArray(result) ? result : [];

      const userIds = [...new Set(rows.map((b) => toUserId(b.user_id)).filter(Boolean))];
      let users: any[] = [];
      if (userIds.length > 0) {
        users = await supabaseFetch(
          `users?telegram_id=in.(${userIds.join(',')})&select=telegram_id,username`,
          { method: 'GET' },
          config
        );
      }

      const userMap = new Map<number, string>();
      for (const u of Array.isArray(users) ? users : []) {
        userMap.set(Number(u.telegram_id), u.username || 'Пользователь');
      }

      return jsonResponse({
        success: true,
        blocks: rows.map((b) => ({ ...b, username: userMap.get(Number(b.user_id)) || 'Пользователь' })),
      });
    } catch (err) {
      console.error('[admin/economy/blocks] GET error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST — заблокировать: { user_id, reason?, days? | expires_at? }
  if (request.method === 'POST') {
    try {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const userId = toUserId(body?.user_id);
      if (!userId) {
        return errorResponse('Invalid user_id', 400);
      }
      if (isAdminTelegramId(userId)) {
        return errorResponse('Администратора заблокировать нельзя', 400);
      }

      const reason = typeof body?.reason === 'string' ? body.reason.trim().substring(0, MAX_REASON) : '';

      let expiresAt: string | null = null;
      if (body?.days !== undefined && body?.days !== null && body?.days !== '') {
        const days = Number(body.days);
        if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS) {
          return errorResponse(`days: от 1 до ${MAX_DAYS}`, 400);
        }
        expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
      } else if (body?.expires_at) {
        const t = new Date(body.expires_at).getTime();
        if (!Number.isFinite(t) || t <= Date.now()) {
          return errorResponse('Invalid expires_at', 400);
        }
        expiresAt = new Date(t).toISOString();
      }

      const exists = await supabaseFetch(
        `users?telegram_id=eq.${userId}&select=telegram_id`,
        { method: 'GET' },
        config
      );
      if (!Array.isArray(exists) || exists.length === 0) {
        return errorResponse('User not found', 404);
      }

      // Прежние (в т.ч. истёкшие) блокировки закрываем — действует одна
      await supabaseFetch(
        `user_blocks?user_id=eq.${userId}&is_active=eq.true`,
        { method: 'PATCH', body: JSON.stringify({ is_active: false }) },
        config
      );

      const result = await supabaseFetch(
        'user_blocks',
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            reason: reason || null,
            blocked_by: auth.userId,
            expires_at: expiresAt,
            blocked_at: nowIso,
            is_active: true,
          }),
          headers: { Prefer: 'return=representation' },
        },
        config
      );

      forgetAccessState(userId);
      await logEvent('warning', 'user_blocked', `Пользователь ${userId} заблокирован`, userId, {
        reason: reason || null,
        expires_at: expiresAt,
        blocked_by: auth.userId,
      }, config);

      return jsonResponse({
        success: true,
        block: Array.isArray(result) ? result[0] : result,
      });
    } catch (err) {
      console.error('[admin/economy/blocks] POST error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // DELETE — разблокировать: ?user_id=
  if (request.method === 'DELETE') {
    try {
      const userId = toUserId(new URL(request.url).searchParams.get('user_id'));
      if (!userId) {
        return errorResponse('Invalid user_id', 400);
      }

      await supabaseFetch(
        `user_blocks?user_id=eq.${userId}&is_active=eq.true`,
        { method: 'PATCH', body: JSON.stringify({ is_active: false }) },
        config
      );

      forgetAccessState(userId);
      await logEvent('info', 'user_unblocked', `Пользователь ${userId} разблокирован`, userId, {
        unblocked_by: auth.userId,
      }, config);

      return jsonResponse({ success: true, message: 'User unblocked' });
    } catch (err) {
      console.error('[admin/economy/blocks] DELETE error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
