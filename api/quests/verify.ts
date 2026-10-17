// ============================================
// api/quests/verify.ts
// Верифицировать задание (админ)
// Версия: 1.1.1 - без неиспользуемых импортов и переменных
//          1.1.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId), без ID в коде
//          1.0.0
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
  isAdminTelegramId,
} from '../_lib/index';

export const config = { runtime: 'edge' };

interface IVerifyRequest {
  userQuestId: string;
  approved: boolean;
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

    // Только админы
    if (!isAdminTelegramId(auth.userId)) {
      return errorResponse('Доступ запрещён', 403);
    }

    let body: IVerifyRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { userQuestId, approved } = body;

    if (!userQuestId) {
      return errorResponse('userQuestId is required', 400);
    }

    if (typeof approved !== 'boolean') {
      return errorResponse('approved must be boolean', 400);
    }

    const config = getSupabaseConfig('service');

    const result = await supabaseRPC(
      'verify_quest',
      {
        p_user_quest_id: userQuestId,
        p_approved: approved,
      },
      config
    );

    if (result?.success === false) {
      return errorResponse(result.error || 'Failed to verify', 400);
    }

    return jsonResponse({
      success: true,
      status: result?.status || 'approved',
      completed: result?.completed || false,
    });
  } catch (err) {
    console.error('[quests/verify] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
