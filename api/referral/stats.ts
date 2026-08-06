// ============================================
// api/referral/stats.ts
// Получение статистики рефералов
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

    // Получаем все рефералы
    const referrals = await supabaseFetch(
      `referrals?referrer_id=eq.${userId}&order=created_at.desc`,
      { method: 'GET' },
      config
    );

    if (!referrals || !Array.isArray(referrals)) {
      return jsonResponse({
        success: true,
        referrals: [],
        stats: {
          total: 0,
          pending: 0,
          active: 0,
          rewarded: 0,
          total_reward: 0,
        },
      });
    }

    const stats = {
      total: referrals.length,
      pending: referrals.filter((r: any) => r.status === 'pending').length,
      active: referrals.filter((r: any) => r.status === 'active').length,
      rewarded: referrals.filter((r: any) => r.status === 'rewarded').length,
      total_reward: referrals.reduce((sum: number, r: any) => sum + (r.reward_amount || 0), 0),
    };

    return jsonResponse({
      success: true,
      referrals: referrals,
      stats: stats,
    });
  } catch (err) {
    console.error('Referral stats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
