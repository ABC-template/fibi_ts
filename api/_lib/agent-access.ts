// ============================================
// api/_lib/agent-access.ts
// Единая логика проверки доступа пользователя к ИИ-агенту.
// Используется и в api/agents/index.ts (список агентов для фронта),
// и в api/chat/stream.ts (финальная проверка перед запросом к ИИ),
// чтобы обе точки не расходились в правилах доступа.
//
// Версия: 2.0.0 — новая схема доступа вместо allowed_roles:
//   1) admin/creator — доступ есть всегда, дальше ничего не проверяем;
//   2) неавторизованный пользователь (гость) — доступа нет;
//   3) иначе сравниваем тариф пользователя с минимальным тарифом агента
//      (min_pro_tier), порядок тарифов берём из subscription_tiers.sort_order
//      в БД, а не из захардкоженной в коде таблицы.
//
//   allowed_roles в БД/типах оставлен как есть (колонка NOT NULL, менять
//   схему БД сейчас не стали) — но в проверке доступа больше не участвует.
// ============================================

/**
 * Минимальный набор полей агента, необходимый для проверки доступа.
 */
export interface IAgentAccessCheckable {
  is_active: boolean;
  min_pro_tier: string | null;
}

export interface IAgentAccessResult {
  hasAccess: boolean;
  reason: 'auth' | 'tier' | 'inactive' | null;
}

/**
 * Порядок тарифов: tier_key → sort_order. Собирается один раз за запрос
 * из subscription_tiers (см. buildTierOrder ниже) и передаётся сюда —
 * сама checkAgentAccess к БД не обращается.
 */
export type TierOrderMap = Record<string, number>;

/**
 * Проверяет, есть ли у пользователя доступ к агенту.
 *
 * @param userRole     роль пользователя ('admin' | 'creator' | что угодно
 *                      ещё — trial/premium больше не различаются на этом
 *                      уровне, оба идут через сравнение тарифов) либо
 *                      null/undefined/'guest' для неавторизованного.
 * @param userProTier   users.subscription_tier текущего пользователя.
 * @param tierOrder     карта tier_key → sort_order из subscription_tiers.
 */
export function checkAgentAccess(
  agent: IAgentAccessCheckable,
  userRole: string | null | undefined,
  userProTier: string | null,
  tierOrder: TierOrderMap
): IAgentAccessResult {
  if (!agent.is_active) {
    return { hasAccess: false, reason: 'inactive' };
  }

  // Админ и создатель — доступ есть всегда, дальше ничего не проверяем.
  if (userRole === 'admin' || userRole === 'creator') {
    return { hasAccess: true, reason: null };
  }

  // Неавторизованный пользователь (гость) доступа не имеет.
  if (!userRole || userRole === 'guest') {
    return { hasAccess: false, reason: 'auth' };
  }

  // Агент без минимального тарифа — открыт любому авторизованному
  // пользователю (в т.ч. на trial, у которого subscription_tier обычно
  // null или 'trial').
  if (!agent.min_pro_tier) {
    return { hasAccess: true, reason: null };
  }

  const userLevel = tierOrder[userProTier || 'trial'] ?? 0;
  const requiredLevel = tierOrder[agent.min_pro_tier] ?? 0;

  if (userLevel < requiredLevel) {
    return { hasAccess: false, reason: 'tier' };
  }

  return { hasAccess: true, reason: null };
}

/**
 * Строит карту tier_key → sort_order из строк subscription_tiers.
 * Вызывающий код сам делает SELECT (обычно уже в рамках существующего
 * запроса), здесь только сборка карты.
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
