// ============================================
// api/agents/index.ts
// Описание: Список активных агентов для пользователей + флаг доступа
// Версия: 2.0.0 — наружу уходят только поля для интерфейса (IPublicAgent):
//                  без system_prompt, model_id, context_length, inject_balance,
//                  таблицы наценок; наценка — одно число для тарифа пользователя;
//                  из generation_config — только modes/params/prompt/negative_prompt/pricing;
//                  заблокированный / без подписки на канал получает 403 с кодом
//          1.4.0 — истёкшая подписка считается trial (раньше агенты PRO показывались доступными)
//          1.3.0 — multi-tier access (allowed_tiers)
// ============================================

import { authenticate } from '../_lib/auth';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { checkAgentAccess } from '../_lib/agent-access';
import { getMarkupForTier } from '../_lib/markup-helper';
import type { IAgentName, AgentModality, IPublicAgent } from '../../types/agents';
import type { IGenerationConfig } from '../../types/generation';

export const config = { runtime: 'edge' };

/** Колонки ai_agents, нужные для ответа и проверки доступа */
const AGENT_COLUMNS = [
  'id',
  'slug',
  'name',
  'description',
  'modality',
  'welcome_message',
  'generation_config',
  'allowed_tiers',
  'markup_coefficient',
  'markup_by_tier',
  'min_charge',
  'sort_order',
  'is_active',
].join(',');

interface IAgentRow {
  id: string;
  slug: string;
  name: IAgentName;
  description: IAgentName | null;
  modality: AgentModality;
  welcome_message: IAgentName | null;
  generation_config: IGenerationConfig | null;
  allowed_tiers: string[] | null;
  markup_coefficient: number | null;
  markup_by_tier: Record<string, number> | null;
  min_charge: number | null;
  sort_order: number | null;
  is_active: boolean;
}

/** Из generation_config — только то, что нужно форме генерации на клиенте */
function publicGenerationConfig(gen: IGenerationConfig | null): IGenerationConfig | null {
  if (!gen || typeof gen !== 'object' || Array.isArray(gen)) return null;
  const out: IGenerationConfig = {};
  if (gen.modes !== undefined) out.modes = gen.modes;
  if (gen.params !== undefined) out.params = gen.params;
  if (gen.prompt !== undefined) out.prompt = gen.prompt;
  if (gen.negative_prompt !== undefined) out.negative_prompt = gen.negative_prompt;
  if (gen.pricing !== undefined) out.pricing = gen.pricing;
  return out;
}

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Без initData — гость (список виден, доступа нет).
    // Заблокированный / без подписки на канал — 403 с кодом, как на остальных эндпоинтах.
    const auth = await authenticate(request, false);
    if (auth.status) {
      return errorResponse(auth.error || 'Unauthorized', auth.status);
    }

    const config = getSupabaseConfig('service');

    const agentsPromise = supabaseFetch(
      `ai_agents?is_active=eq.true&owner_id=is.null&select=${AGENT_COLUMNS}&order=sort_order.asc,created_at.desc`,
      { method: 'GET' },
      config
    ) as Promise<IAgentRow[]>;

    // Роль и тариф пользователя
    let userRole = 'guest';
    let userProTier: string | null = null;

    if (auth.userId) {
      const userRes = await supabaseFetch(
        `users?telegram_id=eq.${auth.userId}&select=role,subscription_tier,premium_until`,
        { method: 'GET' },
        config
      );

      if (Array.isArray(userRes) && userRes.length > 0) {
        userRole = userRes[0].role || 'trial';
        const expired = !!userRes[0].premium_until && new Date(userRes[0].premium_until).getTime() < Date.now();
        userProTier = expired ? null : userRes[0].subscription_tier || null;
      }
    }

    const rows = (await agentsPromise) || [];

    const agents: IPublicAgent[] = rows.map((agent) => {
      const { hasAccess, reason } = checkAgentAccess(agent, userRole, userProTier);
      return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        description: agent.description ?? null,
        modality: agent.modality,
        welcome_message: agent.welcome_message ?? null,
        generation_config: publicGenerationConfig(agent.generation_config),
        allowed_tiers: agent.allowed_tiers ?? null,
        markup: getMarkupForTier(agent, userProTier),
        min_charge: Number(agent.min_charge) || 0,
        sort_order: Number(agent.sort_order) || 0,
        is_active: agent.is_active,
        has_access: hasAccess,
        access_reason: reason,
      };
    });

    return jsonResponse({
      success: true,
      agents,
      user_role: userRole,
      user_pro_tier: userProTier,
    });
  } catch (err) {
    console.error('agents GET error:', err);
    return errorResponse('Failed to load agents', 500);
  }
}
