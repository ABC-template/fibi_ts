// ============================================
// api/coins/add.ts
// Начисление монет (с подписью)
// Версия: 1.1.0
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

interface IAddCoinsRequest {
  amount: number;
  source: string;
  description: string;
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
    const supabaseConfig = getSupabaseConfig('service');

    let body: IAddCoinsRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { amount, source, description } = body;

    if (!amount || amount <= 0) {
      return errorResponse('Invalid amount', 400);
    }

    if (!source || !description) {
      return errorResponse('Missing source or description', 400);
    }

    const result = await supabaseRPC(
      'add_coins',
      {
        p_user_id: userId,
        p_amount: amount,
        p_source: source,
        p_description: description,
      },
      supabaseConfig
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to add coins', 500);
    }

    return jsonResponse({
      success: true,
      new_balance: result.new_balance || 0,
      transaction_id: result.transaction_id || null,
    });
  } catch (err) {
    console.error('Add coins error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
