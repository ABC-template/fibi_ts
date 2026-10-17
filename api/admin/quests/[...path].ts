// ============================================
// api/admin/quests/[...path].ts
// Один квест и проверка заданий: /api/admin/quests/<id>, /api/admin/quests/submissions
// Версия: 4.1.0 — только операции с одним квестом (список и создание — api/admin/quests/index.ts:
//                  сюда запрос /admin/quests не попадает); проверка полей — общая (_lib/quest-fields)
//          4.0.0 — правка квеста — только известные поля с проверкой типов и
//                  диапазонов (раньше PATCH/PUT писали тело запроса в quests как есть);
//                  id квеста в пути — только UUID; удалён PUT (приложение его не вызывает)
//          3.2.0 — GET /admin/quests/submissions: задания на проверке
//          3.1.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId), без ID в коде
//          3.0.0 - FIXED: все методы работают
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  isAdminTelegramId,
} from '../../_lib/index';
import { UUID_RE, readQuestFields } from '../../_lib/quest-fields';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  // CORS
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Аутентификация
  const auth = await authenticate(request);
  if (auth.error || !isAdminTelegramId(auth.userId)) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');
  const url = new URL(request.url);
  
  // ✅ ИЗВЛЕКАЕМ ID ИЗ ПУТИ
  const match = url.pathname.match(/\/api\/admin\/quests\/([^\/]+)/);
  const questId = match ? match[1] : null;
  if (questId && questId !== 'submissions' && !UUID_RE.test(questId)) {
    return errorResponse('Invalid quest id', 400);
  }

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
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      },
    });
  }

  // ==========================================
  // GET /api/admin/quests/submissions — задания на проверке (ручные и псевдо)
  // Одобрение/отклонение — POST /api/quests/verify
  // ==========================================
  if (request.method === 'GET' && questId === 'submissions') {
    try {
      const rows = await supabaseFetch(
        'user_quests?status=eq.submitted&completed=eq.false&claimed=eq.false' +
          '&select=id,user_id,proof_data,updated_at,expires_at,' +
          'quest:quests(id,external_id,title,reward_coins,verification_type,type),user:users(username)' +
          '&order=updated_at.asc&limit=200',
        { method: 'GET' },
        config
      );
      return jsonResponse({ success: true, submissions: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      console.error('Get submissions error:', (err as Error).message);
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
  // ✅ PATCH /api/admin/quests/[id] — ЧАСТИЧНОЕ ОБНОВЛЕНИЕ
  // ==========================================
  if (request.method === 'PATCH' && questId) {
    try {
      const fields = readQuestFields(await request.json());
      if (typeof fields === 'string') return errorResponse(fields, 400);
      if (Object.keys(fields).length === 0) return errorResponse('Nothing to update', 400);

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
        ...fields,
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
