// ============================================
// api/ads/reward.ts
// Награда за просмотр рекламы Adsgram.
//
//   GET  (с авторизацией приложения)  → состояние кнопки: сумма, остаток на сегодня,
//                                        сколько секунд ждать до следующего просмотра
//   POST (с авторизацией приложения)  → начислить после досмотра (режим client)
//   GET  ?userid=<id>&secret=<секрет> → Reward URL Adsgram (режим server):
//                                        сервер Adsgram сам сообщает о досмотре
//
// Режим — переменная ADS_REWARD_MODE: client (по умолчанию) или server.
// В режиме server начисление из приложения отключено, иначе награда пришла бы дважды.
// Сумма, дневной лимит и интервал — в БД (economy_rules 'ad:rewarded', economy_settings).
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

function rewardMode(): 'client' | 'server' {
  return process.env.ADS_REWARD_MODE?.trim() === 'server' ? 'server' : 'client';
}

/** Сравнение строк за постоянное время (секрет в URL) */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const cfg = getSupabaseConfig('service');
  const url = new URL(request.url);

  try {
    // ---------- Reward URL от Adsgram ----------
    if (request.method === 'GET' && url.searchParams.has('userid')) {
      const expected = process.env.ADSGRAM_REWARD_SECRET?.trim();
      const secret = url.searchParams.get('secret') || '';
      if (!expected || !safeEqual(secret, expected)) {
        return errorResponse('Forbidden', 403);
      }
      if (rewardMode() !== 'server') {
        return jsonResponse({ success: false, error: 'Server reward mode is disabled' }, 200);
      }
      const userId = Number(url.searchParams.get('userid'));
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return errorResponse('Invalid userid', 400);
      }
      const result = await supabaseRPC('award_ad_coins', { p_user_id: userId, p_via: 'adsgram_url' }, cfg);
      return jsonResponse({ success: result?.success === true, awarded: result?.awarded || 0 });
    }

    // ---------- Запросы из приложения ----------
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }
    const userId = auth.userId!;

    if (request.method === 'GET') {
      const status = await supabaseRPC('ad_reward_status', { p_user_id: userId }, cfg);
      return jsonResponse({
        success: true,
        mode: rewardMode(),
        blockId: process.env.ADSGRAM_BLOCK_ID?.trim() || null,
        enabled: status?.enabled === true && !!process.env.ADSGRAM_BLOCK_ID?.trim(),
        amount: status?.amount || 0,
        dailyLimit: status?.daily_limit || 0,
        remainingToday: status?.remaining_today || 0,
        waitSeconds: status?.wait_seconds || 0,
      });
    }

    if (request.method === 'POST') {
      if (rewardMode() === 'server') {
        // Награду начислит Reward URL; приложению остаётся обновить баланс
        return jsonResponse({ success: true, awarded: 0, reason: 'server_mode' });
      }

      const blocked = await supabaseRPC('is_user_blocked', { p_user_id: userId }, cfg).catch(() => false);
      if (blocked === true) {
        return errorResponse('Доступ ограничен', 403);
      }

      const result = await supabaseRPC('award_ad_coins', { p_user_id: userId, p_via: 'client' }, cfg);
      if (!result || result.success === false) {
        return jsonResponse({ success: false, awarded: 0, error: result?.error || 'Не удалось начислить' });
      }
      return jsonResponse({
        success: true,
        awarded: result.awarded || 0,
        reason: result.reason || null,
        remainingToday: result.remaining_today ?? null,
        newBalance: typeof result.new_balance === 'number' ? result.new_balance : undefined,
      });
    }

    return errorResponse('Method Not Allowed', 405);
  } catch (err) {
    console.error('[ads/reward] Error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
