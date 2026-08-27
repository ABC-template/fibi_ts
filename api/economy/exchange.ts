// ============================================
// api/economy/exchange.ts
// Обмен коинов на токены
// Версия: 1.0.0
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
} from '../_lib/index';

export const config = { runtime: 'edge' };

interface IExchangeRequest {
  coins_amount: number;
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    let body: IExchangeRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { coins_amount } = body;

    if (!coins_amount || coins_amount <= 0) {
      return errorResponse('Invalid coins amount (must be > 0)', 400);
    }

    // Выполняем обмен через RPC
    const result = await supabaseRPC(
      'exchange_coins_to_tokens',
      {
        p_user_id: userId,
        p_coins_amount: coins_amount,
      },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to exchange', 500);
    }

    if (result.success === false) {
      return errorResponse(result.error || 'Failed to exchange', 400);
    }

    return jsonResponse({
      success: true,
      coins_spent: result.coins_spent || 0,
      tokens_received: result.tokens_received || 0,
      new_coin_balance: result.new_coin_balance || 0,
      token_balance_bonus: result.token_balance_bonus || 0,
      token_balance_permanent: result.token_balance_permanent || 0,
      exchange_rate: result.exchange_rate || 1,
    });
  } catch (err) {
    console.error('[economy/exchange] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
