// ============================================
// api/admin/economy/settings.ts
// Глобальные настройки экономики (админ)
// Версия: 2.2.0 — цена энергии: energy_per_usd (⚡ за $1, все агенты и голос),
//                  voice_markup (дробный коэффициент голоса), voice_min_charge
//          2.1.0 — сроки хранения журналов не меньше 7 дней (их чистит cron clean-all)
//          2.0.0 — сохраняются только известные поля с проверкой диапазонов
//                  (раньше тело запроса записывалось в economy_settings как есть);
//                  удалены неиспользуемые поля; добавлены лимиты игр и рекламы
//          1.1.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId)
//          1.0.0
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  isAdminTelegramId,
} from '../../_lib/index';

export const config = { runtime: 'edge' };

/** Число: диапазон и можно ли дробное (до сотых) */
interface INumberRule {
  min: number;
  max: number;
  decimal?: boolean;
}

/** Поля, которые можно менять из админки: правило для чисел, null — флаг. Диапазоны — как в CHECK БД */
const FIELDS: Record<string, INumberRule | null> = {
  exchange_enabled: null,
  whitelist_enabled: null,
  channel_gate_enabled: null,
  exchange_rate: { min: 0, max: 1_000_000 },
  min_exchange_amount: { min: 1, max: 1_000_000 },
  max_exchange_percent: { min: 1, max: 100 },
  game_coins_daily_cap: { min: 0, max: 1_000_000 },
  ad_reward_daily_limit: { min: 0, max: 1_000 },
  ad_reward_min_interval_sec: { min: 0, max: 86_400 },
  // Цена энергии: ⚡ за $1 себестоимости — для всех агентов и голоса
  energy_per_usd: { min: 100, max: 1_000_000 },
  voice_markup: { min: 0.1, max: 100, decimal: true },
  voice_min_charge: { min: 1, max: 100_000 },
  // Не короче недели: по журналам считаются недельная статистика и дневные лимиты
  log_retention_days: { min: 7, max: 3_650 },
  audit_log_retention_days: { min: 7, max: 3_650 },
};

const SELECT = ['id', ...Object.keys(FIELDS), 'updated_at'].join(',');

/** Проверка тела запроса: только известные поля, числа — в диапазоне (целые, если не decimal) */
function pickUpdates(body: any): Record<string, any> | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid body';
  const out: Record<string, any> = {};
  for (const [key, rule] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    if (rule === null) {
      if (typeof body[key] !== 'boolean') return `${key} must be boolean`;
      out[key] = body[key];
    } else {
      const n = Number(body[key]);
      const okType = rule.decimal ? Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 : Number.isInteger(n);
      if (!okType || n < rule.min || n > rule.max) {
        return `${key} must be ${rule.decimal ? 'a number (0.01 step)' : 'an integer'} ${rule.min}…${rule.max}`;
      }
      out[key] = n;
    }
  }
  return out;
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || !isAdminTelegramId(auth.userId)) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');

  try {
    const rows = await supabaseFetch(`economy_settings?select=${SELECT}&order=created_at.asc&limit=1`, { method: 'GET' }, config);
    const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (request.method === 'GET') {
      return jsonResponse({ success: true, settings: existing || {} });
    }

    if (request.method === 'POST') {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const updates = pickUpdates(body);
      if (typeof updates === 'string') return errorResponse(updates, 400);
      if (Object.keys(updates).length === 0) return errorResponse('Nothing to update', 400);

      const now = new Date().toISOString();
      const result = existing
        ? await supabaseFetch(
            `economy_settings?id=eq.${existing.id}&select=${SELECT}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ ...updates, updated_at: now }),
              headers: { Prefer: 'return=representation' },
            },
            config
          )
        : await supabaseFetch(
            `economy_settings?select=${SELECT}`,
            {
              method: 'POST',
              body: JSON.stringify({ ...updates, created_at: now, updated_at: now }),
              headers: { Prefer: 'return=representation' },
            },
            config
          );

      return jsonResponse({
        success: true,
        settings: Array.isArray(result) ? result[0] : result,
      });
    }

    return errorResponse('Method Not Allowed', 405);
  } catch (err) {
    console.error('[admin/economy/settings] error:', err);
    return errorResponse('Failed to process settings', 500);
  }
}
