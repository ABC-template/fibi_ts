// ============================================
// api/_lib/auth.ts
// Описание: Единая аутентификация для всех Edge-функций
// Версия: 4.0.0 - TypeScript
// ============================================

import { getSupabaseConfig, supabaseFetch } from './supabase-client';

declare const process: {
  env: {
    BOT_TOKEN?: string;
    [key: string]: string | undefined;
  };
};

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
 * Валидация Telegram Init Data
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

    const user = await response.json();
    return user;
  } catch (err) {
    console.error('JWT validation error:', (err as Error).message);
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
    // 1. Пытаемся получить JWT из заголовка Authorization
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const user = await validateJWT(token);

      if (user) {
        const telegramId = user.user_metadata?.telegram_id ||
          parseInt(user.email?.split('@')[0], 10);

        return {
          user: user,
          userId: telegramId,
          authUserId: user.id,
          jwtToken: token,
          error: null
        };
      }
    }

    // 2. Fallback: Telegram initData
    const initData = request.headers.get('x-telegram-init-data');
    if (initData) {
      const botToken = process.env.BOT_TOKEN?.trim();
      if (botToken) {
        const tgUser = await validateTelegramInitData(initData, botToken);
        if (tgUser && tgUser.id) {
          // Ищем пользователя в public.users по telegram_id
          const config = getSupabaseConfig('service');
          const userRes = await supabaseFetch(
            `users?telegram_id=eq.${tgUser.id}&select=id`,
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
 * Проверить, является ли пользователь администратором
 */
export async function isAdmin(
  userId: number,
  config: any = null
): Promise<boolean> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const result = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=role`,
      { method: 'GET' },
      cfg
    );

    if (!result || !Array.isArray(result) || result.length === 0) {
      return false;
    }

    const user = result[0];
    return ['admin', 'creator'].includes(user.role);
  } catch (err) {
    console.error('Failed to check admin status:', (err as Error).message);
    return false;
  }
}

/**
 * Проверить, является ли пользователь создателем (владельцем)
 */
export function isCreator(userId: number, creatorId: number = 1541531808): boolean {
  return userId === creatorId;
}
