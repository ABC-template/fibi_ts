// ============================================
// api/ads/reward.ts
// Награда за просмотр рекламы Adsgram.
//
//   GET  ?userid=<id>&secret=<секрет> → Reward URL: сервер Adsgram сам сообщает
//                                        о досмотре — ЕДИНСТВЕННЫЙ способ начисления
//   GET  (с авторизацией приложения)  → состояние кнопки: сумма, остаток на сегодня,
//                                        сколько секунд ждать до следующего просмотра
//
// Версия: 2.0.0 — начисление только по Reward URL от Adsgram. Режим client
//                  (начисление по запросу приложения) убран: его можно было вызвать
//                  без просмотра рекламы. Без ADSGRAM_BLOCK_ID и ADSGRAM_REWARD_SECRET
//                  (не короче 16 символов) реклама выключена. Заблокированным
//                  пользователям награда не начисляется.
//          1.0.0
//
// Настройка в кабинете Adsgram → блок → Reward URL:
//   https://<домен>/api/ads/reward?userid=[userId]&secret=<ADSGRAM_REWARD_SECRET>
// Сумма, дневной лимит и интервал — в БД (economy_rules 'ad:rewarded', economy_settings).
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

const MIN_SECRET_LENGTH = 16;

/** Секрет Reward URL (null — не задан или слишком короткий) */
function rewardSecret(): string | null {
  const s = process.env.ADSGRAM_REWARD_SECRET?.trim() || '';
  return s.length >= MIN_SECRET_LENGTH ? s : null;
}

function blockId(): string | null {
  return process.env.ADSGRAM_BLOCK_ID?.trim() || null;
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
      const expected = rewardSecret();
      if (!expected) {
        console.error('[ads/reward] ADSGRAM_REWARD_SECRET не задан или короче 16 символов');
        return errorResponse('Reward URL is not configured', 503);
      }
      if (!safeEqual(url.searchParams.get('secret') || '', expected)) {
        return errorResponse('Forbidden', 403);
      }

      const userId = Number(url.searchParams.get('userid'));
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return errorResponse('Invalid userid', 400);
      }

      // Отказы по бизнес-правилам — 200, чтобы Adsgram не повторял запрос
      const blocked = await supabaseRPC('is_user_blocked', { p_user_id: userId }, cfg).catch(() => false);
      if (blocked === true) {
        return jsonResponse({ success: false, awarded: 0, reason: 'blocked' });
      }

      const result = await supabaseRPC('award_ad_coins', { p_user_id: userId, p_via: 'adsgram' }, cfg);
      const awarded = Number(result?.awarded) || 0;
      if (awarded > 0) {
        console.log(`🎬 [ads/reward] +${awarded} пользователю ${userId}`);
      } else {
        console.log(`🎬 [ads/reward] без начисления пользователю ${userId}: ${result?.reason || result?.error || 'unknown'}`);
      }
      return jsonResponse({
        success: result?.success === true,
        awarded,
        reason: result?.reason || result?.error || null,
      });
    }

    // ---------- Состояние для приложения ----------
    if (request.method !== 'GET') {
      // Начисление из приложения больше не принимается — только Reward URL
      return errorResponse('Method Not Allowed', 405);
    }

    const auth = await authenticate(request);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const status = await supabaseRPC('ad_reward_status', { p_user_id: auth.userId }, cfg);
    const configured = !!blockId() && !!rewardSecret();

    return jsonResponse({
      success: true,
      blockId: blockId(),
      enabled: configured && status?.enabled === true,
      amount: status?.amount || 0,
      dailyLimit: status?.daily_limit || 0,
      usedToday: status?.used_today || 0,
      remainingToday: status?.remaining_today || 0,
      waitSeconds: status?.wait_seconds || 0,
    });
  } catch (err) {
    console.error('[ads/reward] Error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
