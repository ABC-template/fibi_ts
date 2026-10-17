// ============================================
// api/_lib/quest-fields.ts
// Поля квеста, которые админка может задать, и их проверка (создание и правка)
// Версия: 1.0.0
// ============================================

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export function readQuestFields(body: any): Record<string, any> | string {
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

/** Новый квест: значения по умолчанию + проверенные поля (title и type обязательны) */
export function buildNewQuest(fields: Record<string, any>): Record<string, any> | string {
  if (!fields.title) return 'Missing title';
  if (!fields.type) return 'Invalid type. Allowed: daily, sponsor, event';
  return {
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
}
