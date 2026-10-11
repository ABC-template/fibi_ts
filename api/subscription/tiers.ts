// ============================================
// api/subscription/tiers.ts
// Получение доступных тарифов подписки
// Версия: 1.1.0 — бесплатные тарифы (price_stars = 0, например trial) в список покупки не попадают
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
      'subscription_tiers?is_active=eq.true&price_stars=gt.0&order=sort_order.asc',
      { method: 'GET' },
      config
    );

    return jsonResponse({
      success: true,
      tiers: result || [],
    });
  } catch (err) {
    console.error('[subscription/tiers] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
