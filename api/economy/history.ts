// ============================================
// api/economy/history.ts
// Получение истории транзакций (коины + токены)
// Версия: 2.0.0
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
    const type = url.searchParams.get('type') || 'coins'; // 'coins' | 'tokens'
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 50);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    let data: any;

    if (type === 'coins') {
      data = await supabaseFetch(
        `coin_transactions?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${offset}`,
        { method: 'GET' },
        config
      );
    } else if (type === 'tokens') {
      data = await supabaseFetch(
        `token_transactions?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${offset}`,
        { method: 'GET' },
        config
      );
    } else {
      return errorResponse('Invalid type. Use "coins" or "tokens"', 400);
    }

    return jsonResponse({
      success: true,
      transactions: data || [],
      total: data?.length || 0,
      limit,
      offset,
      type,
    });
  } catch (err) {
    console.error('[economy/history] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
