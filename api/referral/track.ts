// ============================================
// api/referral/track.ts
// Отслеживание перехода по реферальной ссылке
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

interface ITrackRequest {
  ref_code: string;
  referred_id: number;
  referred_username?: string;
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

    const config = getSupabaseConfig('service');

    let body: ITrackRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { ref_code, referred_id, referred_username } = body;

    if (!ref_code || !referred_id) {
      return errorResponse('Missing ref_code or referred_id', 400);
    }

    // Декодируем реферальный код
    let referrerId: number;
    try {
      referrerId = parseInt(atob(ref_code), 10);
    } catch (err) {
      return errorResponse('Invalid ref_code', 400);
    }

    if (isNaN(referrerId) || referrerId === referred_id) {
      return errorResponse('Invalid referrer or self-referral', 400);
    }

    // Проверяем, не зарегистрирован ли уже реферал
    const existing = await supabaseFetch(
      `referrals?referrer_id=eq.${referrerId}&referred_id=eq.${referred_id}`,
      { method: 'GET' },
      config
    );

    if (existing && Array.isArray(existing) && existing.length > 0) {
      return jsonResponse({
        success: true,
        already_exists: true,
        referral: existing[0],
      });
    }

    // Создаём запись о реферале
    const result = await supabaseFetch(
      'referrals',
      {
        method: 'POST',
        body: JSON.stringify({
          referrer_id: referrerId,
          referred_id: referred_id,
          referred_username: referred_username || null,
          status: 'pending',
        }),
      },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to create referral', 500);
    }

    console.log(`📝 Реферал зарегистрирован: ${referred_id} → ${referrerId}`);

    return jsonResponse({
      success: true,
      already_exists: false,
      referral: result,
    });
  } catch (err) {
    console.error('Track referral error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
