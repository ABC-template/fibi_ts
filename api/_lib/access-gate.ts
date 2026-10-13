// ============================================
// api/_lib/access-gate.ts
// Доступ к приложению: проверяется в authenticate() для КАЖДОГО запроса.
//   1. Блокировка (user_blocks) — 403 на всё API (раньше проверялась только
//      в чате, генерациях, голосе, играх и рекламе).
//   2. Подписка на канал — если в админке включено «Только для подписчиков»
//      (economy_settings.channel_gate_enabled): без подписки — 403.
// Админы из ADMIN_TELEGRAM_IDS / CREATOR_ID и роли admin/creator проходят всегда
// (для канала); блокировка на админов по Telegram ID не действует.
// Исключения: вход (auth/check) и кнопка «Я подписался» (auth/channel).
//
// Канал: результат проверки Telegram хранится в users (channel_member,
// channel_checked_at) и обновляется раз в час. Telegram не ответил — берётся
// последний известный результат; если проверки ещё не было — пропускаем.
// Бот должен быть администратором канала, иначе getChatMember не работает.
// Версия: 1.1.0 — fetchTelegramMembership / parseTelegramChat (проверка подписки
//                  на канал спонсора в заданиях)
//          1.0.0
// ============================================

import { supabaseFetch, supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { ACCESS_BLOCKED_MESSAGE, CHANNEL_REQUIRED_MESSAGE } from './access-messages';

declare const process: { env: Record<string, string | undefined> };

export type AccessDenyCode = 'blocked' | 'channel_required';

export interface IAccessDenied {
  code: AccessDenyCode;
  message: string;
}

export interface IAccessState {
  exists: boolean;
  role: string;
  blocked: boolean;
  blockReason: string | null;
  blockExpiresAt: string | null;
  gateEnabled: boolean;
  channelMember: boolean | null;
  channelCheckedAt: string | null;
}

/** Пути, где доступ не проверяется (вход и повторная проверка подписки) */
const EXEMPT_PATHS = new Set(['/api/auth/check', '/api/auth/channel']);

/** Состояние доступа кэшируется в памяти функции на это время */
const STATE_TTL_MS = 60_000;
/** Подписка на канал перепроверяется у Telegram не чаще */
export const CHANNEL_RECHECK_MS = 60 * 60 * 1000;
const TELEGRAM_TIMEOUT_MS = 3_000;

const stateCache = new Map<number, { at: number; state: IAccessState }>();

export function isAccessExemptPath(request: Request): boolean {
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    return EXEMPT_PATHS.has(path);
  } catch {
    return false;
  }
}

/** Сбросить кэш (после блокировки/разблокировки или проверки канала) */
export function forgetAccessState(userId: number): void {
  stateCache.delete(Number(userId));
}

export async function loadAccessState(
  userId: number,
  config: ISupabaseConfig,
  useCache: boolean = true
): Promise<IAccessState> {
  const hit = stateCache.get(userId);
  if (useCache && hit && Date.now() - hit.at < STATE_TTL_MS) return hit.state;

  const res = await supabaseRPC('get_access_state', { p_user_id: userId }, config);
  const state: IAccessState = {
    exists: res?.exists === true,
    role: String(res?.role || 'trial'),
    blocked: res?.blocked === true,
    blockReason: res?.block_reason ?? null,
    blockExpiresAt: res?.block_expires_at ?? null,
    gateEnabled: res?.gate_enabled === true,
    channelMember: typeof res?.channel_member === 'boolean' ? res.channel_member : null,
    channelCheckedAt: res?.channel_checked_at ?? null,
  };
  stateCache.set(userId, { at: Date.now(), state });
  if (stateCache.size > 5000) stateCache.clear();
  return state;
}

/** Ссылка на канал для кнопки «Подписаться»: CHANNEL_URL или @username из CHANNEL_ID */
export function getChannelUrl(): string | null {
  const url = process.env.CHANNEL_URL?.trim();
  if (url && /^https:\/\/t\.me\//i.test(url)) return url;
  const id = process.env.CHANNEL_ID?.trim();
  if (id && /^@[A-Za-z0-9_]{4,64}$/.test(id)) return `https://t.me/${id.slice(1)}`;
  return null;
}

/**
 * Подписан ли пользователь на канал/группу chatId (@username или -100…).
 * null — узнать не удалось (нет токена, сбой сети, бот не админ канала).
 */
export async function fetchTelegramMembership(chatId: string, userId: number): Promise<boolean | null> {
  const botToken = process.env.BOT_TOKEN?.trim();
  if (!chatId || !botToken) return null;

  try {
    const url =
      `https://api.telegram.org/bot${botToken}/getChatMember` +
      `?chat_id=${encodeURIComponent(chatId)}&user_id=${userId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS) });
    const data: any = await res.json().catch(() => null);
    if (!data?.ok) {
      console.warn('[access-gate] getChatMember not ok:', JSON.stringify(data).substring(0, 200));
      return null;
    }
    const status = data.result?.status;
    if (status === 'restricted') return data.result?.is_member === true;
    return ['member', 'administrator', 'creator', 'owner'].includes(status);
  } catch (err) {
    console.warn('[access-gate] getChatMember failed:', (err as Error).message);
    return null;
  }
}

/** Подписка на канал приложения (CHANNEL_ID) */
export async function fetchChannelMembership(userId: number): Promise<boolean | null> {
  const channelId = process.env.CHANNEL_ID?.trim();
  if (!channelId) return null;
  return fetchTelegramMembership(channelId, userId);
}

/**
 * Канал из ссылки/имени: '@name', 't.me/name', 'https://t.me/name', '-100…'.
 * null — проверить нельзя (приватная ссылка-приглашение, не Telegram и т.п.).
 */
export function parseTelegramChat(target: unknown): string | null {
  const s = typeof target === 'string' ? target.trim() : '';
  if (/^@[A-Za-z0-9_]{4,64}$/.test(s)) return s;
  if (/^-100\d{5,}$/.test(s)) return s;
  const m = /^(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{4,64})\/?$/i.exec(s);
  return m ? `@${m[1]}` : null;
}

/** Проверить у Telegram и запомнить результат. Возвращает итог (с учётом прошлого). */
export async function refreshChannelMembership(
  userId: number,
  config: ISupabaseConfig,
  previous: boolean | null
): Promise<boolean | null> {
  const fresh = await fetchChannelMembership(userId);
  if (fresh === null) return previous;

  try {
    await supabaseFetch(
      `users?telegram_id=eq.${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ channel_member: fresh, channel_checked_at: new Date().toISOString() }),
      },
      config
    );
  } catch (err) {
    console.warn('[access-gate] save channel_member failed:', (err as Error).message);
  }
  forgetAccessState(userId);
  return fresh;
}

function isPrivilegedRole(role: string): boolean {
  return role === 'admin' || role === 'creator';
}

/** Итог по состоянию: null — доступ есть */
export function accessDecision(state: IAccessState, channelMember: boolean | null): IAccessDenied | null {
  if (state.blocked) {
    return { code: 'blocked', message: ACCESS_BLOCKED_MESSAGE };
  }
  if (state.gateEnabled && !isPrivilegedRole(state.role) && channelMember === false) {
    return { code: 'channel_required', message: CHANNEL_REQUIRED_MESSAGE };
  }
  return null;
}

/**
 * Проверка доступа для обычного запроса. null — пропустить.
 * Сбой БД — пропускаем (без базы всё равно ничего не работает), с записью в лог.
 */
export async function checkAccessGate(
  userId: number,
  config: ISupabaseConfig,
  isAdminById: boolean
): Promise<IAccessDenied | null> {
  if (isAdminById) return null;

  let state: IAccessState;
  try {
    state = await loadAccessState(userId, config);
  } catch (err) {
    console.error('[access-gate] get_access_state failed:', (err as Error).message);
    return null;
  }

  let member = state.channelMember;
  if (state.gateEnabled && !state.blocked && !isPrivilegedRole(state.role)) {
    const checkedAt = state.channelCheckedAt ? new Date(state.channelCheckedAt).getTime() : 0;
    if (!checkedAt || Date.now() - checkedAt > CHANNEL_RECHECK_MS) {
      member = await refreshChannelMembership(userId, config, member);
    }
  }

  return accessDecision(state, member);
}
