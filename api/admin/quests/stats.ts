// ============================================
// api/admin/quests/stats.ts
// Статистика по квестам
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
} from '../../_lib/index';

export const config = { runtime: 'edge' };

const CREATOR_ID = 1541531808;

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
    return errorResponse('Доступ запрещён', 403);
  }

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const config = getSupabaseConfig('service');

    // Общая статистика
    const stats = {
      total_quests: 0,
      total_completions: 0,
      total_claimed: 0,
      by_type: {} as Record<string, any>,
    };

    // Все квесты
    const quests = await supabaseFetch(
      'quests?select=id,type,external_id',
      { method: 'GET' },
      config
    );

    stats.total_quests = quests?.length || 0;

    // Статистика по типам
    for (const q of quests || []) {
      if (!stats.by_type[q.type]) {
        stats.by_type[q.type] = { total: 0, completions: 0, claimed: 0 };
      }
      stats.by_type[q.type].total++;

      const completions = await supabaseFetch(
        `user_quests?quest_id=eq.${q.id}&completed=eq.true&select=id&limit=0&count=exact`,
        { method: 'GET' },
        config
      );
      stats.by_type[q.type].completions += completions?.length || 0;
      stats.total_completions += completions?.length || 0;

      const claimed = await supabaseFetch(
        `user_quests?quest_id=eq.${q.id}&claimed=eq.true&select=id&limit=0&count=exact`,
        { method: 'GET' },
        config
      );
      stats.by_type[q.type].claimed += claimed?.length || 0;
      stats.total_claimed += claimed?.length || 0;
    }

    return jsonResponse({
      success: true,
      stats,
    });
  } catch (err) {
    console.error('Quest stats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
