// ============================================
// api/economy/settings.ts
// Получение глобальных настроек экономики
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
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const config = getSupabaseConfig('service');

    const result = await supabaseFetch(
      'economy_settings?limit=1',
      { method: 'GET' },
      config
    );

    if (!result || !Array.isArray(result) || result.length === 0) {
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
    console.error('[economy/settings] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
