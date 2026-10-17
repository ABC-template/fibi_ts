// ============================================
// api/admin/economy/subscriptions.ts
// Управление тарифами (подписки + лимиты токенов)
// Версия: 3.0.0 — только известные поля с проверкой: tier_key — латиница/цифры/«_-» до 32
//                  (уходит в запросы PostgREST и в подписки пользователей), числа — целые
//                  в диапазоне, названия — до 50 символов; id тарифа — только UUID;
//                  базовый тариф trial нельзя удалить и выключить (на него опираются лимиты)
//          2.2.0 — без is_trial (пробного периода больше нет; бесплатный тариф — tier_key 'trial')
//          2.1.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId), без ID в коде
//          2.0.0 — bonus_tokens_per_day + daily_spend_limit
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIER_KEY_RE = /^[a-z0-9_-]{1,32}$/;
/** Базовый тариф: на него переводятся истёкшие подписки и опираются лимиты */
const BASE_TIER = 'trial';

type Rule =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'text'; max: number; nullable?: boolean }
  | { kind: 'bool' };

/** Поля тарифа, которые можно задать из админки (tier_key — только при создании) */
const TIER_FIELDS: Record<string, Rule> = {
  name: { kind: 'text', max: 50 },
  name_en: { kind: 'text', max: 50 },
  days: { kind: 'int', min: 0, max: 3_650 },
  price_stars: { kind: 'int', min: 0, max: 1_000_000 },
  permanent_tokens: { kind: 'int', min: 0, max: 100_000_000 },
  bonus_tokens_per_day: { kind: 'int', min: 0, max: 100_000_000 },
  daily_spend_limit: { kind: 'int', min: 0, max: 100_000_000 },
  is_active: { kind: 'bool' },
  is_one_time: { kind: 'bool' },
  description: { kind: 'text', max: 500, nullable: true },
  sort_order: { kind: 'int', min: -1_000, max: 1_000 },
};

/** Известные поля тела; строка — ошибка проверки */
function readTierFields(body: any): Record<string, any> | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid body';
  const out: Record<string, any> = {};
  for (const [key, rule] of Object.entries(TIER_FIELDS)) {
    const v = body[key];
    if (v === undefined) continue;
    if (rule.kind === 'bool') {
      if (typeof v !== 'boolean') return `${key}: true или false`;
      out[key] = v;
    } else if (rule.kind === 'int') {
      const n = v === '' ? 0 : Number(v);
      if (!Number.isInteger(n) || n < rule.min || n > rule.max) return `${key}: целое ${rule.min}…${rule.max}`;
      out[key] = n;
    } else {
      if (v === null || v === '') {
        if (!rule.nullable) return `${key}: обязательно`;
        out[key] = null;
        continue;
      }
      if (typeof v !== 'string' || v.trim().length > rule.max) return `${key}: строка до ${rule.max} символов`;
      out[key] = v.trim();
    }
  }
  return out;
}

async function loadTier(id: string, config: any): Promise<any | null> {
  const rows = await supabaseFetch(`subscription_tiers?id=eq.${id}&select=id,tier_key`, { method: 'GET' }, config);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || !isAdminTelegramId(auth.userId)) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');

  // GET — все тарифы
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        'subscription_tiers?order=sort_order.asc',
        { method: 'GET' },
        config
      );

      return jsonResponse({
        success: true,
        tiers: result || [],
      });
    } catch (err) {
      console.error('[admin/economy/subscriptions] GET error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST — создать тариф
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const tierKey = typeof body?.tier_key === 'string' ? body.tier_key.trim() : '';
      if (!TIER_KEY_RE.test(tierKey)) {
        return errorResponse('tier_key: латиница в нижнем регистре, цифры, «_» и «-», до 32 символов', 400);
      }
      const fields = readTierFields(body);
      if (typeof fields === 'string') return errorResponse(fields, 400);
      for (const field of ['name', 'name_en', 'days', 'price_stars']) {
        if (fields[field] === undefined) return errorResponse(`Missing required field: ${field}`, 400);
      }

      const now = new Date().toISOString();
      const result = await supabaseFetch(
        'subscription_tiers',
        {
          method: 'POST',
          body: JSON.stringify({
            permanent_tokens: 0,
            bonus_tokens_per_day: 0,
            daily_spend_limit: 0,
            is_active: true,
            is_one_time: false,
            description: null,
            sort_order: 0,
            ...fields,
            tier_key: tierKey,
            created_at: now,
            updated_at: now,
          }),
          headers: { Prefer: 'return=representation' },
        },
        config
      );

      return jsonResponse({
        success: true,
        tier: Array.isArray(result) ? result[0] : result,
      });
    } catch (err) {
      console.error('[admin/economy/subscriptions] POST error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // PUT — обновить тариф
  if (request.method === 'PUT') {
    try {
      const body = await request.json();
      const id = String(body?.id || '');
      if (!UUID_RE.test(id)) {
        return errorResponse('Missing tier id', 400);
      }

      const fields = readTierFields(body);
      if (typeof fields === 'string') return errorResponse(fields, 400);

      const tier = await loadTier(id, config);
      if (!tier) return errorResponse('Тариф не найден', 404);
      if (tier.tier_key === BASE_TIER && fields.is_active === false) {
        return errorResponse('Базовый тариф trial нельзя выключить', 400);
      }

      const update: Record<string, any> = { ...fields, updated_at: new Date().toISOString() };

      const result = await supabaseFetch(
        `subscription_tiers?id=eq.${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(update),
          headers: { Prefer: 'return=representation' },
        },
        config
      );

      return jsonResponse({
        success: true,
        tier: Array.isArray(result) ? result[0] : result,
      });
    } catch (err) {
      console.error('[admin/economy/subscriptions] PUT error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // DELETE — удалить тариф
  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const id = url.searchParams.get('id') || '';

      if (!UUID_RE.test(id)) {
        return errorResponse('Missing tier id', 400);
      }

      const tier = await loadTier(id, config);
      if (!tier) return errorResponse('Тариф не найден', 404);
      if (tier.tier_key === BASE_TIER) {
        return errorResponse('Базовый тариф trial нельзя удалить', 400);
      }

      await supabaseFetch(
        `subscription_tiers?id=eq.${id}`,
        { method: 'DELETE' },
        config
      );

      return jsonResponse({
        success: true,
        message: 'Тариф удалён',
      });
    } catch (err) {
      console.error('[admin/economy/subscriptions] DELETE error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
