// ============================================
// api/quests/progress.ts
// Прогресс заданий с клиента больше не принимается: клиент мог прислать
// любой increment и «выполнить» задание без действия. Прогресс считает
// сервер там, где происходит само действие (вход — daily_checkin в auth/check,
// проверяемые задания — submit/verify).
// Версия: 2.0.0
// ============================================

import { handleCORS, errorResponse } from '../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  return errorResponse('Прогресс заданий считает сервер', 410);
}
