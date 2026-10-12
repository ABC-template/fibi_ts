// ============================================
// api/admin/stats.ts
// Статистика для дашборда админ-панели
// Версия: 3.0.0 — подсчёт в БД (RPC get_admin_stats): цифры больше не обрезаются на 1000 строках
//          2.0.0 — доступ по Telegram ID; квесты (всего/активных), энергия за 7 дней
//                  (списано, недоплаты), рефералы по статусам, реклама за сегодня
// ============================================

import { authenticate, isAdminTelegramId } from '../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseRPC } from '../_lib/supabase-client';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || !isAdminTelegramId(auth.userId)) {
      return errorResponse('Доступ запрещён', 403);
    }

    // Все подсчёты — в БД: выборка строк в функцию упиралась в лимит PostgREST (1000)
    const stats = await supabaseRPC('get_admin_stats', {}, getSupabaseConfig('service'));
    if (!stats || typeof stats !== 'object') {
      return errorResponse('Не удалось получить статистику', 500);
    }

    return jsonResponse({ success: true, stats });
  } catch (err) {
    console.error('Admin stats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
