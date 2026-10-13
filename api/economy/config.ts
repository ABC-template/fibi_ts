// ============================================
// api/economy/config.ts
// Настройки обмена монет на энергию для текущего пользователя
// Версия: 2.0.0 — exchange_enabled = обмен реально доступен ЭТОМУ пользователю
//                  (общий флаг + белый список, если он включён); по умолчанию — выключен;
//                  min_exchange_amount; без bonus_tokens_per_day (бонус задаётся в тарифе)
//          1.0.1 — исправлена таблица economy_settings
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
} from '../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }
    const userId = auth.userId;

    const config = getSupabaseConfig('service');

    const rows = await supabaseFetch(
      'economy_settings?select=exchange_enabled,exchange_rate,max_exchange_percent,min_exchange_amount,whitelist_enabled&limit=1',
      { method: 'GET' },
      config
    );
    const s = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    let available = s?.exchange_enabled === true && Number(s?.exchange_rate) > 0;

    // Белый список проверяем так же, как exchange_coins_to_tokens
    if (available && s?.whitelist_enabled === true) {
      const listed = await supabaseFetch(
        `economy_whitelist?user_id=eq.${userId}&select=user_id&limit=1`,
        { method: 'GET' },
        config
      );
      available = Array.isArray(listed) && listed.length > 0;
    }

    return jsonResponse({
      success: true,
      config: {
        exchange_enabled: available,
        exchange_rate: Number(s?.exchange_rate) || 0,
        max_exchange_percent: Number(s?.max_exchange_percent) || 100,
        min_exchange_amount: Number(s?.min_exchange_amount) || 1,
      },
    });
  } catch (err) {
    console.error('[economy/config] Error:', err);
    return errorResponse('Failed to load economy config', 500);
  }
}
