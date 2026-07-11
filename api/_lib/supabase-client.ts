// ============================================
// api/_lib/supabase-client.ts 
// Описание: Работа с Supabase через fetch (Edge Runtime)
// Версия: 12.1.0 - FIXED
// ============================================

// ✅ ДОБАВИТЬ ЭТУ СТРОКУ:
import type { ITelegramUser } from './auth';

export interface ISupabaseConfig {
  url: string;
  key: string;
}

export interface IUsageLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Получить конфигурацию Supabase
 */
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

/**
 * Выполнить запрос к Supabase REST API
 */
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

/**
 * Выполнить RPC-запрос к Supabase
 */
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

// ==========================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ
// ==========================================

/**
 * Получить UUID пользователя по telegram_id
 */
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

/**
 * Обновить sync_token пользователя
 */
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

/**
 * Получить текущий sync_token пользователя
 */
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

// ==========================================
// ОСТАЛЬНЫЕ ФУНКЦИИ
// ==========================================

/**
 * Проверить лимит использований пользователя
 */
export async function checkUsageLimit(
  userId: number,
  config: ISupabaseConfig | null = null
): Promise<IUsageLimitResult> {
  try {
    const result = await supabaseRPC('check_usage_limit', { uid: userId }, config);
    if (result && typeof result === 'object') {
      return {
        allowed: result.allowed === true || result.allowed === 'true',
        used: parseInt(result.used || 0, 10),
        limit: parseInt(result.limit || 5, 10)
      };
    }
    return { allowed: true, used: 0, limit: 5 };
  } catch (err) {
    console.error('Failed to check usage limit:', (err as Error).message);
    return { allowed: true, used: 0, limit: 5 };
  }
}

/**
 * Инкрементировать счетчик использований
 */
export async function incrementUsage(
  userId: number,
  config: ISupabaseConfig | null = null
): Promise<number> {
  try {
    const result = await supabaseRPC('increment_usage', { uid: userId }, config);
    return parseInt(result || 0, 10);
  } catch (err) {
    console.error('Failed to increment usage:', (err as Error).message);
    return 0;
  }
}

/**
 * Проверить, может ли пользователь синхронизироваться
 */
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

/**
 * Установить контекст пользователя для RLS
 */
export async function setAppUserContext(
  userId: number,
  config: ISupabaseConfig | null = null
): Promise<void> {
  try {
    await supabaseRPC('set_app_user_id', { uid: userId }, config);
  } catch (err) {
    console.error('Failed to set user context:', (err as Error).message);
  }
}

// ==========================================
// ГЛАВНОЕ: СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ И ГЕНЕРАЦИЯ JWT
// ==========================================

export interface IAuthUserResult {
  userId: string;
  userUuid: string;
  telegramId: number;
  jwtToken: string;
  syncToken: string | null;
  isNew: boolean;
}

async function getUserPassword(
  telegramId: number,
  config: ISupabaseConfig | null = null
): Promise<string | null> {
  try {
    const result = await supabaseFetch(
      `users?telegram_id=eq.${telegramId}&select=password_hash`,
      { method: 'GET' },
      config
    );

    if (result && Array.isArray(result) && result.length > 0) {
      return result[0].password_hash;
    }
    return null;
  } catch (err) {
    console.error('Failed to get user password:', (err as Error).message);
    return null;
  }
}

export async function getOrCreateAuthUser(
  telegramId: number,
  userData: ITelegramUser | null,
  config: ISupabaseConfig | null = null
): Promise<IAuthUserResult> {
  console.log(`🔍 [getOrCreateAuthUser] Начинаем для telegram_id: ${telegramId}`);

  const { url: supabaseUrl, key: supabaseKey } = config || getSupabaseConfig('service');
  const email = `${telegramId}@telegram.local`;

  console.log(`🔍 [getOrCreateAuthUser] Email: ${email}`);

  // ==========================================
  // 1. ИЩЕМ ПОЛЬЗОВАТЕЛЯ В public.users
  // ==========================================

  console.log(`🔍 [getOrCreateAuthUser] Проверяем public.users...`);
  let existingUser: any = null;
  let userId: string | null = null;
  let userUuid: string | null = null;
  let userPassword: string | null = null;
  let isNew = false;

  try {
    const userRes = await supabaseFetch(
      `users?telegram_id=eq.${telegramId}&select=id,telegram_id,role,password_hash,sync_token`,
      { method: 'GET' },
      config
    );

    if (userRes && Array.isArray(userRes) && userRes.length > 0) {
      existingUser = userRes[0];
      userId = existingUser.id;
      userUuid = existingUser.id;
      userPassword = existingUser.password_hash;
      console.log(`🔍 [getOrCreateAuthUser] Найден в public.users:`, {
        id: existingUser.id,
        telegram_id: existingUser.telegram_id,
        role: existingUser.role,
        has_password: !!existingUser.password_hash,
        has_sync_token: !!existingUser.sync_token
      });
    }
  } catch (err) {
    console.error(`❌ [getOrCreateAuthUser] Ошибка поиска в public.users:`, (err as Error).message);
  }

  // ==========================================
  // 2. ЕСЛИ НАШЛИ В public.users → ИЩЕМ В auth.users ПО ID
  // ==========================================

  let authUser: any = null;
  let authUserId: string | null = null;

  if (existingUser) {
    console.log(`🔍 [getOrCreateAuthUser] Ищем в auth.users по ID: ${existingUser.id}`);

    try {
      const userById = await fetch(`${supabaseUrl}/auth/v1/admin/users/${existingUser.id}`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (userById.ok) {
        authUser = await userById.json();
        authUserId = authUser.id;
        console.log(`✅ [getOrCreateAuthUser] Найден в auth.users по ID: ${authUserId}`);
      } else if (userById.status === 404) {
        console.error(`❌❌❌ [getOrCreateAuthUser] КРИТИЧЕСКАЯ ОШИБКА: Пользователь ${existingUser.id} есть в public.users, но НЕТ в auth.users!`);
        throw new Error(`Целостность данных нарушена: пользователь ${existingUser.id} отсутствует в auth.users`);
      } else {
        console.error(`❌ [getOrCreateAuthUser] Ошибка при поиске в auth.users: ${userById.status}`);
        throw new Error(`Ошибка при поиске в auth.users: ${userById.status}`);
      }
    } catch (err) {
      if ((err as Error).message.includes('Целостность данных нарушена')) {
        throw err;
      }
      console.error(`❌ [getOrCreateAuthUser] Исключение при поиске в auth.users:`, (err as Error).message);
      throw new Error(`Ошибка при поиске в auth.users: ${(err as Error).message}`);
    }
  }

  // ==========================================
  // 3. ЕСЛИ НЕ НАШЛИ В public.users → ИЩЕМ В auth.users ПО EMAIL
  // ==========================================

  if (!existingUser) {
    console.log(`🔍 [getOrCreateAuthUser] Нет в public.users, ищем в auth.users по email...`);

    try {
      const findResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?filter=email.eq.${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (findResponse.ok) {
        const data = await findResponse.json();
        const authUsers = data.users || [];
        if (authUsers.length > 0) {
          authUser = authUsers[0];
          authUserId = authUser.id;
          console.log(`✅ [getOrCreateAuthUser] Найден в auth.users по email: ${authUserId}`);
        } else {
          console.log(`ℹ️ [getOrCreateAuthUser] Не найден в auth.users по email`);
        }
      } else {
        console.log(`ℹ️ [getOrCreateAuthUser] admin API вернул ${findResponse.status}`);
      }
    } catch (err) {
      console.log(`ℹ️ [getOrCreateAuthUser] Ошибка поиска в auth.users:`, (err as Error).message);
    }
  }

  // ==========================================
  // 4. ЕСТЬ В auth.users, НЕТ В public.users → СОЗДАЁМ В public.users
  // ==========================================

  if (authUser && !existingUser) {
    console.log(`🆕 [getOrCreateAuthUser] Есть в auth.users, создаем в public.users...`);
    userId = authUserId;
    userUuid = userId;

    userPassword = crypto.randomUUID();

    await supabaseFetch(
      'users',
      {
        method: 'POST',
        body: JSON.stringify({
          id: userId,
          telegram_id: telegramId,
          username: userData?.username || null,
          role: 'trial',
          user_lang: userData?.language_code || 'ru',
          password_hash: userPassword,
          sync_token: crypto.randomUUID(),
          created_at: new Date().toISOString()
        })
      },
      config
    );

    isNew = false;
    console.log(`✅ [getOrCreateAuthUser] Пользователь создан в public.users: ${userId}`);
  }

  // ==========================================
  // 5. НЕТ НИГДЕ → СОЗДАЁМ ВСЁ С НУЛЯ
  // ==========================================

  if (!existingUser && !authUser) {
    console.log(`🆕 [getOrCreateAuthUser] Создаем пользователя с нуля...`);

    const newUuid = crypto.randomUUID();
    userPassword = crypto.randomUUID();
    const newSyncToken = crypto.randomUUID();

    const createBody = {
      id: newUuid,
      email: email,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        telegram_id: telegramId,
        username: userData?.username || null,
        first_name: userData?.first_name || null,
        last_name: userData?.last_name || null
      }
    };

    const createResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createBody)
    });

    if (createResponse.ok) {
      const newAuthUser = await createResponse.json();
      userId = newAuthUser.id;
      userUuid = userId;
      console.log(`✅ [getOrCreateAuthUser] Пользователь создан через admin: ${userId}`);
    } else {
      const errorText = await createResponse.text();
      console.warn(`⚠️ [getOrCreateAuthUser] admin вернул ${createResponse.status}: ${errorText.substring(0, 100)}`);

      const signupResponse = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          password: userPassword,
          data: {
            telegram_id: telegramId,
            username: userData?.username || null,
            first_name: userData?.first_name || null,
            last_name: userData?.last_name || null
          }
        })
      });

      if (signupResponse.ok) {
        const signupData = await signupResponse.json();
        userId = signupData?.user?.id || signupData?.id || null;
        userUuid = userId;
        console.log(`✅ [getOrCreateAuthUser] Пользователь создан через signup: ${userId}`);
      } else {
        const signupError = await signupResponse.text();
        throw new Error(`Failed to create auth user: ${signupError}`);
      }
    }

    await supabaseFetch(
      'users',
      {
        method: 'POST',
        body: JSON.stringify({
          id: userId,
          telegram_id: telegramId,
          username: userData?.username || null,
          role: 'trial',
          user_lang: userData?.language_code || 'ru',
          password_hash: userPassword,
          sync_token: newSyncToken,
          created_at: new Date().toISOString()
        })
      },
      config
    );

    isNew = true;
    console.log(`✅ [getOrCreateAuthUser] Пользователь создан с нуля: ${userId}`);
  }

  // Если userId все еще null — ошибка
  if (!userId) {
    console.error(`❌ [getOrCreateAuthUser] НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ userId!`);
    throw new Error('Failed to get or create user');
  }

  if (!userUuid) {
    userUuid = userId;
  }

  // ==========================================
  // 6. ГЕНЕРИРУЕМ JWT ЧЕРЕЗ SIGN-IN
  // ==========================================

  console.log(`🔍 [getOrCreateAuthUser] Генерируем JWT для userId: ${userId}`);
  let jwtToken: string | null = null;

  if (!userPassword) {
    console.log(`🔍 [getOrCreateAuthUser] Пароль не найден в памяти, пробуем получить из БД...`);
    const dbPassword = await getUserPassword(telegramId, config);
    if (dbPassword) {
      userPassword = dbPassword;
      console.log(`✅ [getOrCreateAuthUser] Пароль получен из БД`);
    }
  }

  if (!userPassword) {
    console.log(`🔍 [getOrCreateAuthUser] Генерируем новый пароль...`);
    userPassword = crypto.randomUUID();

    await supabaseFetch(
      `users?telegram_id=eq.${telegramId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          password_hash: userPassword,
          updated_at: new Date().toISOString()
        })
      },
      config
    );

    try {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: userPassword
        })
      });
      console.log(`✅ [getOrCreateAuthUser] Пароль обновлен в auth.users`);
    } catch (err) {
      console.warn(`⚠️ [getOrCreateAuthUser] Не удалось обновить пароль в auth.users:`, (err as Error).message);
    }
  }

  try {
    console.log(`🔍 [getOrCreateAuthUser] Пробуем sign-in...`);

    const signInResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        password: userPassword
      })
    });

    if (signInResponse.ok) {
      const signInData = await signInResponse.json();
      jwtToken = signInData.access_token;
      console.log(`✅ [getOrCreateAuthUser] JWT получен через sign-in`);
    } else {
      const errorText = await signInResponse.text();
      console.warn(`⚠️ [getOrCreateAuthUser] sign-in вернул ${signInResponse.status}: ${errorText.substring(0, 100)}`);

      try {
        const sessionResponse = await fetch(`${supabaseUrl}/auth/v1/admin/sessions`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: userId,
            expires_in: 3600
          })
        });

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          jwtToken = sessionData.access_token;
          console.log(`✅ [getOrCreateAuthUser] JWT получен через admin/sessions (fallback)`);
        }
      } catch (fallbackErr) {
        console.warn(`⚠️ [getOrCreateAuthUser] fallback ошибка:`, (fallbackErr as Error).message);
      }
    }
  } catch (err) {
    console.warn(`⚠️ [getOrCreateAuthUser] sign-in ошибка:`, (err as Error).message);
  }

  if (!jwtToken) {
    console.error(`❌ [getOrCreateAuthUser] НЕ УДАЛОСЬ ПОЛУЧИТЬ JWT!`);
    throw new Error('Failed to generate JWT token');
  }

  // Получаем текущий sync_token
  const currentSyncToken = await getSyncToken(telegramId, config);

  console.log(`✅ [getOrCreateAuthUser] Успешно завершено! userId: ${userId}, userUuid: ${userUuid}, isNew: ${isNew}`);
  console.log(`🔑 JWT: ${jwtToken.substring(0, 30)}...`);
  console.log(`🔄 sync_token: ${currentSyncToken?.substring(0, 8) || 'null'}...`);

  return {
    userId: userId,
    userUuid: userUuid,
    telegramId: telegramId,
    jwtToken: jwtToken,
    syncToken: currentSyncToken,
    isNew: isNew
  };
}
