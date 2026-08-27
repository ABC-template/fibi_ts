// ============================================
// api/coins/sync.ts
// Полная синхронизация баланса и транзакций
// Версия: 1.1.0
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
    const supabaseConfig = getSupabaseConfig('service');

    const userResult = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=coin_balance,total_earned,total_spent`,
      { method: 'GET' },
      supabaseConfig
    );

    if (!userResult || !Array.isArray(userResult) || userResult.length === 0) {
      return jsonResponse({
        success: true,
        balance: 0,
        total_earned: 0,
        total_spent: 0,
        transactions: [],
      });
    }

    const user = userResult[0];

    const transactions = await supabaseFetch(
      `coin_transactions?user_id=eq.${userId}&order=created_at.desc&limit=50`,
      { method: 'GET' },
      supabaseConfig
    );

    return jsonResponse({
      success: true,
      balance: user.coin_balance || 0,
      total_earned: user.total_earned || 0,
      total_spent: user.total_spent || 0,
      transactions: transactions || [],
    });
  } catch (err) {
    console.error('Sync error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
