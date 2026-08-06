// ============================================
// api/admin/stats.ts
// Получение статистики для админ-панели
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

const CREATOR_ID = 1541531808;

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || auth.userId !== CREATOR_ID) {
      return errorResponse('Доступ запрещён', 403);
    }

    const config = getSupabaseConfig('service');

    // Общая статистика
    const users = await supabaseFetch('users?select=telegram_id,role,created_at', { method: 'GET' }, config);

    // Активные пользователи (за последние 7 дней)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeUsers = await supabaseFetch(
      `users?updated_at=gte.${sevenDaysAgo.toISOString()}&select=telegram_id`,
      { method: 'GET' },
      config
    );

    // Статистика монет
    const coins = await supabaseFetch(
      'coin_transactions?select=amount',
      { method: 'GET' },
      config
    );

    // Статистика рефералов
    const referrals = await supabaseFetch('referrals?select=status', { method: 'GET' }, config);

    const totalUsers = users?.length || 0;
    const premiumUsers = users?.filter((u: any) => u.role === 'premium').length || 0;
    const trialUsers = users?.filter((u: any) => u.role === 'trial').length || 0;

    let totalCoinsEarned = 0;
    let totalCoinsSpent = 0;
    if (coins && Array.isArray(coins)) {
      for (const t of coins) {
        if (t.amount > 0) totalCoinsEarned += t.amount;
        else totalCoinsSpent += Math.abs(t.amount);
      }
    }

    const stats = {
      total_users: totalUsers,
      active_users: activeUsers?.length || 0,
      premium_users: premiumUsers,
      trial_users: trialUsers,
      total_coins_earned: totalCoinsEarned,
      total_coins_spent: totalCoinsSpent,
      total_referrals: referrals?.length || 0,
      total_chats: 0,
      total_messages: 0,
    };

    return jsonResponse({
      success: true,
      stats,
    });
  } catch (err) {
    console.error('Admin stats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
