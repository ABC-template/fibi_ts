// ============================================
// api/economy/config.ts
// Получение конфигурации экономики
// Версия: 1.0.1 — исправлена таблица economy_settings
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

    // ✅ ИСПРАВЛЕНО: используем economy_settings вместо economy_config
    const result = await supabaseFetch(
      'economy_settings?limit=1',
      { method: 'GET' },
      config
    );

    if (!result || !Array.isArray(result) || result.length === 0) {
      // Возвращаем дефолтные настройки
      return jsonResponse({
        success: true,
        config: {
          exchange_enabled: true,
          exchange_rate: 1,
          max_exchange_percent: 80,
          bonus_tokens_per_day: 5,
          whitelist_enabled: false,
        },
      });
    }

    const settings = result[0];

    return jsonResponse({
      success: true,
      config: {
        exchange_enabled: settings.exchange_enabled !== false,
        exchange_rate: settings.exchange_rate || 1,
        max_exchange_percent: settings.max_exchange_percent || 80,
        bonus_tokens_per_day: settings.bonus_tokens_per_day || 5,
        whitelist_enabled: settings.whitelist_enabled || false,
      },
    });
  } catch (err) {
    console.error('[economy/config] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
