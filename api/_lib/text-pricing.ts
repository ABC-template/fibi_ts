// ============================================
// api/_lib/text-pricing.ts
// Цена текстовых запросов в энергии. Единая шкала для всех типов агентов:
// энергия = доллары OpenRouter × ENERGY_PER_USD × коэффициент агента.
// Факт списания берётся из usage.cost ответа OpenRouter; цена модели за токен
// нужна только для предварительной проверки баланса и лимита max_tokens.
// Версия: 1.0.0
// ============================================

/** Сколько энергии стоит $1 (шкала всего проекта: фото, видео, текст) */
export const ENERGY_PER_USD = 10_000;

export interface IModelPrices {
  /** $ за один входной токен */
  prompt: number;
  /** $ за один выходной токен */
  completion: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const priceCache = new Map<string, { at: number; prices: IModelPrices | null }>();

/**
 * Цена модели за токен (по самому дешёвому эндпоинту).
 * null — цену получить не удалось: вызывающий код использует запасной расчёт.
 */
export async function getModelPrices(
  modelId: string,
  apiKey: string
): Promise<IModelPrices | null> {
  const hit = priceCache.get(modelId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.prices;

  let prices: IModelPrices | null = null;
  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (res.ok) {
      const json: any = await res.json();
      const endpoints: any[] = Array.isArray(json?.data?.endpoints) ? json.data.endpoints : [];
      // Берём максимум по эндпоинтам: оценка должна быть консервативной
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

  priceCache.set(modelId, { at: Date.now(), prices });
  return prices;
}

/** Доллары → энергия с коэффициентом; не меньше min_charge агента */
export function textEnergyForUsd(usd: number, markup: number, minCharge: number): number {
  const raw = Math.ceil(usd * ENERGY_PER_USD * markup);
  return Math.max(raw, minCharge);
}
