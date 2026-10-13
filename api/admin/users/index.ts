// ============================================
// api/admin/users/index.ts
// Админ-панель → «Пользователи». Доступ — по Telegram ID (ADMIN_TELEGRAM_IDS),
// а не по роли: владелец может переключать себе роль для тестов.
//
//   GET  ?search=<id | @username | часть username>&limit=<1..200>
//        → список пользователей (новые сверху)
//   POST { action: 'role',    user_id, role: 'trial'|'premium'|'admin', tier?, days? }
//   POST { action: 'balance', user_id, currency: 'coins'|'tokens', amount, reason? }
//        amount со знаком: >0 начислить, <0 списать (не ниже нуля); tokens — постоянная энергия
//   POST { action: 'reset_checkin', user_id }
//        → вход «как вчера»: при следующем запуске снова ежедневный бонус и чекин (для тестов)
//   POST { action: 'economy_lock', user_id, locked: boolean }
//        → заморозка монет (economy_locked); полная блокировка — /admin/economy/blocks
//
// Вся логика изменения — в SQL (admin_set_role, admin_adjust_*), с записью в system_logs.
// Версия: 1.2.0 — без trial_used
//          1.1.0 — в списке: blocked / block_reason / block_expires_at (user_blocks),
//                  channel_member, is_admin_id; действие economy_lock
//          1.0.0
// ============================================

import { authenticate, isAdminTelegramId } from '../../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import { getSupabaseConfig, supabaseFetch, supabaseRPC } from '../../_lib/supabase-client';

export const config = { runtime: 'edge' };

const USER_FIELDS = [
  'telegram_id',
  'username',
  'role',
  'subscription_tier',
  'premium_until',
  'data_deadline',
  'coin_balance',
  'token_balance_bonus',
  'token_balance_permanent',
  'economy_locked',
  'streak',
  'last_checkin_date',
  'channel_member',
  'created_at',
].join(',');

const MAX_ADJUST = 10_000_000;

function toUserId(value: unknown): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  const auth = await authenticate(request);
  if (auth.error || !auth.userId) {
    return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
  }
  if (!isAdminTelegramId(auth.userId)) {
    return errorResponse('Доступ запрещён', 403);
  }
  const adminId = auth.userId;
  const cfg = getSupabaseConfig('service');

  try {
    // ---------- Список / поиск ----------
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const search = (url.searchParams.get('search') || '').trim().replace(/^@/, '');
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

      let filter = '';
      if (search) {
        if (/^\d{1,20}$/.test(search)) {
          filter = `&telegram_id=eq.${search}`;
        } else if (/^[A-Za-z0-9_]{1,32}$/.test(search)) {
          filter = `&username=ilike.*${search}*`;
        } else {
          return jsonResponse({ success: true, users: [] });
        }
      }

      const users = await supabaseFetch(
        `users?select=${USER_FIELDS}${filter}&order=created_at.desc.nullslast&limit=${limit}`,
        { method: 'GET' },
        cfg
      );

      const list: any[] = Array.isArray(users) ? users : [];

      // Действующие блокировки (user_blocks) — одним запросом на страницу
      const ids = list.map((u) => toUserId(u.telegram_id)).filter(Boolean);
      const blockMap = new Map<number, any>();
      if (ids.length > 0) {
        const nowIso = encodeURIComponent(new Date().toISOString());
        const blocks = await supabaseFetch(
          `user_blocks?user_id=in.(${ids.join(',')})&is_active=eq.true` +
            `&or=(expires_at.is.null,expires_at.gt.${nowIso})&select=user_id,reason,expires_at`,
          { method: 'GET' },
          cfg
        );
        for (const b of Array.isArray(blocks) ? blocks : []) blockMap.set(Number(b.user_id), b);
      }

      return jsonResponse({
        success: true,
        users: list.map((u) => {
          const b = blockMap.get(Number(u.telegram_id));
          return {
            ...u,
            blocked: !!b,
            block_reason: b?.reason ?? null,
            block_expires_at: b?.expires_at ?? null,
            is_admin_id: isAdminTelegramId(Number(u.telegram_id)),
          };
        }),
        admin_ids: [adminId],
      });
    }

    if (request.method !== 'POST') {
      return errorResponse('Method Not Allowed', 405);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const userId = toUserId(body?.user_id);
    if (!userId) return errorResponse('Invalid user_id', 400);

    // ---------- Роль ----------
    if (body.action === 'role') {
      const role = String(body.role || '');
      if (!['trial', 'premium', 'admin'].includes(role)) {
        return errorResponse('Роль: trial, premium или admin', 400);
      }
      const tier = body.tier ? String(body.tier) : null;
      if (tier && !/^[a-z0-9_-]{1,32}$/i.test(tier)) return errorResponse('Invalid tier', 400);
      const days = body.days !== undefined && body.days !== null && body.days !== '' ? Number(body.days) : null;
      if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
        return errorResponse('Срок: от 1 до 3650 дней', 400);
      }

      const result = await supabaseRPC(
        'admin_set_role',
        { p_user_id: userId, p_role: role, p_admin_id: adminId, p_tier: tier, p_days: days },
        cfg
      );
      if (!result?.success) return errorResponse(result?.error || 'Не удалось сменить роль', 400);
      return jsonResponse({ success: true, ...result });
    }

    // ---------- Монеты / энергия ----------
    if (body.action === 'balance') {
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUST) {
        return errorResponse('Сумма: целое число, не ноль', 400);
      }
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : null;
      const fn = body.currency === 'tokens' ? 'admin_adjust_permanent_tokens' : 'admin_adjust_coins';

      const result = await supabaseRPC(
        fn,
        { p_user_id: userId, p_amount: amount, p_admin_id: adminId, p_reason: reason },
        cfg
      );
      if (!result?.success) return errorResponse(result?.error || 'Не удалось изменить баланс', 400);
      return jsonResponse({ success: true, ...result });
    }

    // ---------- Заморозка экономики (монеты) ----------
    if (body.action === 'economy_lock') {
      if (typeof body.locked !== 'boolean') return errorResponse('locked: true или false', 400);
      const result = await supabaseRPC('toggle_user_lock', { p_user_id: userId, p_locked: body.locked }, cfg);
      if (!result?.success) return errorResponse(result?.error || 'Не удалось изменить', 400);
      return jsonResponse({ success: true, locked: result.locked });
    }

    // ---------- Сброс ежедневного входа (тесты) ----------
    if (body.action === 'reset_checkin') {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await supabaseFetch(
        `users?telegram_id=eq.${userId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            last_checkin_date: yesterday,
            last_bonus_tokens_date: null,
          }),
        },
        cfg
      );
      await supabaseFetch(
        'system_logs',
        {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            event_type: 'admin_reset_checkin',
            message: `Админ ${adminId}: сброс ежедневного входа пользователю ${userId}`,
            user_id: userId,
            metadata: { admin_id: adminId },
          }),
        },
        cfg
      );
      return jsonResponse({ success: true });
    }

    return errorResponse('Unknown action', 400);
  } catch (err) {
    console.error('[admin/users] Error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
