// ============================================
// api/admin/coins.ts
// Управление монетами (для creator)
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

const CREATOR_ID = 1541531808;

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
    return errorResponse('Доступ запрещён', 403);
  }

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const body = await request.json();
    const { user_id, amount, reason, action } = body;

    if (!user_id || !amount || amount <= 0) {
      return errorResponse('Invalid parameters', 400);
    }

    const config = getSupabaseConfig('service');

    if (action === 'add') {
      const result = await supabaseRPC(
        'add_coins',
        {
          p_user_id: user_id,
          p_amount: amount,
          p_source: `admin_${Date.now()}`,
          p_description: reason || 'Административное начисление',
        },
        config
      );

      return jsonResponse({
        success: true,
        action: 'add',
        new_balance: result?.new_balance || 0,
      });
    }

    if (action === 'spend') {
      const result = await supabaseRPC(
        'spend_coins',
        {
          p_user_id: user_id,
          p_amount: amount,
          p_source: `admin_${Date.now()}`,
          p_description: reason || 'Административное списание',
        },
        config
      );

      return jsonResponse({
        success: true,
        action: 'spend',
        new_balance: result?.new_balance || 0,
      });
    }

    return errorResponse('Invalid action', 400);
  } catch (err) {
    console.error('Admin coins error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
