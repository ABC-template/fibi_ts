// ============================================
// src/services/generation-pricing.ts
// Оценка стоимости генерации в энергии для кнопки «Сгенерировать ⚡ N».
// Формула повторяет серверную (api/_lib/openrouter-media.ts: estimateUsd/energyForUsd):
//   $ по прайсу агента × энергия за $ × коэффициент, не меньше min_charge.
// Это оценка до старта; списывается фактическая стоимость после успеха.
// Версия: 1.0.0
// ============================================

import type { IGenerationConfig } from '../../types/generation';

export function markupForTier(agent: any, tier: string | null | undefined): number {
  const key = tier || 'trial';
  const byTier = Number(agent?.markup_by_tier?.[key]);
  if (Number.isFinite(byTier) && byTier > 0) return byTier;
  const fallback = Number(agent?.markup_coefficient);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}

function estimateUsd(gen: IGenerationConfig, params: Record<string, any>): number | null {
  const p = gen?.pricing;
  const rate = Number(p?.energy_per_usd);
  if (!p || !Number.isFinite(rate) || rate <= 0) return null;

  if (p.kind === 'per_image') {
    const usd = Number(p.usd);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return usd * Math.max(1, Number(params.n) || 1);
  }

  const duration = Number(params.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const prices = p.prices || {};
  const perSec = Number(prices[String(params.resolution)] ?? prices.default);
  if (!Number.isFinite(perSec) || perSec <= 0) return null;
  return perSec * duration;
}

export function estimateEnergy(
  agent: any,
  tier: string | null | undefined,
  params: Record<string, any>
): number {
  const gen: IGenerationConfig = agent?.generation_config || {};
  const markup = markupForTier(agent, tier);
  const min = Number(agent?.min_charge) || 1;
  const floor = Math.max(Math.ceil(min * markup), min);

  const usd = estimateUsd(gen, params);
  if (usd === null) return floor;

  const raw = Math.ceil(usd * Number(gen.pricing!.energy_per_usd) * markup);
  return Math.max(raw, floor);
}
