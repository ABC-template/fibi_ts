// ============================================
// api/admin/economy/limits.ts
// Управление лимитами по ролям (админ)
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

  // GET — получить все лимиты
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        'economy_limits?order=sort_order.asc',
        { method: 'GET' },
        config
      );

      return jsonResponse({
        success: true,
        limits: result || [],
      });
    } catch (err) {
      console.error('[admin/economy/limits] GET error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST — обновить лимиты
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { limits } = body;

      if (!limits || !Array.isArray(limits)) {
        return errorResponse('Invalid limits data', 400);
      }

      let updated = 0;

      for (const limit of limits) {
        const { id, bonus_tokens_per_day, permanent_tokens_on_subscribe, openrouter_limit, is_active } = limit;

        if (!id) continue;

        await supabaseFetch(
          `economy_limits?id=eq.${id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              bonus_tokens_per_day,
              permanent_tokens_on_subscribe,
              openrouter_limit,
              is_active,
              updated_at: new Date().toISOString(),
            }),
          },
          config
        );

        updated++;
      }

      return jsonResponse({
        success: true,
        updated,
        message: `Обновлено ${updated} лимитов`,
      });
    } catch (err) {
      console.error('[admin/economy/limits] POST error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
