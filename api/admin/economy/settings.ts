// ============================================
// api/admin/economy/settings.ts
// Глобальные настройки экономики (админ)
// Версия: 2.1.0 — сроки хранения журналов не меньше 7 дней (их чистит cron clean-all)
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

/** Поля, которые можно менять из админки: [min, max] для чисел, null — флаг */
const FIELDS: Record<string, [number, number] | null> = {
  exchange_enabled: null,
  whitelist_enabled: null,
  channel_gate_enabled: null,
  exchange_rate: [0, 1_000_000],
  min_exchange_amount: [1, 1_000_000],
  max_exchange_percent: [1, 100],
  game_coins_daily_cap: [0, 1_000_000],
  ad_reward_daily_limit: [0, 1_000],
  ad_reward_min_interval_sec: [0, 86_400],
  // Не короче недели: по журналам считаются недельная статистика и дневные лимиты
  log_retention_days: [7, 3_650],
  audit_log_retention_days: [7, 3_650],
};

const SELECT = ['id', ...Object.keys(FIELDS), 'updated_at'].join(',');

/** Проверка тела запроса: только известные поля, числа — целые в диапазоне */
function pickUpdates(body: any): Record<string, any> | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid body';
  const out: Record<string, any> = {};
  for (const [key, range] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    if (range === null) {
      if (typeof body[key] !== 'boolean') return `${key} must be boolean`;
      out[key] = body[key];
    } else {
      const n = Number(body[key]);
      if (!Number.isInteger(n) || n < range[0] || n > range[1]) {
        return `${key} must be an integer ${range[0]}…${range[1]}`;
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
    const rows = await supabaseFetch(`economy_settings?select=${SELECT}&limit=1`, { method: 'GET' }, config);
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
