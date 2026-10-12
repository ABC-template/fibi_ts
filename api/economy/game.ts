// ============================================
// api/economy/game.ts
// Монеты за события в играх. Клиент присылает только событие,
// сумму, одноразовость и суточный потолок определяет БД (award_game_coins).
// Версия: 1.0.0
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
} from '../_lib/index';

export const config = { runtime: 'edge' };

const EVENT_RE = /^[a-z0-9_:]{1,64}$/;
const MAX_METADATA_BYTES = 2000;

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

    let body: { event?: string; metadata?: Record<string, any> };
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const event = String(body?.event || '').trim();
    if (!EVENT_RE.test(event)) {
      return errorResponse('Invalid event', 400);
    }

    let metadata: Record<string, any> = {};
    if (body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
      const json = JSON.stringify(body.metadata);
      if (json.length <= MAX_METADATA_BYTES) metadata = body.metadata;
    }

    const cfg = getSupabaseConfig('service');

    const blocked = await supabaseRPC('is_user_blocked', { p_user_id: userId }, cfg).catch(() => false);
    if (blocked === true) {
      return errorResponse('Доступ ограничен', 403);
    }

    const result = await supabaseRPC(
      'award_game_coins',
      { p_user_id: userId, p_event: event, p_metadata: metadata },
      cfg
    );

    if (!result || result.success === false) {
      return jsonResponse({ success: false, awarded: 0, error: result?.error || 'Не удалось начислить' }, 200);
    }

    return jsonResponse({
      success: true,
      awarded: result.awarded || 0,
      reason: result.reason || null,
      capped: result.capped === true,
      dailyCap: result.daily_cap ?? null,
      remainingToday: result.remaining_today ?? null,
      newBalance: typeof result.new_balance === 'number' ? result.new_balance : undefined,
    });
  } catch (err) {
    console.error('[economy/game] Error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
