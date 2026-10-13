// ============================================
// api/_lib/agent-access.ts
// Единая логика проверки доступа пользователя к ИИ-агенту.
// Используется и в api/agents/index.ts (список агентов для фронта),
// и в api/chat/stream.ts (финальная проверка перед запросом к ИИ),
// чтобы обе точки не расходились в правилах доступа.
//
// Версия: 3.2.0 — trial в allowed_tiers не участвует: пустой список уже значит «всем»
//                  (включая trial), а выбранные тарифы ограничивают доступ только ими;
//                  normalizeAllowedTiers — для сохранения из админки; удалены устаревшие
//                  min_pro_tier и buildTierOrder
//          3.1.0 — генеративные агенты (image/video/audio) недоступны тарифу trial
//                  при любых allowed_tiers (защита от ухода в минус)
//          3.0.0 — multi-tier access (allowed_tiers)
//   Вместо одного min_pro_tier теперь массив allowed_tiers.
//   Доступ: user.tier ∈ allowed_tiers.
//   NULL / пустой массив = доступен всем авторизованным.
//   admin / creator — bypass.
// ============================================

/**
 * Минимальный набор полей агента, необходимый для проверки доступа.
 */
export interface IAgentAccessCheckable {
  is_active: boolean;
  /** text / image / video / audio */
  modality?: string | null;
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

  const userTier = userProTier || 'trial';

  // Генерация медиа стоит дорого: trial не допускается никогда,
  // даже если в allowed_tiers агента trial отмечен по ошибке
  if (isGenerativeModality(agent.modality) && userTier === 'trial') {
    return { hasAccess: false, reason: 'tier' };
  }

  // NULL или пустой массив = доступен любому авторизованному (trial в списке не учитывается)
  const allowed = (agent.allowed_tiers || []).filter((t) => t !== FREE_TIER);
  if (allowed.length === 0) {
    return { hasAccess: true, reason: null };
  }

  if (allowed.includes(userTier)) {
    return { hasAccess: true, reason: null };
  }

  return { hasAccess: false, reason: 'tier' };
}

/** Бесплатный тариф по умолчанию */
const FREE_TIER = 'trial';

/**
 * allowed_tiers из админки: массив уникальных непустых tier_key без trial.
 * Пустой результат — null (доступен всем). Не массив и не null — undefined (ошибка формата).
 */
export function normalizeAllowedTiers(value: unknown): string[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const tiers = Array.from(
    new Set(value.map((t) => String(t ?? '').trim()).filter((t) => t && t !== FREE_TIER))
  );
  return tiers.length > 0 ? tiers : null;
}

/** Генеративный агент (медиа): trial к нему не допускается */
export function isGenerativeModality(modality: string | null | undefined): boolean {
  return !!modality && modality !== 'text';
}
