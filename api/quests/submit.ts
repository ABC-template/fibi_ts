// ============================================
// api/quests/submit.ts
// Спонсорское задание: «Я выполнил — проверить»
// Версия: 2.0.0
//   - auto: подписка на канал спонсора проверяется у Telegram сразу (бот должен быть
//     админом канала). Подписан — задание одобрено, награду можно забрать; не подписан —
//     400 { code: 'not_subscribed' }; проверить нельзя (бот не админ, приватная ссылка) —
//     уходит на ручную проверку (mode: 'manual')
//   - pseudo: засчитывается автоматически через pseudo_hours (mode: 'pseudo', expiresAt)
//   - manual: на проверку администратору (mode: 'manual')
//   - proof_data от клиента — только объект до 2 КБ (раньше без ограничений)
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

const MAX_PROOF_BYTES = 2_000;

interface ISubmitRequest {
  userQuestId: string;
  proofData?: unknown;
}

function sanitizeProof(raw: unknown): Record<string, any> | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  try {
    const json = JSON.stringify(raw);
    return json.length <= MAX_PROOF_BYTES ? JSON.parse(json) : null;
  } catch {
    return null;
  }
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

    let body: ISubmitRequest;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const userQuestId = String(body?.userQuestId || '');
    if (!UUID_RE.test(userQuestId)) {
      return errorResponse('userQuestId is required', 400);
    }
    const proof = sanitizeProof(body?.proofData);
    if (!proof) {
      return errorResponse('Proof data is too large or invalid', 400);
    }

    const config = getSupabaseConfig('service');

    // Задание пользователя и его настройки
    const rows = await supabaseFetch(
      `user_quests?id=eq.${userQuestId}&user_id=eq.${userId}` +
        `&select=id,status,completed,claimed,quests!inner(type,verification_type,sponsor_target,pseudo_hours,is_active)`,
      { method: 'GET' },
      config
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    const quest = row?.quests;
    if (!row || !quest || quest.is_active === false) {
      return errorResponse('Задание не найдено', 404);
    }
    if (row.completed || row.claimed) {
      return errorResponse('Задание уже выполнено', 400);
    }

    const verification = String(quest.verification_type || 'manual');

    // ---------- auto: проверка подписки у Telegram ----------
    let mode: 'approved' | 'pseudo' | 'manual' = verification === 'pseudo' ? 'pseudo' : 'manual';
    let proofData: Record<string, any> = proof;

    if (verification === 'auto') {
      const chat = parseTelegramChat(quest.sponsor_target);
      const member = chat ? await fetchTelegramMembership(chat, userId) : null;

      if (member === false) {
        return jsonResponse(
          {
            error: 'Подписка не найдена. Подпишитесь на канал и нажмите «Проверить» ещё раз.',
            code: 'not_subscribed',
          },
          400
        );
      }
      if (member === true) {
        mode = 'approved';
        proofData = { method: 'telegram', chat, checked_at: new Date().toISOString() };
      } else {
        // Проверить автоматически нельзя — администратору на проверку
        mode = 'manual';
        proofData = { ...proof, auto_check: 'unavailable' };
      }
    }

    const submitted = await supabaseRPC(
      'submit_quest_proof',
      { p_user_id: userId, p_user_quest_id: userQuestId, p_proof_data: proofData },
      config
    );
    if (submitted?.success === false) {
      return errorResponse(submitted.error || 'Failed to submit proof', 400);
    }

    if (mode === 'approved') {
      const verified = await supabaseRPC(
        'verify_quest',
        { p_user_quest_id: userQuestId, p_approved: true },
        config
      );
      if (verified?.success === false) {
        return errorResponse(verified.error || 'Failed to approve', 400);
      }
      return jsonResponse({ success: true, status: 'approved', completed: true, mode });
    }

    return jsonResponse({
      success: true,
      status: submitted?.status || 'submitted',
      expiresAt: submitted?.expires_at || null,
      mode,
    });
  } catch (err) {
    console.error('[quests/submit] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
