// ============================================
// api/referral/track.ts
// Отслеживание перехода по реферальной ссылке
// Версия: 1.1.0 — приглашённый берётся из авторизации (не из тела запроса), один
//                  пригласивший на пользователя, только новые пользователи (48 ч)
//          1.0.0
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
  referred_id?: number;
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

    // Приглашённый — всегда тот, кто вызывает (а не id из тела запроса):
    // иначе можно было записать в «свои рефералы» любых пользователей
    const referred_id = auth.userId!;
    const referred_username = auth.user?.username || body.referred_username || null;
    const { ref_code } = body;

    if (!ref_code || typeof ref_code !== 'string' || ref_code.length > 32) {
      return errorResponse('Missing ref_code', 400);
    }

    // Декодируем реферальный код
    let referrerId: number;
    try {
      referrerId = parseInt(atob(ref_code), 10);
    } catch (err) {
      return errorResponse('Invalid ref_code', 400);
    }

    if (!Number.isSafeInteger(referrerId) || referrerId <= 0 || referrerId === referred_id) {
      return errorResponse('Invalid referrer or self-referral', 400);
    }

    // У пользователя может быть только один пригласивший
    const existing = await supabaseFetch(
      `referrals?referred_id=eq.${referred_id}&select=*`,
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

    // Пригласивший должен существовать, а приглашённый — быть новым
    // (зарегистрирован не раньше чем 48 часов назад)
    const [referrerRows, meRows] = await Promise.all([
      supabaseFetch(`users?telegram_id=eq.${referrerId}&select=telegram_id`, { method: 'GET' }, config),
      supabaseFetch(`users?telegram_id=eq.${referred_id}&select=created_at`, { method: 'GET' }, config),
    ]);
    if (!Array.isArray(referrerRows) || referrerRows.length === 0) {
      return errorResponse('Referrer not found', 404);
    }
    const createdAt = Array.isArray(meRows) && meRows[0]?.created_at ? new Date(meRows[0].created_at).getTime() : Date.now();
    if (Date.now() - createdAt > 48 * 60 * 60 * 1000) {
      return jsonResponse({ success: false, error: 'Only new users can be referred' });
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
