// ============================================
// api/_lib/supabase-client.ts 
// Описание: Работа с Supabase через fetch (Edge Runtime)
// Версия: 15.2.0 — удалён IUsageLimitResult (старый лимит запросов)
//          15.1.0 — убрано поле trial_used (пробного периода больше нет)
//          15.0.0 — без Supabase Auth: getOrCreateUser вместо getOrCreateAuthUser
//                   (пароли и вход по паролю убраны), удалён setAppUserContext
//                   (функция в БД удалена); убраны неиспользуемые updateStreak, claimQuest,
//                   resetDailyQuests, initUserQuests, spendAbstractTokens
//          14.1.0 — claimQuest (RPC claim_quest) вместо claimQuestWithBonus
//          14.0.0 — добавлена spendAbstractTokens
// ============================================

import type { ITelegramUser } from './auth';

export interface ISupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(type: 'anon' | 'service' = 'anon'): ISupabaseConfig {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) {
    throw new Error('SUPABASE_URL not configured');
  }

  let key: string;
  if (type === 'service') {
    key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
    if (!key) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }
  } else {
    key = process.env.SUPABASE_ANON_KEY?.trim() || '';
    if (!key) {
      throw new Error('SUPABASE_ANON_KEY not configured');
    }
  }

  return { url, key };
}

export async function supabaseFetch(
  path: string,
  options: RequestInit = {},
  config: ISupabaseConfig | null = null
): Promise<any> {
  const { url: supabaseUrl, key: supabaseKey } = config || getSupabaseConfig('service');

  const fullUrl = `${supabaseUrl}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  if (options.method === 'POST' && !(options.headers as any)?.Prefer) {
    headers['Prefer'] = 'return=representation';
  }

  const res = await fetch(fullUrl, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) }
  });

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return { success: true };
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (options.method === 'POST' && Array.isArray(data)) {
      return data[0] || data;
    }
    return data;
  }

  return { success: true };
}

export async function supabaseRPC(
  functionName: string,
  params: Record<string, any> = {},
  config: ISupabaseConfig | null = null
): Promise<any> {
  const { url: supabaseUrl, key: supabaseKey } = config || getSupabaseConfig('service');

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RPC ${functionName} error: ${text.substring(0, 200)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return { success: true };
}

export async function getUserUuid(
  telegramId: number,
  config: ISupabaseConfig | null = null
): Promise<string | null> {
  try {
    const result = await supabaseFetch(
      `users?telegram_id=eq.${telegramId}&select=id`,
      { method: 'GET' },
      config
    );

    if (result && Array.isArray(result) && result.length > 0) {
      return result[0].id;
    }
    return null;
  } catch (err) {
    console.error('Failed to get user UUID:', (err as Error).message);
    return null;
  }
}

export async function updateSyncToken(
  telegramId: number,
  config: ISupabaseConfig | null = null
): Promise<string | null> {
  try {
    const newToken = crypto.randomUUID();

    await supabaseFetch(
      `users?telegram_id=eq.${telegramId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sync_token: newToken,
          sync_token_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      },
      config
    );

    console.log(`🔄 [updateSyncToken] Новый sync_token для ${telegramId}: ${newToken.substring(0, 8)}...`);
    return newToken;
  } catch (err) {
    console.error('Failed to update sync token:', (err as Error).message);
    return null;
  }
}

export async function getSyncToken(
  telegramId: number,
  config: ISupabaseConfig | null = null
): Promise<string | null> {
  try {
    const result = await supabaseFetch(
      `users?telegram_id=eq.${telegramId}&select=sync_token`,
      { method: 'GET' },
      config
    );

    if (result && Array.isArray(result) && result.length > 0) {
      return result[0].sync_token;
    }
    return null;
  } catch (err) {
    console.error('Failed to get sync token:', (err as Error).message);
    return null;
  }
}

export async function canUserSync(
  userId: number,
  config: ISupabaseConfig | null = null
): Promise<boolean> {
  try {
    const result = await supabaseRPC('can_sync', { uid: userId }, config);
    return result === true || result === 'true';
  } catch (err) {
    console.error('Failed to check sync permission:', (err as Error).message);
    return false;
  }
}

/** Поля users, которые нужны при входе (auth/check) */
const LOGIN_USER_FIELDS =
  'id,telegram_id,role,premium_until,username,data_deadline,sync_token,subscription_tier';

async function selectLoginUser(telegramId: number, config: ISupabaseConfig | null): Promise<any | null> {
  const rows = await supabaseFetch(
    `users?telegram_id=eq.${telegramId}&select=${LOGIN_USER_FIELDS}`,
    { method: 'GET' },
    config
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Найти пользователя по Telegram ID или создать (trial).
 * Supabase Auth не используется: id — случайный uuid, он же sub токена Realtime.
 * Одновременные первые входы не создают дублей (on_conflict=telegram_id).
 */
export async function getOrCreateUser(
  telegramId: number,
  tgUser: ITelegramUser | null,
  config: ISupabaseConfig | null = null
): Promise<{ user: any; isNew: boolean }> {
  const existing = await selectLoginUser(telegramId, config);
  if (existing) return { user: existing, isNew: false };

  const inserted = await supabaseFetch(
    'users?on_conflict=telegram_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        telegram_id: telegramId,
        username: tgUser?.username || null,
        role: 'trial',
        subscription_tier: 'trial',
        user_lang: tgUser?.language_code || 'ru',
        sync_token: crypto.randomUUID(),
      }),
    },
    config
  );
  // Строка вернулась — создали мы; пусто — параллельный запрос успел раньше
  const isNew = !!(inserted && !Array.isArray(inserted) && inserted.id);

  const user = await selectLoginUser(telegramId, config);
  if (!user) throw new Error('Failed to create user');
  return { user, isNew };
}
