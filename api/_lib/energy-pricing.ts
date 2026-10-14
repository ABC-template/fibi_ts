// ============================================
// api/_lib/energy-pricing.ts
// Цена запросов в энергии — одна шкала для всего проекта (текст, фото, видео, голос):
//   энергия = $ OpenRouter × курс (⚡ за $1) × коэффициент, не меньше мин. списания.
// Курс, коэффициент и минимум голоса — в economy_settings (админка → Настройки).
// Цена модели за токен нужна только для оценки до запроса и max_tokens;
// факт — usage.cost из ответа OpenRouter.
// Версия: 1.0.0 — вместо text-pricing.ts: курс из настроек (был зашит 10 000 в коде
//                  и отдельно energy_per_usd у каждого генеративного агента);
//                  тип записи журнала расходов ai_usage
// ============================================

import { supabaseFetch } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';

export interface IEnergyRates {
  /** Сколько энергии стоит $1 себестоимости */
  energyPerUsd: number;
  /** Коэффициент голосового ввода */
  voiceMarkup: number;
  /** Минимальное списание за голосовой ввод */
  voiceMinCharge: number;
}

/** Настройки меняются редко: Edge-функция перечитывает их не чаще раза в минуту */
const RATES_TTL_MS = 60_000;
let ratesCache: { at: number; rates: IEnergyRates } | null = null;

/** Курс и параметры голоса из economy_settings. Бросает ошибку, если настроек нет. */
export async function getEnergyRates(config: ISupabaseConfig): Promise<IEnergyRates> {
  if (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS) return ratesCache.rates;

  const rows = await supabaseFetch(
    'economy_settings?select=energy_per_usd,voice_markup,voice_min_charge&order=created_at.asc&limit=1',
    { method: 'GET' },
    config
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  const energyPerUsd = Number(row?.energy_per_usd);
  const voiceMarkup = Number(row?.voice_markup);
  const voiceMinCharge = Number(row?.voice_min_charge);

  if (!Number.isFinite(energyPerUsd) || energyPerUsd <= 0) {
    throw new Error('economy_settings.energy_per_usd не задан');
  }
  if (!Number.isFinite(voiceMarkup) || voiceMarkup <= 0 || !Number.isInteger(voiceMinCharge) || voiceMinCharge < 1) {
    throw new Error('economy_settings: коэффициент или минимум голоса не заданы');
  }

  const rates = { energyPerUsd, voiceMarkup, voiceMinCharge };
  ratesCache = { at: Date.now(), rates };
  return rates;
}

/** Доллары → энергия с коэффициентом; не меньше minCharge */
export function energyForUsd(usd: number, energyPerUsd: number, markup: number, minCharge: number): number {
  const safeUsd = Number.isFinite(usd) && usd > 0 ? usd : 0;
  // −1e-9: 0.0003 × 10 000 = 3.0000000000000004 не должно стать 4
  const raw = Math.ceil(safeUsd * energyPerUsd * markup - 1e-9);
  return Math.max(raw, minCharge);
}

/** Мин. списание агента: целое ≥ 1 */
export function agentMinCharge(agent: { min_charge?: number | null } | null | undefined): number {
  const n = Math.floor(Number(agent?.min_charge));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// ============================================
// Журнал расходов (ai_usage) — пишется в settle_energy
// ============================================

export type UsageKind = 'text' | 'image' | 'video' | 'voice';
/** usage — ответ OpenRouter; tokens — токены × цена; estimate — оценка; none — неизвестно */
export type UsageCostSource = 'usage' | 'tokens' | 'estimate' | 'none';
/** done — целиком; cancelled — оборвал пользователь; broken — оборвалась модель; empty — пустой ответ */
export type UsageOutcome = 'done' | 'cancelled' | 'broken' | 'empty';

export interface IUsageRecord {
  kind: UsageKind;
  model_id: string;
  agent_id: string | null;
  chat_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number;
  cost_source: UsageCostSource;
  markup: number;
  energy_per_usd: number;
  outcome: UsageOutcome;
}

// ============================================
// Цена модели за токен
// ============================================

export interface IModelPrices {
  /** $ за один входной токен */
  prompt: number;
  /** $ за один выходной токен */
  completion: number;
}

const PRICE_CACHE_TTL_MS = 60 * 60 * 1000;
const priceCache = new Map<string, { at: number; prices: IModelPrices | null }>();

/**
 * Цена модели за токен (максимум по эндпоинтам — оценка с запасом).
 * null — цену получить не удалось: вызывающий код использует запасной расчёт.
 */
export async function getModelPrices(
  modelId: string,
  apiKey: string
): Promise<IModelPrices | null> {
  const hit = priceCache.get(modelId);
  if (hit && Date.now() - hit.at < PRICE_CACHE_TTL_MS) return hit.prices;

  let prices: IModelPrices | null = null;
  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
      // Цена нужна только для предварительной оценки — не задерживаем старт ответа
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(3000) }
    );
    if (res.ok) {
      const json: any = await res.json();
      const endpoints: any[] = Array.isArray(json?.data?.endpoints) ? json.data.endpoints : [];
      let prompt = 0;
      let completion = 0;
      for (const e of endpoints) {
        prompt = Math.max(prompt, Number(e?.pricing?.prompt) || 0);
        completion = Math.max(completion, Number(e?.pricing?.completion) || 0);
      }
      if (prompt > 0 || completion > 0) prices = { prompt, completion };
    }
  } catch (err) {
    console.warn('getModelPrices failed:', (err as Error).message);
  }

  // Неудачу помним недолго (минуту), удачу — час
  priceCache.set(modelId, { at: prices ? Date.now() : Date.now() - PRICE_CACHE_TTL_MS + 60_000, prices });
  return prices;
}
