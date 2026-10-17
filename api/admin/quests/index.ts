// ============================================
// api/admin/quests/index.ts
// Список квестов и создание (админ-панель); один квест — [...path].ts
// Версия: 2.0.0 — создание принимает только известные поля с проверкой (_lib/quest-fields);
//                  раньше тело запроса уходило в quests почти как есть
//          1.1.0 — доступ: админы из ADMIN_TELEGRAM_IDS / CREATOR_ID (isAdminTelegramId), без ID в коде
//          1.0.1 - исправлена обработка ошибок
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  isAdminTelegramId,
} from '../../_lib/index';
import { buildNewQuest, readQuestFields } from '../../_lib/quest-fields';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || !isAdminTelegramId(auth.userId)) {
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
      const fields = readQuestFields(await request.json());
      if (typeof fields === 'string') return errorResponse(fields, 400);
      const questData = buildNewQuest(fields);
      if (typeof questData === 'string') return errorResponse(questData, 400);

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
