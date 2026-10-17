// ============================================
// api/admin/quests/[...path].ts
// Универсальный обработчик для /api/admin/quests/*
// Версия: 4.0.0 — создание и правка квеста — только известные поля с проверкой типов и
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

export const config = { runtime: 'edge' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FieldRule =
  | { kind: 'int'; min: number; max: number; nullable?: boolean }
  | { kind: 'enum'; values: string[] }
  | { kind: 'bool' }
  | { kind: 'text'; max: number; pattern?: RegExp; nullable?: boolean }
  | { kind: 'url'; nullable: true }
  | { kind: 'date'; nullable: true }
  | { kind: 'i18n'; max: number; nullable: boolean };

/** Поля квеста, которые админка может задать, и их проверка */
const QUEST_FIELDS: Record<string, FieldRule> = {
  external_id: { kind: 'text', max: 64, pattern: /^[a-z0-9_:-]+$/i },
  type: { kind: 'enum', values: ['daily', 'sponsor', 'event'] },
  category: { kind: 'text', max: 32, pattern: /^[a-z0-9_-]+$/i },
  title: { kind: 'i18n', max: 200, nullable: false },
  description: { kind: 'i18n', max: 1000, nullable: true },
  target: { kind: 'int', min: 1, max: 1_000_000 },
  reward_coins: { kind: 'int', min: 0, max: 1_000_000 },
  reset_type: { kind: 'enum', values: ['daily', 'never'] },
  cooldown_hours: { kind: 'int', min: 0, max: 8_760 },
  max_completions: { kind: 'int', min: 1, max: 1_000_000, nullable: true },
  verification_type: { kind: 'enum', values: ['auto', 'manual', 'pseudo'] },
  pseudo_hours: { kind: 'int', min: 0, max: 720 },
  is_active: { kind: 'bool' },
  starts_at: { kind: 'date', nullable: true },
  expires_at: { kind: 'date', nullable: true },
  sponsor_name: { kind: 'text', max: 100, nullable: true },
  sponsor_logo: { kind: 'url', nullable: true },
  sponsor_target: { kind: 'text', max: 200, nullable: true },
  sponsor_action_required: { kind: 'text', max: 50, nullable: true },
  event_banner: { kind: 'url', nullable: true },
  event_color: { kind: 'text', max: 9, pattern: /^#[0-9a-f]{3,8}$/i, nullable: true },
};

/** Значение поля по правилу; строка — ошибка */
function checkField(key: string, rule: FieldRule, value: any): { value: any } | string {
  if (value === null && 'nullable' in rule && rule.nullable) return { value: null };
  switch (rule.kind) {
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < rule.min || n > rule.max) return `${key}: целое ${rule.min}…${rule.max}`;
      return { value: n };
    }
    case 'enum':
      return rule.values.includes(value) ? { value } : `${key}: одно из ${rule.values.join(', ')}`;
    case 'bool':
      return typeof value === 'boolean' ? { value } : `${key}: true или false`;
    case 'text': {
      if (typeof value !== 'string') return `${key}: строка`;
      const v = value.trim();
      if (!v || v.length > rule.max || (rule.pattern && !rule.pattern.test(v))) return `${key}: неверное значение`;
      return { value: v };
    }
    case 'url':
      return typeof value === 'string' && value.length <= 500 && /^https:\/\/\S+$/.test(value)
        ? { value }
        : `${key}: ссылка https://`;
    case 'date':
      return typeof value === 'string' && Number.isFinite(Date.parse(value))
        ? { value: new Date(value).toISOString() }
        : `${key}: дата`;
    case 'i18n': {
      const obj = typeof value === 'string' ? { ru: value, en: value } : value;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return `${key}: текст или { ru, en }`;
      const out: Record<string, string> = {};
      for (const lang of ['ru', 'en', 'it']) {
        if (obj[lang] === undefined || obj[lang] === null || obj[lang] === '') continue;
        if (typeof obj[lang] !== 'string' || obj[lang].length > rule.max) return `${key}.${lang}: до ${rule.max} символов`;
        out[lang] = obj[lang];
      }
      if (!out.ru) return rule.nullable ? { value: null } : `${key}.ru обязателен`;
      return { value: out };
    }
  }
}

/** Известные поля тела запроса; лишние игнорируются, неверные — ошибка */
function readQuestFields(body: any): Record<string, any> | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid body';
  const out: Record<string, any> = {};
  for (const [key, rule] of Object.entries(QUEST_FIELDS)) {
    if (body[key] === undefined) continue;
    const res = checkField(key, rule, body[key]);
    if (typeof res === 'string') return res;
    out[key] = res.value;
  }
  return out;
}

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
  // POST /api/admin/quests — создать квест
  // ==========================================
  if (request.method === 'POST' && !questId) {
    try {
      const fields = readQuestFields(await request.json());
      if (typeof fields === 'string') return errorResponse(fields, 400);
      if (!fields.title) return errorResponse('Missing title', 400);
      if (!fields.type) return errorResponse('Invalid type. Allowed: daily, sponsor, event', 400);

      const questData = {
        external_id: fields.external_id || `${fields.type}_${Date.now()}`,
        category: fields.type,
        description: null,
        target: 1,
        reward_coins: 0,
        reset_type: fields.type === 'daily' ? 'daily' : 'never',
        cooldown_hours: 0,
        max_completions: null,
        verification_type: 'auto',
        pseudo_hours: 12,
        is_active: true,
        starts_at: new Date().toISOString(),
        expires_at: null,
        ...fields,
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
