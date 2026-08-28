// ============================================
// api/admin/economy/settings.ts
// Управление глобальными настройками экономики (админ)
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

  // GET — получить настройки
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        'economy_settings?limit=1',
        { method: 'GET' },
        config
      );

      if (!result || !Array.isArray(result) || result.length === 0) {
        // Возвращаем дефолтные настройки
        return jsonResponse({
          success: true,
          settings: {
            exchange_enabled: true,
            exchange_rate: 1,
            max_exchange_percent: 80,
            min_exchange_amount: 1,
            bonus_coins_per_day: 5,
            bonus_tokens_per_day: 5,
            whitelist_enabled: false,
            daily_reset_time: '00:00:00',
            token_expiry_days: 1,
            min_tokens_for_request: 1,
            low_balance_threshold: 10,
            low_tokens_threshold: 5,
            log_retention_days: 90,
            audit_log_retention_days: 180,
          },
        });
      }

      return jsonResponse({
        success: true,
        settings: result[0],
      });
    } catch (err) {
      console.error('[admin/economy/settings] GET error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST — обновить настройки
  if (request.method === 'POST') {
    try {
      const body = await request.json();

      // Проверяем, есть ли уже запись
      const existing = await supabaseFetch(
        'economy_settings?limit=1',
        { method: 'GET' },
        config
      );

      let result;

      if (existing && Array.isArray(existing) && existing.length > 0) {
        // Обновляем существующую
        result = await supabaseFetch(
          `economy_settings?id=eq.${existing[0].id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...body,
              updated_at: new Date().toISOString(),
            }),
            headers: { 'Prefer': 'return=representation' },
          },
          config
        );
      } else {
        // Создаем новую
        result = await supabaseFetch(
          'economy_settings',
          {
            method: 'POST',
            body: JSON.stringify({
              ...body,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
            headers: { 'Prefer': 'return=representation' },
          },
          config
        );
      }

      return jsonResponse({
        success: true,
        settings: Array.isArray(result) ? result[0] : result,
      });
    } catch (err) {
      console.error('[admin/economy/settings] POST error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
