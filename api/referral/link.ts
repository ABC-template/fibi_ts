// ============================================
// api/referral/link.ts
// Получение реферальной ссылки
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
    const refCode = btoa(String(userId));
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${refCode}`;

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
