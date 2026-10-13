// ============================================
// api/quests/submit.ts
// Спонсорское задание: «Я выполнил — проверить»
// Версия: 3.0.0
//   - только задания типа sponsor (остальные засчитывает сервер по прогрессу)
//   - из pending / rejected; пока задание на проверке — повторно не отправляется;
//     после отказа — не раньше чем через 24 ч (code: 'retry_later', retry_at)
//   - proof_data формирует сервер, от клиента ничего не принимается
//   - подтверждённая Telegram подписка одобряется в той же транзакции
//     (submit_quest_proof с p_approve, без отдельного verify_quest)
//   - ошибки отдаются с code; текст исключения наружу не уходит
//   2.0.0 — auto: проверка подписки у Telegram; pseudo / manual
//   1.0.0
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  supabaseRPC,
} from '../_lib/index';
import { UUID_RE } from '../_lib/media';
import { fetchTelegramMembership, parseTelegramChat } from '../_lib/access-gate';

export const config = { runtime: 'edge' };

function fail(error: string, code: string, status = 400, extra: Record<string, any> = {}): Response {
  return jsonResponse({ success: false, error, code, ...extra }, status);
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }
    const userId = auth.userId;

    let body: { userQuestId?: unknown };
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const userQuestId = String(body?.userQuestId || '');
    if (!UUID_RE.test(userQuestId)) {
      return errorResponse('userQuestId is required', 400);
    }

    const config = getSupabaseConfig('service');

    // Задание пользователя и его настройки (быстрые отказы до запроса к Telegram;
    // окончательная проверка — в submit_quest_proof под блокировкой строки)
    const rows = await supabaseFetch(
      `user_quests?id=eq.${userQuestId}&user_id=eq.${userId}` +
        `&select=id,status,completed,claimed,quests!inner(type,verification_type,sponsor_target,is_active)`,
      { method: 'GET' },
      config
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    const quest = row?.quests;
    if (!row || !quest || quest.is_active === false) {
      return fail('Задание не найдено', 'not_found', 404);
    }
    if (quest.type !== 'sponsor') {
      return fail('Это задание засчитывается автоматически', 'not_submittable');
    }
    if (row.completed || row.claimed) {
      return fail('Задание уже выполнено', 'completed');
    }
    if (row.status === 'submitted') {
      return fail('Задание уже на проверке', 'already_submitted');
    }

    const verification = String(quest.verification_type || 'manual');
    const now = new Date().toISOString();

    let mode: 'approved' | 'pseudo' | 'manual' = verification === 'pseudo' ? 'pseudo' : 'manual';
    let proofData: Record<string, any> = { method: mode, submitted_at: now };

    // ---------- auto: проверка подписки у Telegram ----------
    if (verification === 'auto') {
      const chat = parseTelegramChat(quest.sponsor_target);
      const member = chat ? await fetchTelegramMembership(chat, userId) : null;

      if (member === false) {
        return fail(
          'Подписка не найдена. Подпишитесь на канал и нажмите «Проверить» ещё раз.',
          'not_subscribed'
        );
      }
      if (member === true) {
        mode = 'approved';
        proofData = { method: 'telegram', chat, checked_at: now };
      } else {
        // Проверить автоматически нельзя — администратору на проверку
        mode = 'manual';
        proofData = { method: 'manual', auto_check: 'unavailable', submitted_at: now };
      }
    }

    const result = await supabaseRPC(
      'submit_quest_proof',
      {
        p_user_id: userId,
        p_user_quest_id: userQuestId,
        p_proof_data: proofData,
        p_approve: mode === 'approved',
      },
      config
    );

    if (!result?.success) {
      return fail(
        result?.error || 'Не удалось отправить',
        result?.code || 'submit_failed',
        400,
        result?.retry_at ? { retry_at: result.retry_at } : {}
      );
    }

    return jsonResponse({
      success: true,
      status: result.status,
      completed: !!result.completed,
      expiresAt: result.expires_at || null,
      mode,
    });
  } catch (err) {
    console.error('[quests/submit] Error:', err);
    return errorResponse('Failed to submit quest', 500);
  }
}
