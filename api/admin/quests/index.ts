// ============================================
// api/admin/quests/index.ts
// CRUD для всех типов квестов (админ-панель)
// Версия: 1.0.1 - исправлена обработка ошибок
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
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');

  // GET — список всех квестов
  if (request.method === 'GET') {
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

  // POST — создать квест
  if (request.method === 'POST') {
    try {
      const body = await request.json();

      // Проверяем обязательные поля
      if (!body.title) {
        return errorResponse('Missing title', 400);
      }

      if (!body.type || !['daily', 'sponsor', 'event'].includes(body.type)) {
        return errorResponse('Invalid type. Allowed: daily, sponsor, event', 400);
      }

      // Формируем external_id если не указан
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

      // Пробуем вставить
      const result = await supabaseFetch(
        'quests',
        {
          method: 'POST',
          body: JSON.stringify(questData),
          headers: { 'Prefer': 'return=representation' },
        },
        config
      );

      // Проверяем результат
      if (!result) {
        console.error('❌ Supabase вернул пустой результат');
        return errorResponse('Failed to create quest: empty response from Supabase', 500);
      }

      // Если result — массив, берём первый элемент
      const createdQuest = Array.isArray(result) ? result[0] : result;

      if (!createdQuest || !createdQuest.id) {
        console.error('❌ Не удалось создать квест:', result);
        return errorResponse('Failed to create quest: invalid response from Supabase', 500);
      }

      console.log('✅ Квест создан:', createdQuest.id);

      return jsonResponse({
        success: true,
        quest: createdQuest,
      });

    } catch (err) {
      console.error('❌ Create quest error:', err);
      return errorResponse(`Failed to create quest: ${(err as Error).message}`, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
