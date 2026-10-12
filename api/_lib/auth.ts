// ============================================
// api/_lib/auth.ts
// Описание: Единая аутентификация для всех Edge-функций
// Версия: 5.0.0 - Telegram ID для JWT берётся из public.users по id пользователя (sub токена),
//                 а не из user_metadata (его пользователь может изменить сам);
//                 initData старше 24 часов не принимается;
//                 ID создателя и админов — из переменных CREATOR_ID / ADMIN_TELEGRAM_IDS
//          4.2.0 - админ по Telegram ID (ADMIN_TELEGRAM_IDS), не зависит от роли
//          4.1.0 - getVerifiedStartParam (start_param из подписанного initData)
// ============================================

import { getSupabaseConfig, supabaseFetch } from './supabase-client';

declare const process: {
  env: {
    BOT_TOKEN?: string;
    CREATOR_ID?: string;
    ADMIN_TELEGRAM_IDS?: string;
    [key: string]: string | undefined;
  };
};

/** Сколько живёт initData от Telegram (секунды) */
const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ITelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface IAuthResult {
  user: ITelegramUser | null;
  userId: number | null;
  authUserId: string | null;
  jwtToken?: string;
  error: string | null;
  status?: number;
}

/**
 * Валидация Telegram Init Data: подпись и срок (auth_date)
 */
async function validateTelegramInitData(
  initData: string,
  botToken: string
): Promise<ITelegramUser | null> {
  if (!initData || !botToken) return null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;
    urlParams.delete('hash');

    const sortedKeys = [...urlParams.keys()].sort();
    const dataCheckString = sortedKeys
      .map(key => `${key}=${urlParams.get(key)}`)
      .join('\n');

    const encoder = new TextEncoder();

    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secretKeyBuffer = await crypto.subtle.sign(
      'HMAC',
      baseKey,
      encoder.encode(botToken)
    );

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const calculatedHashBuffer = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(dataCheckString)
    );

    const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) return null;

    // Подпись верна — проверяем срок: утёкший initData не должен работать вечно
    const authDate = Number(urlParams.get('auth_date'));
    if (!Number.isFinite(authDate) || authDate <= 0) return null;
    if (Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SEC) return null;

    const user = JSON.parse(urlParams.get('user') || '{}');
    return user.id ? user : null;
  } catch (e) {
    console.error('Telegram auth error:', (e as Error).message);
    return null;
  }
}

/**
 * Валидация JWT токена (с проверкой через Supabase)
 */
async function validateJWT(token: string): Promise<any> {
  if (!token) return null;

  try {
    const config = getSupabaseConfig('anon');
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': config.key
      }
    });

    if (!response.ok) {
      console.warn('JWT validation failed:', response.status);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('JWT validation error:', (err as Error).message);
    return null;
  }
}

/**
 * Telegram ID владельца аккаунта Supabase Auth.
 * Источник — public.users (id = id пользователя в auth.users). user_metadata
 * не используется: его пользователь меняет сам своим токеном.
 */
async function telegramIdByAuthUser(authUserId: string): Promise<number | null> {
  if (!UUID_RE.test(authUserId)) return null;
  try {
    const rows = await supabaseFetch(
      `users?id=eq.${authUserId}&select=telegram_id`,
      { method: 'GET' },
      getSupabaseConfig('service')
    );
    const id = Array.isArray(rows) && rows[0] ? Number(rows[0].telegram_id) : NaN;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch (err) {
    console.error('telegramIdByAuthUser error:', (err as Error).message);
    return null;
  }
}

/**
 * Аутентификация с приоритетом JWT
 */
export async function authenticate(
  request: Request,
  requireUser: boolean = true
): Promise<IAuthResult> {
  try {
    // 1. JWT из заголовка Authorization
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const user = await validateJWT(token);

      if (user?.id) {
        const telegramId = await telegramIdByAuthUser(String(user.id));
        if (telegramId) {
          return {
            user: user,
            userId: telegramId,
            authUserId: user.id,
            jwtToken: token,
            error: null
          };
        }
        // Токен валиден, но привязки к public.users нет — пробуем initData
      }
    }

    // 2. Fallback: Telegram initData
    const initData = request.headers.get('x-telegram-init-data');
    if (initData) {
      const botToken = process.env.BOT_TOKEN?.trim();
      if (botToken) {
        const tgUser = await validateTelegramInitData(initData, botToken);
        if (tgUser && tgUser.id) {
          const config = getSupabaseConfig('service');
          const userRes = await supabaseFetch(
            `users?telegram_id=eq.${Number(tgUser.id)}&select=id`,
            { method: 'GET' },
            config
          );

          let authUserId: string | null = null;
          if (userRes && Array.isArray(userRes) && userRes.length > 0 && userRes[0].id) {
            authUserId = userRes[0].id;
          }

          return {
            user: tgUser,
            userId: parseInt(String(tgUser.id), 10),
            authUserId: authUserId,
            error: null
          };
        }
      }
    }

    if (requireUser) {
      return {
        user: null,
        userId: null,
        authUserId: null,
        error: 'Unauthorized',
        status: 401
      };
    }

    return { user: null, userId: null, authUserId: null, error: null };
  } catch (err) {
    console.error('Authentication error:', (err as Error).message);
    return {
      user: null,
      userId: null,
      authUserId: null,
      error: (err as Error).message,
      status: 500
    };
  }
}

/**
 * start_param из подписанного initData (параметр startapp ссылки на Mini App).
 * Возвращается только если подпись верна и initData принадлежит expectedUserId.
 */
export async function getVerifiedStartParam(
  request: Request,
  expectedUserId: number
): Promise<string | null> {
  const initData = request.headers.get('x-telegram-init-data');
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!initData || !botToken) return null;

  const tgUser = await validateTelegramInitData(initData, botToken);
  if (!tgUser || Number(tgUser.id) !== Number(expectedUserId)) return null;

  const startParam = new URLSearchParams(initData).get('start_param');
  return startParam && startParam.length <= 512 ? startParam : null;
}

/** Telegram ID создателя из переменной CREATOR_ID (null, если не задана) */
export function getCreatorId(): number | null {
  const n = Number(process.env.CREATOR_ID?.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Telegram ID, которым открыта админ-панель. Доступ не зависит от роли:
 * владелец может переключать себе роль (trial/premium) для тестов и не терять админку.
 * Список — ADMIN_TELEGRAM_IDS (через запятую), если не задан — CREATOR_ID.
 */
export function getAdminTelegramIds(): number[] {
  const raw = process.env.ADMIN_TELEGRAM_IDS?.trim() || process.env.CREATOR_ID?.trim() || '';
  return raw
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isSafeInteger(x) && x > 0);
}

export function isAdminTelegramId(userId: number | null | undefined): boolean {
  return !!userId && getAdminTelegramIds().includes(Number(userId));
}

/**
 * Проверить, является ли пользователь администратором
 * (по Telegram ID из списка админов либо по роли admin/creator)
 */
export async function isAdmin(
  userId: number,
  config: any = null
): Promise<boolean> {
  if (isAdminTelegramId(userId)) return true;
  try {
    const cfg = config || getSupabaseConfig('service');
    const result = await supabaseFetch(
      `users?telegram_id=eq.${Number(userId)}&select=role`,
      { method: 'GET' },
      cfg
    );

    if (!result || !Array.isArray(result) || result.length === 0) {
      return false;
    }

    return ['admin', 'creator'].includes(result[0].role);
  } catch (err) {
    console.error('Failed to check admin status:', (err as Error).message);
    return false;
  }
}

/**
 * Проверить, является ли пользователь создателем (владельцем)
 */
export function isCreator(userId: number | null | undefined): boolean {
  const creatorId = getCreatorId();
  return !!creatorId && Number(userId) === creatorId;
}
