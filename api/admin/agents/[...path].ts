// ============================================
// api/admin/agents/[...path].ts
// Описание: Получение, обновление и деактивация конкретного агента
// Версия: 1.4.0 — PATCH принимает и обновляет context_length модели
//                  (нужен для динамической проверки размера файлов)
// ============================================

import { authenticate, isAdmin, isCreator } from '../../_lib/auth';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import type { IAiAgentInput } from '../../../types/agents';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  const auth = await authenticate(request);
  if (auth.error || !auth.userId) {
    return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
  }

  const isUserAdmin = await isAdmin(auth.userId);
  if (!isUserAdmin) {
    return errorResponse('Forbidden', 403);
  }

  // Получаем id из URL
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const agentId = pathParts[pathParts.length - 1];

  if (!agentId || agentId === '[id]') {
    return errorResponse('Agent ID is required', 400);
  }

  const config = getSupabaseConfig('service');

  // ==========================================
  // GET — получить одного агента
  // ==========================================
  if (request.method === 'GET') {
    try {
      const result = await supabaseFetch(
        `ai_agents?id=eq.${agentId}&select=*`,
        { method: 'GET' },
        config
      );

      if (!result || !Array.isArray(result) || result.length === 0) {
        return errorResponse('Agent not found', 404);
      }

      return jsonResponse({
        success: true,
        agent: result[0],
      });
    } catch (err) {
      console.error('admin/agents/[id] GET error:', err);
      return errorResponse((err as Error).message || 'Failed to load agent', 500);
    }
  }

  // ==========================================
  // PATCH — обновление агента
  // ==========================================
  if (request.method === 'PATCH') {
    try {
      const body = (await request.json()) as Partial<IAiAgentInput> & {
        is_active?: boolean;
      };

      // Сначала получаем текущего агента
      const existing = await supabaseFetch(
        `ai_agents?id=eq.${agentId}&select=*`,
        { method: 'GET' },
        config
      );

      if (!existing || !Array.isArray(existing) || existing.length === 0) {
        return errorResponse('Agent not found', 404);
      }

      const current = existing[0];

      // Системных агентов может менять только creator
      if (current.is_system && !isCreator(auth.userId)) {
        return errorResponse('Only creator can edit system agents', 403);
      }

      // Собираем только переданные поля
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (body.name !== undefined) {
        if (!body.name?.ru?.trim()) {
          return errorResponse('Name (ru) is required', 400);
        }
        updates.name = body.name;
      }

      if (body.description !== undefined) {
        updates.description = body.description;
      }

      if (body.slug !== undefined) {
        const newSlug = body.slug.trim().toLowerCase();
        if (!newSlug) {
          return errorResponse('Slug cannot be empty', 400);
        }
        updates.slug = newSlug;
      }

      if (body.modality !== undefined) {
        if (!['text', 'image', 'video', 'audio'].includes(body.modality)) {
          return errorResponse('Invalid modality', 400);
        }
        updates.modality = body.modality;
      }

      if (body.model_id !== undefined) {
        if (!body.model_id.trim()) {
          return errorResponse('Model is required', 400);
        }
        updates.model_id = body.model_id.trim();
      }

      if (body.context_length !== undefined) {
        updates.context_length = body.context_length || null;
      }

      if (body.system_prompt !== undefined) {
        if (!body.system_prompt.trim()) {
          return errorResponse('System prompt is required', 400);
        }
        updates.system_prompt = body.system_prompt.trim();
      }

      if (body.markup_coefficient !== undefined) {
        const coeff = Number(body.markup_coefficient);
        if (isNaN(coeff) || coeff < 1) {
          return errorResponse('markup_coefficient must be >= 1', 400);
        }
        updates.markup_coefficient = coeff;
      }

      if (body.min_charge !== undefined) {
        const minCharge = Number(body.min_charge);
        if (isNaN(minCharge) || minCharge < 0) {
          return errorResponse('min_charge must be >= 0', 400);
        }
        updates.min_charge = minCharge;
      }

      if (body.allowed_roles !== undefined) {
        if (!Array.isArray(body.allowed_roles) || body.allowed_roles.length === 0) {
          return errorResponse('At least one role is required', 400);
        }
        updates.allowed_roles = body.allowed_roles;
      }

      if (body.min_pro_tier !== undefined) {
        updates.min_pro_tier = body.min_pro_tier || null;
      }

      if (body.is_active !== undefined) {
        updates.is_active = Boolean(body.is_active);
      }

      if (body.sort_order !== undefined) {
        updates.sort_order = Number(body.sort_order) || 100;
      }

      // is_system можно менять только creator и только в сторону false (на всякий случай)
      if (body.is_system !== undefined && isCreator(auth.userId)) {
        updates.is_system = Boolean(body.is_system);
      }


      // --- allowed_tiers ---
      if (body.allowed_tiers !== undefined) {
        if (body.allowed_tiers === null || (Array.isArray(body.allowed_tiers) && body.allowed_tiers.length === 0)) {
          updates.allowed_tiers = null;
        } else if (Array.isArray(body.allowed_tiers)) {
          updates.allowed_tiers = body.allowed_tiers;
        } else {
          return errorResponse('allowed_tiers must be an array or null', 400);
        }
      }

      // --- markup_by_tier ---
      if (body.markup_by_tier !== undefined) {
        if (body.markup_by_tier === null) {
          updates.markup_by_tier = null;
        } else if (typeof body.markup_by_tier === 'object' && !Array.isArray(body.markup_by_tier)) {
          for (const [tier, val] of Object.entries(body.markup_by_tier)) {
            const n = Number(val);
            if (!Number.isFinite(n) || n <= 0) {
              return errorResponse(`markup_by_tier.${tier} must be a positive number`, 400);
            }
          }
          updates.markup_by_tier = body.markup_by_tier;
        } else {
          return errorResponse('markup_by_tier must be an object or null', 400);
        }
      }

      // --- welcome_message ---
      if (body.welcome_message !== undefined) {
        if (body.welcome_message === null) {
          updates.welcome_message = null;
        } else if (typeof body.welcome_message === 'object' && !Array.isArray(body.welcome_message)) {
          updates.welcome_message = body.welcome_message;
        } else {
          return errorResponse('welcome_message must be an object or null', 400);
        }
      }

      // --- inject_balance ---
      if (body.inject_balance !== undefined) {
        updates.inject_balance = Boolean(body.inject_balance);
      }

      const updated = await supabaseFetch(
        `ai_agents?id=eq.${agentId}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(updates),
        },
        config
      );

      return jsonResponse({
        success: true,
        agent: Array.isArray(updated) ? updated[0] : updated,
      });
    } catch (err) {
      console.error('admin/agents/[id] PATCH error:', err);

      const message = (err as Error).message || '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return errorResponse('Agent with this slug already exists', 409);
      }

      return errorResponse(message || 'Failed to update agent', 500);
    }
  }

  return errorResponse('Method not allowed', 405);
}
