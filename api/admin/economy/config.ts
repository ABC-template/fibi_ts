// ============================================
// api/admin/economy/config.ts
// Управление настройками экономики (админ)
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

interface IConfigUpdate {
  exchange_enabled?: boolean;
  exchange_rate?: number;
  max_exchange_percent?: number;
  bonus_tokens_per_day?: number;
  daily_token_limit_trial?: number;
  daily_token_limit_premium?: number;
  daily_token_limit_admin?: number;
  whitelist_enabled?: boolean;
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Только для создателя
  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');

  // GET - получение текущих настроек
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        'economy_config?limit=1',
        { method: 'GET' },
        config
      );

      if (!result || !Array.isArray(result) || result.length === 0) {
        return jsonResponse({
          success: true,
          config: {
            exchange_enabled: true,
            exchange_rate: 1,
            max_exchange_percent: 80,
            bonus_tokens_per_day: 5,
            daily_token_limit_trial: 5000,
            daily_token_limit_premium: 50000,
            daily_token_limit_admin: 999999,
            whitelist_enabled: false,
          },
        });
      }

      return jsonResponse({
        success: true,
        config: result[0],
      });
    } catch (err) {
      console.error('[admin/economy/config] GET error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST/PUT - обновление настроек
  if (request.method === 'POST' || request.method === 'PUT') {
    try {
      let body: IConfigUpdate;
      try {
        body = await request.json();
      } catch (err) {
        return errorResponse('Invalid JSON body', 400);
      }

      // Проверяем, есть ли уже запись
      const existing = await supabaseFetch(
        'economy_config?limit=1',
        { method: 'GET' },
        config
      );

      const updateData = {
        ...body,
        updated_at: new Date().toISOString(),
      };

      let result;

      if (existing && Array.isArray(existing) && existing.length > 0) {
        // Обновляем существующую
        result = await supabaseFetch(
          `economy_config?id=eq.${existing[0].id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(updateData),
            headers: { 'Prefer': 'return=representation' },
          },
          config
        );
      } else {
        // Создаем новую
        result = await supabaseFetch(
          'economy_config',
          {
            method: 'POST',
            body: JSON.stringify({
              ...updateData,
              exchange_enabled: body.exchange_enabled ?? true,
              exchange_rate: body.exchange_rate ?? 1,
              max_exchange_percent: body.max_exchange_percent ?? 80,
              bonus_tokens_per_day: body.bonus_tokens_per_day ?? 5,
              whitelist_enabled: body.whitelist_enabled ?? false,
            }),
            headers: { 'Prefer': 'return=representation' },
          },
          config
        );
      }

      return jsonResponse({
        success: true,
        config: Array.isArray(result) ? result[0] : result,
      });
    } catch (err) {
      console.error('[admin/economy/config] POST error:', err);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
