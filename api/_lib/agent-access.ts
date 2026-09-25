// ============================================
// api/_lib/agent-access.ts
// Единая логика проверки доступа пользователя к ИИ-агенту.
// Используется и в api/agents/index.ts (список агентов для фронта),
// и в api/chat/stream.ts (финальная проверка перед запросом к ИИ),
// чтобы обе точки не расходились в правилах доступа.
// Версия: 1.1.0 — роль-гейт tier-проверки исправлен с "pro" на "premium"
//                  (реальная роль платных пользователей в этом проекте)
// ============================================

/**
 * Минимальный набор полей агента, необходимый для проверки доступа.
 * Совместим и с IAiAgent (types/agents.ts), и с локальным IAgent в stream.ts —
 * структурная типизация TypeScript позволяет передавать любой объект,
 * у которого есть эти три поля.
 */
export interface IAgentAccessCheckable {
  is_active: boolean;
  allowed_roles: string[];
  min_pro_tier: string | null;
}

export interface IAgentAccessResult {
  hasAccess: boolean;
  reason: 'role' | 'tier' | 'inactive' | null;
}

/**
 * Проверяет, есть ли у пользователя с ролью userRole (и, если применимо,
 * подпиской userProTier) доступ к агенту.
 */
export function checkAgentAccess(
  agent: IAgentAccessCheckable,
  userRole: string,
  userProTier: string | null
): IAgentAccessResult {
  if (!agent.is_active) {
    return { hasAccess: false, reason: 'inactive' };
  }

  const allowed = agent.allowed_roles || [];
  if (!allowed.includes(userRole)) {
    return { hasAccess: false, reason: 'role' };
  }

  // Тарифный tier проверяем только для платных пользователей — реальная
  // роль после покупки/активации подписки называется "premium"
  // (api/subscription/purchase.ts, activate_trial), а не "pro".
  if (userRole === 'premium' && agent.min_pro_tier) {
    const tierOrder: Record<string, number> = {
      basic: 1,
      plus: 2,
      ultra: 3,
    };

    const userTierLevel = tierOrder[userProTier || 'basic'] || 0;
    const requiredLevel = tierOrder[agent.min_pro_tier] || 0;

    if (userTierLevel < requiredLevel) {
      return { hasAccess: false, reason: 'tier' };
    }
  }

  return { hasAccess: true, reason: null };
}
