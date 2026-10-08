// ============================================
// api/admin/economy/subscriptions.ts
// Управление тарифами (подписки + лимиты токенов)
// Версия: 2.0.0 — bonus_tokens_per_day + daily_spend_limit
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

  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
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

      const required = ['tier_key', 'name', 'name_en', 'days', 'price_stars'];
      for (const field of required) {
        if (body[field] === undefined || body[field] === null || body[field] === '') {
          return errorResponse(`Missing required field: ${field}`, 400);
        }
      }

      const result = await supabaseFetch(
        'subscription_tiers',
        {
          method: 'POST',
          body: JSON.stringify({
            tier_key: body.tier_key,
            name: body.name,
            name_en: body.name_en,
            days: Number(body.days) || 0,
            price_stars: Number(body.price_stars) || 0,
            permanent_tokens: Number(body.permanent_tokens) || 0,
            bonus_tokens_per_day: Number(body.bonus_tokens_per_day) || 0,
            daily_spend_limit: Number(body.daily_spend_limit) || 0,
            is_active: body.is_active !== undefined ? !!body.is_active : true,
            is_trial: !!body.is_trial,
            is_one_time: !!body.is_one_time,
            description: body.description || null,
            sort_order: Number(body.sort_order) || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
      const { id } = body;

      if (!id) {
        return errorResponse('Missing tier id', 400);
      }

      const update: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (body.name !== undefined) update.name = body.name;
      if (body.name_en !== undefined) update.name_en = body.name_en;
      if (body.days !== undefined) update.days = Number(body.days) || 0;
      if (body.price_stars !== undefined) update.price_stars = Number(body.price_stars) || 0;
      if (body.permanent_tokens !== undefined) update.permanent_tokens = Number(body.permanent_tokens) || 0;
      if (body.bonus_tokens_per_day !== undefined) update.bonus_tokens_per_day = Number(body.bonus_tokens_per_day) || 0;
      if (body.daily_spend_limit !== undefined) update.daily_spend_limit = Number(body.daily_spend_limit) || 0;
      if (body.is_active !== undefined) update.is_active = !!body.is_active;
      if (body.is_trial !== undefined) update.is_trial = !!body.is_trial;
      if (body.is_one_time !== undefined) update.is_one_time = !!body.is_one_time;
      if (body.description !== undefined) update.description = body.description;
      if (body.sort_order !== undefined) update.sort_order = Number(body.sort_order) || 0;

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
      const id = url.searchParams.get('id');

      if (!id) {
        return errorResponse('Missing tier id', 400);
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
