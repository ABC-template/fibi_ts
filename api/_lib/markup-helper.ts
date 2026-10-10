// ============================================
// api/_lib/markup-helper.ts
// Получение актуального markup коэффициента агента
// с учётом тарифа пользователя (markup_by_tier)
// Версия: 1.0.0
// ============================================

/**
 * Возвращает markup для конкретного тарифа пользователя.
 * Приоритет:
 * 1. agent.markup_by_tier[userTier]
 * 2. agent.markup_coefficient (fallback)
 * 3. 1.0 (защита от NaN)
 */
export function getMarkupForTier(
  agent: {
    markup_coefficient?: number | null;
    markup_by_tier?: Record<string, number> | null;
  },
  userTier: string | null
): number {
  const tier = userTier || 'trial';

  if (agent.markup_by_tier && typeof agent.markup_by_tier === 'object') {
    const value = agent.markup_by_tier[tier];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  const fallback = Number(agent.markup_coefficient);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return 1.0;
}
