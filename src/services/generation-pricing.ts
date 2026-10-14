// ============================================
// src/services/generation-pricing.ts
// Оценка стоимости генерации в энергии для кнопки «Сгенерировать ⚡ N».
// Формула повторяет серверную (api/_lib/openrouter-media.ts: estimateUsd,
// api/_lib/energy-pricing.ts: energyForUsd):
//   $ по прайсу агента × курс ⚡ за $1 (из настроек) × коэффициент, не меньше min_charge.
// Это оценка до старта; списывается фактическая стоимость после успеха.
// Версия: 1.2.0 — курс — общий (agent.energy_per_usd из GET /api/agents, источник —
//                  настройки экономики); мин. списание без умножения на коэффициент
//          1.1.0 — наценку выбирает сервер (agent.markup из GET /api/agents),
//                  таблица наценок по тарифам клиенту не отдаётся
// ============================================

import type { IGenerationConfig } from '../../types/generation';
import type { IPublicAgent } from '../../types/agents';

function agentMarkup(agent: Pick<IPublicAgent, 'markup'> | null | undefined): number {
  const m = Number(agent?.markup);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

/** Цена секунды: учитывает звук. Если звук не задан, а у модели есть цена со звуком — берём бóльшую (оценка с запасом). */
function perSecondUsd(p: any, params: Record<string, any>): number {
  const res = String(params.resolution);
  const base = Number(p.prices?.[res] ?? p.prices?.default);
  const audioTable = p.audio_prices && Object.keys(p.audio_prices).length > 0 ? p.audio_prices : null;
  const withSound = audioTable ? Number(audioTable[res] ?? audioTable.default) : NaN;

  const flag = params.generate_audio;
  if (flag === true || flag === 'true') return Number.isFinite(withSound) ? withSound : base;
  if (flag === false || flag === 'false') return base;
  const options = [base, withSound].filter((x) => Number.isFinite(x));
  return options.length ? Math.max(...options) : NaN;
}

function estimateUsd(gen: IGenerationConfig, params: Record<string, any>): number | null {
  const p = gen?.pricing;
  if (!p) return null;

  if (p.kind === 'per_image') {
    const usd = Number(p.usd);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return usd * Math.max(1, Number(params.n) || 1);
  }

  const duration = Number(params.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const perSec = perSecondUsd(p, params);
  if (!Number.isFinite(perSec) || perSec <= 0) return null;
  return perSec * duration;
}

export function estimateEnergy(
  agent: Pick<IPublicAgent, 'markup' | 'min_charge' | 'energy_per_usd' | 'generation_config'> | null | undefined,
  params: Record<string, any>
): number {
  const gen: IGenerationConfig = agent?.generation_config || {};
  const markup = agentMarkup(agent);
  const min = Math.max(1, Math.floor(Number(agent?.min_charge)) || 1);
  const rate = Number(agent?.energy_per_usd);

  const usd = estimateUsd(gen, params);
  if (usd === null || !Number.isFinite(rate) || rate <= 0) return min;

  return Math.max(Math.ceil(usd * rate * markup - 1e-9), min);
}
