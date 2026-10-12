// ============================================
// api/admin/stats.ts
// Статистика для дашборда админ-панели
// Версия: 2.0.0 — доступ по Telegram ID; квесты (всего/активных), энергия за 7 дней
//                  (списано, недоплаты), рефералы по статусам, реклама за сегодня
// ============================================

import { authenticate, isAdminTelegramId } from '../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';

export const config = { runtime: 'edge' };

function rows(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

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

    const cfg = getSupabaseConfig('service');
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').toISOString();

    const [users, activeUsers, quests, referrals, coins, spends, shortfalls, ads] = await Promise.all([
      supabaseFetch('users?select=role,subscription_tier,premium_until', { method: 'GET' }, cfg),
      supabaseFetch(`users?last_checkin_date=gte.${weekAgo.slice(0, 10)}&select=telegram_id`, { method: 'GET' }, cfg),
      supabaseFetch('quests?select=is_active', { method: 'GET' }, cfg),
      supabaseFetch('referrals?select=status', { method: 'GET' }, cfg),
      supabaseFetch(`coin_transactions?created_at=gte.${weekAgo}&select=amount`, { method: 'GET' }, cfg),
      supabaseFetch(`token_transactions?type=eq.spend&created_at=gte.${weekAgo}&select=amount`, { method: 'GET' }, cfg),
      supabaseFetch(`system_logs?event_type=eq.token_shortfall&created_at=gte.${weekAgo}&select=metadata`, { method: 'GET' }, cfg),
      supabaseFetch(`coin_transactions?source=eq.ad:rewarded&created_at=gte.${dayStart}&select=amount`, { method: 'GET' }, cfg),
    ]);

    const u = rows(users);
    const paidActive = (x: any) =>
      x.role === 'premium' && (!x.premium_until || new Date(x.premium_until).getTime() > now);

    let coinsEarned = 0;
    let coinsSpent = 0;
    for (const t of rows(coins)) {
      if (t.amount > 0) coinsEarned += t.amount;
      else coinsSpent += Math.abs(t.amount);
    }

    const energySpent = rows(spends).reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    const shortfallSum = rows(shortfalls).reduce((sum, l) => sum + (Number(l.metadata?.shortfall) || 0), 0);
    const ref = rows(referrals);

    const stats = {
      total_users: u.length,
      active_users_7d: rows(activeUsers).length,
      premium_users: u.filter(paidActive).length,
      trial_users: u.filter((x) => x.role === 'trial').length,
      admin_users: u.filter((x) => x.role === 'admin' || x.role === 'creator').length,

      total_quests: rows(quests).length,
      active_quests: rows(quests).filter((q) => q.is_active).length,

      coins_earned_7d: coinsEarned,
      coins_spent_7d: coinsSpent,
      energy_spent_7d: energySpent,
      shortfall_count_7d: rows(shortfalls).length,
      shortfall_energy_7d: shortfallSum,

      referrals_total: ref.length,
      referrals_pending: ref.filter((r) => r.status === 'pending' || r.status === 'active').length,
      referrals_rewarded: ref.filter((r) => r.status === 'rewarded').length,

      ad_views_today: rows(ads).length,
      ad_coins_today: rows(ads).reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    };

    return jsonResponse({ success: true, stats });
  } catch (err) {
    console.error('Admin stats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
