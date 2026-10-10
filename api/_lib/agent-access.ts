// ============================================
// api/_lib/agent-access.ts
// Единая логика проверки доступа пользователя к ИИ-агенту.
// Используется и в api/agents/index.ts (список агентов для фронта),
// и в api/chat/stream.ts (финальная проверка перед запросом к ИИ),
// чтобы обе точки не расходились в правилах доступа.
//
// Версия: 3.0.0 — multi-tier access (allowed_tiers)
//   Вместо одного min_pro_tier теперь массив allowed_tiers.
//   Доступ: user.tier ∈ allowed_tiers.
//   NULL / пустой массив = доступен всем авторизованным.
//   admin / creator — bypass.
//   min_pro_tier оставлен в типах/БД для обратной совместимости,
//   но в проверке доступа больше не участвует.
// ============================================

/**
 * Минимальный набор полей агента, необходимый для проверки доступа.
 */
export interface IAgentAccessCheckable {
  is_active: boolean;
  /** @deprecated используйте allowed_tiers */
  min_pro_tier?: string | null;
  /** Массив tier_key. NULL или [] = всем авторизованным */
  allowed_tiers?: string[] | null;
}

export interface IAgentAccessResult {
  hasAccess: boolean;
  reason: 'auth' | 'tier' | 'inactive' | null;
}

/**
 * Проверяет, есть ли у пользователя доступ к агенту.
 *
 * @param agent        агент (нужны is_active + allowed_tiers)
 * @param userRole     роль пользователя ('admin' | 'creator' | ...)
 *                     либо null/undefined/'guest' для неавторизованного
 * @param userProTier  users.subscription_tier текущего пользователя
 */
export function checkAgentAccess(
  agent: IAgentAccessCheckable,
  userRole: string | null | undefined,
  userProTier: string | null
): IAgentAccessResult {
  if (!agent.is_active) {
    return { hasAccess: false, reason: 'inactive' };
  }

  // Админ и создатель — доступ есть всегда
  if (userRole === 'admin' || userRole === 'creator') {
    return { hasAccess: true, reason: null };
  }

  // Неавторизованный пользователь (гость) доступа не имеет
  if (!userRole || userRole === 'guest') {
    return { hasAccess: false, reason: 'auth' };
  }

  // NULL или пустой массив = доступен любому авторизованному
  const allowed = agent.allowed_tiers;
  if (!allowed || allowed.length === 0) {
    return { hasAccess: true, reason: null };
  }

  const userTier = userProTier || 'trial';

  if (allowed.includes(userTier)) {
    return { hasAccess: true, reason: null };
  }

  return { hasAccess: false, reason: 'tier' };
}

/**
 * @deprecated Больше не используется для проверки доступа.
 * Оставлен только на случай, если где-то ещё нужен sort_order для UI.
 */
export type TierOrderMap = Record<string, number>;

/**
 * @deprecated Больше не используется для проверки доступа.
 */
export function buildTierOrder(
  tiers: Array<{ tier_key: string; sort_order: number | null }>
): TierOrderMap {
  const map: TierOrderMap = {};
  for (const t of tiers || []) {
    map[t.tier_key] = t.sort_order ?? 0;
  }
  return map;
}
