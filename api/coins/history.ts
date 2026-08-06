// ============================================
// api/coins/history.ts
// Получение истории транзакций
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

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const result = await supabaseFetch(
      `coin_transactions?user_id=eq.${userId}&order=created_at.desc&limit=${Math.min(limit, 100)}&offset=${offset}`,
      { method: 'GET' },
      config
    );

    return jsonResponse({
      success: true,
      transactions: result || [],
      total: result?.length || 0,
      limit: Math.min(limit, 100),
      offset: offset,
    });
  } catch (err) {
    console.error('History error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
