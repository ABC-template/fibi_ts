// ============================================
// api/admin/stats.ts
// Статистика для дашборда админ-панели
// Версия: 4.0.0 — расходы ИИ за период (?days=1|7|30, RPC get_ai_usage_stats по журналу
//                  ai_usage): запросы, $ OpenRouter, токены, списанная энергия (бонус /
//                  постоянная), доход и баланс периода, топ-5 моделей, тарифы, дни;
//                  баланс OpenRouter: расход каждого ключа ROUTER_KEY0..9 (/api/v1/key)
//                  и остаток счёта (/api/v1/credits, если задан OPENROUTER_MANAGEMENT_KEY)
//          3.0.0 — подсчёт в БД (RPC get_admin_stats): цифры больше не обрезаются на 1000 строках
// ============================================

import { authenticate, isAdminTelegramId } from '../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseRPC } from '../_lib/supabase-client';
import { OPENROUTER, routerKeys } from '../_lib/openrouter-media';

export const config = { runtime: 'edge' };

const ALLOWED_DAYS = [1, 7, 30];
const OPENROUTER_TIMEOUT_MS = 5_000;

interface IKeyUsage {
  /** Номер ROUTER_KEY<n> (сам ключ наружу не уходит) */
  index: number;
  ok: boolean;
  usage?: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  limit?: number | null;
  limit_remaining?: number | null;
  is_free_tier?: boolean;
  error?: string;
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Расход по каждому ключу ROUTER_KEY0..9 */
async function keysUsage(): Promise<IKeyUsage[]> {
  return Promise.all(
    routerKeys().map(async ({ index, key }): Promise<IKeyUsage> => {
      try {
        const res = await fetch(`${OPENROUTER}/key`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
        });
        if (!res.ok) return { index, ok: false, error: `HTTP ${res.status}` };
        const d: any = (await res.json())?.data || {};
        return {
          index,
          ok: true,
          usage: num(d.usage),
          usage_daily: num(d.usage_daily),
          usage_weekly: num(d.usage_weekly),
          usage_monthly: num(d.usage_monthly),
          limit: numOrNull(d.limit),
          limit_remaining: numOrNull(d.limit_remaining),
          is_free_tier: d.is_free_tier === true,
        };
      } catch (err) {
        return { index, ok: false, error: (err as Error).message };
      }
    })
  );
}

/** Остаток на счёте OpenRouter: нужен management-ключ (обычный ключ получает 403) */
async function accountCredits(): Promise<Record<string, any>> {
  const key = process.env.OPENROUTER_MANAGEMENT_KEY?.trim();
  if (!key) return { configured: false };
  try {
    const res = await fetch(`${OPENROUTER}/credits`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });
    if (!res.ok) return { configured: true, ok: false, error: `HTTP ${res.status}` };
    const d: any = (await res.json())?.data || {};
    const total = num(d.total_credits) ?? 0;
    const used = num(d.total_usage) ?? 0;
    return { configured: true, ok: true, total_credits: total, total_usage: used, balance: total - used };
  } catch (err) {
    return { configured: true, ok: false, error: (err as Error).message };
  }
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

    const daysParam = Number(new URL(request.url).searchParams.get('days') || 7);
    const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;
    const db = getSupabaseConfig('service');

    // Все подсчёты — в БД: выборка строк в функцию упиралась в лимит PostgREST (1000)
    const [stats, ai, keys, credits] = await Promise.all([
      supabaseRPC('get_admin_stats', {}, db),
      supabaseRPC('get_ai_usage_stats', { p_days: days }, db),
      keysUsage(),
      accountCredits(),
    ]);
    if (!stats || typeof stats !== 'object' || !ai || typeof ai !== 'object') {
      return errorResponse('Не удалось получить статистику', 500);
    }

    return jsonResponse({
      success: true,
      days,
      stats,
      ai,
      openrouter: { keys, credits },
    });
  } catch (err) {
    console.error('Admin stats error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
