// ============================================
// api/admin/quests/[...path].ts
// Универсальный обработчик для /api/admin/quests/*
// Версия: 3.0.0 - FIXED: все методы работают
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
} from '../../_lib/index';

export const config = { runtime: 'edge' };

const CREATOR_ID = 1541531808;

export default async function handler(request: Request): Promise<Response> {
  // CORS
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Аутентификация
  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');
  const url = new URL(request.url);
  
  // ✅ ИЗВЛЕКАЕМ ID ИЗ ПУТИ
  const match = url.pathname.match(/\/api\/admin\/quests\/([^\/]+)/);
  const questId = match ? match[1] : null;

  console.log(`📨 [${request.method}] Запрос к квесту ${questId || 'все'}`);
  console.log(`📨 Pathname: ${url.pathname}`);

  // ==========================================
  // OPTIONS — CORS
  // ==========================================
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      },
    });
  }

  // ==========================================
  // GET /api/admin/quests — список всех квестов
  // ==========================================
  if (request.method === 'GET' && !questId) {
    try {
      const quests = await supabaseFetch(
        'quests?order=type.asc,category.asc',
        { method: 'GET' },
        config
      );
      return jsonResponse({
        success: true,
        quests: quests || [],
      });
    } catch (err) {
      console.error('Get quests error:', (err as Error).message);
      return errorResponse((err as Error).message, 500);
    }
  }

  // ==========================================
  // GET /api/admin/quests/[id] — получить один квест
  // ==========================================
  if (request.method === 'GET' && questId) {
    try {
      const result = await supabaseFetch(
        `quests?id=eq.${questId}`,
        { method: 'GET' },
        config
      );

      if (!result || !Array.isArray(result) || result.length === 0) {
        return errorResponse('Quest not found', 404);
      }

      return jsonResponse({
        success: true,
        quest: result[0],
      });
    } catch (err) {
      console.error('Get quest error:', (err as Error).message);
      return errorResponse((err as Error).message, 500);
    }
  }

  // ==========================================
  // POST /api/admin/quests — создать квест
  // ==========================================
  if (request.method === 'POST' && !questId) {
    try {
      const body = await request.json();

      if (!body.title) {
        return errorResponse('Missing title', 400);
      }
      if (!body.type || !['daily', 'sponsor', 'event'].includes(body.type)) {
        return errorResponse('Invalid type. Allowed: daily, sponsor, event', 400);
      }

      const externalId = body.external_id || `${body.type}_${Date.now()}`;

      const questData = {
        external_id: externalId,
        type: body.type || 'daily',
        category: body.category || body.type || 'daily',
        title: typeof body.title === 'string' 
          ? { ru: body.title, en: body.title }
          : body.title,
        description: body.description ? (
          typeof body.description === 'string'
            ? { ru: body.description, en: body.description }
            : body.description
        ) : null,
        target: parseInt(body.target) || 1,
        reward_coins: parseInt(body.reward_coins) || 0,
        reset_type: body.reset_type || 'never',
        cooldown_hours: parseInt(body.cooldown_hours) || 0,
        max_completions: body.max_completions ? parseInt(body.max_completions) : null,
        verification_type: body.verification_type || 'auto',
        pseudo_hours: parseInt(body.pseudo_hours) || 12,
        is_active: body.is_active !== undefined ? body.is_active : true,
        starts_at: body.starts_at || new Date().toISOString(),
        expires_at: body.expires_at || null,
        sponsor_name: body.sponsor_name || null,
        sponsor_logo: body.sponsor_logo || null,
        sponsor_target: body.sponsor_target || null,
        sponsor_action_required: body.sponsor_action_required || null,
        event_banner: body.event_banner || null,
        event_color: body.event_color || null,
      };

      console.log('📝 Создаём квест:', JSON.stringify(questData, null, 2));

      const result = await supabaseFetch(
        'quests',
        {
          method: 'POST',
          body: JSON.stringify(questData),
          headers: { 'Prefer': 'return=representation' },
        },
        config
      );

      if (!result) {
        return errorResponse('Failed to create quest: empty response from Supabase', 500);
      }

      const createdQuest = Array.isArray(result) ? result[0] : result;

      if (!createdQuest || !createdQuest.id) {
        console.error('❌ Не удалось создать квест:', result);
        return errorResponse('Failed to create quest: invalid response from Supabase', 500);
      }

      return jsonResponse({
        success: true,
        quest: createdQuest,
      });

    } catch (err) {
      console.error('❌ Create quest error:', err);
      return errorResponse(`Failed to create quest: ${(err as Error).message}`, 500);
    }
  }

  // ==========================================
  // ✅ PUT /api/admin/quests/[id] — ОБНОВИТЬ КВЕСТ
  // ==========================================
  if (request.method === 'PUT' && questId) {
    try {
      const body = await request.json();

      console.log(`📝 [PUT] Обновляем квест ${questId}:`, JSON.stringify(body, null, 2));

      // Проверяем существование
      const existing = await supabaseFetch(
        `quests?id=eq.${questId}`,
        { method: 'GET' },
        config
      );

      if (!existing || !Array.isArray(existing) || existing.length === 0) {
        return errorResponse('Quest not found', 404);
      }

      // Обновляем
      const result = await supabaseFetch(
        `quests?id=eq.${questId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...body,
            updated_at: new Date().toISOString(),
          }),
          headers: { 'Prefer': 'return=representation' },
        },
        config
      );

      console.log(`✅ [PUT] Квест ${questId} обновлён`);

      return jsonResponse({
        success: true,
        quest: result && result.length > 0 ? result[0] : result,
      });
    } catch (err) {
      console.error('❌ [PUT] Update quest error:', err);
      return errorResponse(`Failed to update quest: ${(err as Error).message}`, 500);
    }
  }

  // ==========================================
  // ✅ PATCH /api/admin/quests/[id] — ЧАСТИЧНОЕ ОБНОВЛЕНИЕ
  // ==========================================
  if (request.method === 'PATCH' && questId) {
    try {
      const body = await request.json();

      console.log(`📝 [PATCH] Обновляем квест ${questId}:`, JSON.stringify(body, null, 2));

      // Проверяем существование
      const existing = await supabaseFetch(
        `quests?id=eq.${questId}`,
        { method: 'GET' },
        config
      );

      if (!existing || !Array.isArray(existing) || existing.length === 0) {
        return errorResponse('Quest not found', 404);
      }

      // Обновляем только переданные поля
      const updateData = {
        ...body,
        updated_at: new Date().toISOString(),
      };

      const result = await supabaseFetch(
        `quests?id=eq.${questId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
          headers: { 'Prefer': 'return=representation' },
        },
        config
      );

      console.log(`✅ [PATCH] Квест ${questId} обновлён`);

      return jsonResponse({
        success: true,
        quest: result && result.length > 0 ? result[0] : result,
      });
    } catch (err) {
      console.error('❌ [PATCH] Update quest error:', err);
      return errorResponse(`Failed to update quest: ${(err as Error).message}`, 500);
    }
  }

  // ==========================================
  // ✅ DELETE /api/admin/quests/[id] — УДАЛИТЬ КВЕСТ
  // ==========================================
  if (request.method === 'DELETE' && questId) {
    try {
      console.log(`🗑️ [DELETE] Удаляем квест ${questId}...`);

      // Проверяем существование
      const existing = await supabaseFetch(
        `quests?id=eq.${questId}&select=id`,
        { method: 'GET' },
        config
      );

      if (!existing || !Array.isArray(existing) || existing.length === 0) {
        return jsonResponse({
          success: false,
          error: 'Quest not found',
        }, 404);
      }

      // Удаляем связанные записи в user_quests
      await supabaseFetch(
        `user_quests?quest_id=eq.${questId}`,
        { method: 'DELETE' },
        config
      );

      // Удаляем сам квест
      await supabaseFetch(
        `quests?id=eq.${questId}`,
        { method: 'DELETE' },
        config
      );

      console.log(`✅ [DELETE] Квест ${questId} удалён`);

      return jsonResponse({
        success: true,
        message: 'Quest deleted successfully',
        questId: questId,
      });

    } catch (err) {
      console.error('❌ [DELETE] Delete quest error:', err);
      return jsonResponse({
        success: false,
        error: (err as Error).message,
      }, 500);
    }
  }

  // ==========================================
  // 405 Method Not Allowed
  // ==========================================
  console.warn(`⚠️ [405] Method ${request.method} Not Allowed for path ${url.pathname}`);
  return errorResponse(`Method ${request.method} Not Allowed`, 405);
}
