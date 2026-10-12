// ============================================
// api/referral/link.ts
// Получение реферальной ссылки
// Версия: 1.1.0 — ссылка вида t.me/<бот>?startapp=ref_<id36> (открывает Mini App)
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

const BOT_USERNAME = process.env.BOT_USERNAME || 'FIBIROBOT';

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

    // Генерируем реферальный код (base64 от userId)
    // Ссылка сразу открывает Mini App: параметр startapp приходит в initData
    // (start_param) и обрабатывается сервером при входе (auth/check).
    // Код — id в base36: в startapp разрешены только A-Z a-z 0-9 _ -
    const refCode = Number(userId).toString(36);
    const appShortName = process.env.BOT_APP_SHORTNAME?.trim();
    const link = appShortName
      ? `https://t.me/${BOT_USERNAME}/${appShortName}?startapp=ref_${refCode}`
      : `https://t.me/${BOT_USERNAME}?startapp=ref_${refCode}`;

    // Сохраняем ссылку в БД (опционально)
    // Можно обновлять при каждом запросе, чтобы ссылка была актуальной

    return jsonResponse({
      success: true,
      link: link,
      ref_code: refCode,
      bot_username: BOT_USERNAME,
    });
  } catch (err) {
    console.error('Referral link error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
