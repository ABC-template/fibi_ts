// ============================================
// api/agents/index.ts
// Описание: Список активных агентов для пользователей + флаг доступа
// Версия: 1.1.0 — checkAgentAccess вынесен в _lib/agent-access, добавлен edge runtime
// ============================================

import { authenticate } from '../_lib/auth';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { checkAgentAccess } from '../_lib/agent-access';
import type { IAiAgent, IAiAgentWithAccess } from '../../types/agents';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const auth = await authenticate(request, false); // можно и без авторизации (для гостей)
    const config = getSupabaseConfig('service');

    // Получаем активные агенты (системные + свои, если есть)
    let query = 'ai_agents?is_active=eq.true&select=*&order=sort_order.asc,created_at.desc';

    // Если пользователь авторизован — можно будет потом добавить личные агенты
    // Пока отдаём все активные (owner_id IS NULL)
    query += '&owner_id=is.null';

    const agents: IAiAgent[] = await supabaseFetch(query, { method: 'GET' }, config) || [];

    // Определяем роль и tier пользователя
    let userRole = 'guest';
    let userProTier: string | null = null;

    if (auth.userId) {
      const userRes = await supabaseFetch(
        `users?telegram_id=eq.${auth.userId}&select=role,subscription_tier`,
        { method: 'GET' },
        config
      );

      if (userRes && Array.isArray(userRes) && userRes.length > 0) {
        userRole = userRes[0].role || 'trial';
        userProTier = userRes[0].subscription_tier || null;
      }
    }

    // Добавляем флаг доступа
    const agentsWithAccess: IAiAgentWithAccess[] = agents.map((agent) => {
      const { hasAccess, reason } = checkAgentAccess(agent, userRole, userProTier);
      return {
        ...agent,
        has_access: hasAccess,
        access_reason: reason,
      };
    });

    return jsonResponse({
      success: true,
      agents: agentsWithAccess,
      user_role: userRole,
      user_pro_tier: userProTier,
    });
  } catch (err) {
    console.error('agents GET error:', err);
    return errorResponse((err as Error).message || 'Failed to load agents', 500);
  }
}
