// ============================================
// api/admin/agents/index.ts
// Описание: Список агентов (GET) и создание нового агента (POST)
// Версия: 1.3.0 — принимаем и сохраняем context_length модели (нужен для
//                  динамической проверки размера файлов в chat/stream.ts)
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
      // allowed_roles больше не используется в проверке доступа (см.
      // api/_lib/agent-access.ts v2.0.0) — доступ теперь определяется
      // ролью (admin/creator) и min_pro_tier. Колонка в БД осталась
      // NOT NULL, поэтому шлём пустой массив, если фронт её не передал.

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
        context_length: body.context_length || null,
        system_prompt: body.system_prompt.trim(),
        markup_coefficient: Number(body.markup_coefficient) || 3.0,
        min_charge: Number(body.min_charge) ?? 50,
        allowed_roles: Array.isArray(body.allowed_roles) ? body.allowed_roles : [],
        min_pro_tier: body.min_pro_tier || null,
        allowed_tiers: Array.isArray(body.allowed_tiers) && body.allowed_tiers.length > 0 ? body.allowed_tiers : null,
        markup_by_tier: body.markup_by_tier && typeof body.markup_by_tier === 'object' ? body.markup_by_tier : null,
        welcome_message: body.welcome_message && typeof body.welcome_message === 'object' ? body.welcome_message : null,
        inject_balance: body.inject_balance === true,
        is_active: body.is_active !== false,
        is_system: makeSystem,
        sort_order: Number(body.sort_order) || 100,
        owner_id: null,
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
