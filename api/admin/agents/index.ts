// ============================================
// api/admin/agents/index.ts
// Описание: Список агентов (GET) и создание нового агента (POST)
// Версия: 1.0.0
// ============================================

import { authenticate, isAdmin, isCreator } from '../../_lib/auth';
import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import type { IAiAgentInput } from '../../../types/agents';

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

  const config = getSupabaseConfig('service');

  // ==========================================
  // GET — список всех агентов
  // ==========================================
  if (request.method === 'GET') {
    try {
      const agents = await supabaseFetch(
        'ai_agents?select=*&order=sort_order.asc,created_at.desc',
        { method: 'GET' },
        config
      );

      return jsonResponse({
        success: true,
        agents: agents || [],
      });
    } catch (err) {
      console.error('admin/agents GET error:', err);
      return errorResponse((err as Error).message || 'Failed to load agents', 500);
    }
  }

  // ==========================================
  // POST — создание агента
  // ==========================================
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as IAiAgentInput;

      // Валидация
      if (!body.slug?.trim()) {
        return errorResponse('Slug is required', 400);
      }
      if (!body.name?.ru?.trim()) {
        return errorResponse('Name (ru) is required', 400);
      }
      if (!body.modality || !['text', 'image', 'video', 'audio'].includes(body.modality)) {
        return errorResponse('Valid modality is required', 400);
      }
      if (!body.model_id?.trim()) {
        return errorResponse('Model is required', 400);
      }
      if (!body.system_prompt?.trim()) {
        return errorResponse('System prompt is required', 400);
      }
      if (!Array.isArray(body.allowed_roles) || body.allowed_roles.length === 0) {
        return errorResponse('At least one role is required', 400);
      }

      // Только creator может создавать системных агентов
      const makeSystem = body.is_system === true;
      if (makeSystem && !isCreator(auth.userId)) {
        return errorResponse('Only creator can create system agents', 403);
      }

      const payload = {
        slug: body.slug.trim().toLowerCase(),
        name: body.name,
        description: body.description || null,
        modality: body.modality,
        model_id: body.model_id.trim(),
        system_prompt: body.system_prompt.trim(),
        markup_coefficient: Number(body.markup_coefficient) || 3.0,
        min_charge: Number(body.min_charge) ?? 50,
        allowed_roles: body.allowed_roles,
        min_pro_tier: body.min_pro_tier || null,
        is_active: body.is_active !== false,
        is_system: makeSystem,
        sort_order: Number(body.sort_order) || 100,
        owner_id: null, // пока только системные/глобальные
      };

      const created = await supabaseFetch(
        'ai_agents',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        config
      );

      return jsonResponse({
        success: true,
        agent: created,
      }, 201);
    } catch (err) {
      console.error('admin/agents POST error:', err);

      const message = (err as Error).message || '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return errorResponse('Agent with this slug already exists', 409);
      }

      return errorResponse(message || 'Failed to create agent', 500);
    }
  }

  return errorResponse('Method not allowed', 405);
}
