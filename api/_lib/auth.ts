// ============================================
// api/_lib/auth.ts
// Описание: Единая аутентификация для всех Edge-функций
// Версия: 7.0.0 - проверка доступа (access-gate) в каждом запросе: блокировка
//                 пользователя и, если включено, подписка на канал → 403;
//                 isAdmin — только по Telegram ID (роль admin больше не даёт
//                 правку агентов: её может выдать себе тестовый аккаунт)
//          6.0.0 - только Telegram initData: JWT Supabase Auth больше не принимается
//                 (вход по паролю убран, Realtime получает отдельный токен — api/_lib/jwt.ts);
//                 authUserId убран из результата (никем не использовался, лишний запрос к БД)
//          5.0.0 - Telegram ID для JWT берётся из public.users по id пользователя (sub токена),
//                 а не из user_metadata (его пользователь может изменить сам);
//                 initData старше 24 часов не принимается;
//                 ID создателя и админов — из переменных CREATOR_ID / ADMIN_TELEGRAM_IDS
//          4.2.0 - админ по Telegram ID (ADMIN_TELEGRAM_IDS), не зависит от роли
//          4.1.0 - getVerifiedStartParam (start_param из подписанного initData)
// ============================================

import { getSupabaseConfig } from './supabase-client';
import { checkAccessGate, isAccessExemptPath } from './access-gate';

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
  /** Telegram ID пользователя */
  userId: number | null;
  error: string | null;
  status?: number;
  /** Отказ в доступе: blocked | channel_required */
  code?: string;
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
 * Аутентификация запроса по Telegram initData (заголовок x-telegram-init-data).
 * Другого способа нет: токен Realtime API не принимает.
 */
export async function authenticate(
  request: Request,
  requireUser: boolean = true
): Promise<IAuthResult> {
  try {
    const initData = request.headers.get('x-telegram-init-data');
    const botToken = process.env.BOT_TOKEN?.trim();

    if (initData && botToken) {
      const tgUser = await validateTelegramInitData(initData, botToken);
      if (tgUser) {
        const userId = Number(tgUser.id);
        if (Number.isSafeInteger(userId) && userId > 0) {
          // Доступ: блокировка и (если включено) подписка на канал
          if (!isAccessExemptPath(request)) {
            const denied = await checkAccessGate(
              userId,
              getSupabaseConfig('service'),
              isAdminTelegramId(userId)
            );
            if (denied) {
              return { user: tgUser, userId: null, error: denied.message, status: 403, code: denied.code };
            }
          }
          return { user: tgUser, userId, error: null };
        }
      }
    }

    if (requireUser) {
      return { user: null, userId: null, error: 'Unauthorized', status: 401 };
    }
    return { user: null, userId: null, error: null };
  } catch (err) {
    console.error('Authentication error:', (err as Error).message);
    return { user: null, userId: null, error: (err as Error).message, status: 500 };
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
 * Админ-права (админка, правка агентов) — только по Telegram ID из
 * ADMIN_TELEGRAM_IDS / CREATOR_ID. Роль admin в БД даёт лишь безлимит энергии
 * и доступ ко всем агентам, но не управление приложением.
 */
export async function isAdmin(
  userId: number,
  _config: any = null
): Promise<boolean> {
  return isAdminTelegramId(userId);
}

/**
 * Проверить, является ли пользователь создателем (владельцем)
 */
export function isCreator(userId: number | null | undefined): boolean {
  const creatorId = getCreatorId();
  return !!creatorId && Number(userId) === creatorId;
}
