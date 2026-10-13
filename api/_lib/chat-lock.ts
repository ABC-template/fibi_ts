// ============================================
// api/_lib/chat-lock.ts
// Замок чата: пока в чате идёт запрос (текстовый стрим или генерация),
// второй запрос в этот же чат отклоняется (HTTP 409). Действует для всех
// типов агентов. Замок живёт в таблице chat_locks (см. sql/chat_locks.sql),
// захват атомарный, у замка есть TTL — если функция упала и не сняла замок,
// он сам освободится.
// Версия: 2.2.0 — замок генерации фото 300 с (приложение ждёт ответ до 240 с; при 180 с
//                  замок истекал раньше и в чат проходил второй запрос)
//          2.1.0 — assertChatsNotBusy принимает текст ошибки (удаление сообщения)
//          2.0.0
//   - видео-генерация живёт дольше запроса: замок берётся на длинный срок, а токен
//     замка сохраняется в сообщении, чтобы снять его из вебхука/опроса статуса
//   - assertChatsNotBusy: удаление чата запрещено, пока в нём идёт запрос
// ============================================

import { supabaseFetch, supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { corsHeaders } from './cors';
import { UUID_RE } from './media';
import { HttpError } from './http-error';

export type ChatLockKind = 'text' | 'generation';

/** Сколько секунд замок считается живым, если его не сняли явно */
export const CHAT_LOCK_TTL: Record<ChatLockKind, number> = {
  text: 300,
  generation: 300,
};

/** Видео-задание живёт до 15 минут: замок держится дольше, чем сама функция */
export const VIDEO_LOCK_TTL_SEC = 20 * 60;

export const CHAT_BUSY_MESSAGE =
  'Предыдущий запрос в этом чате ещё выполняется. Дождитесь ответа.';

export interface IChatLock {
  /** Токен владельца: по нему замок снимается из другого запроса (видео) */
  token: string;
  /** Идемпотентно: повторный вызов ничего не делает. Ошибки снятия не бросает. */
  release(): Promise<void>;
}

/**
 * ok=true  → lock заполнен, его нужно снять;
 * ok=false → чат занят, lock = null, retryAfter — через сколько секунд повторить.
 * (Не discriminated union: в проекте strict выключен, и TS не сужает такие типы.)
 */
export interface IAcquireResult {
  ok: boolean;
  lock: IChatLock | null;
  retryAfter: number;
}

export function isValidChatId(chatId: unknown): chatId is string {
  return typeof chatId === 'string' && UUID_RE.test(chatId);
}

/**
 * Захватывает замок чата. Бросает исключение, если сам RPC не отработал
 * (например, не применён sql/chat_locks.sql): без замка запрос выполнять нельзя.
 */
export async function acquireChatLock(
  userId: number,
  chatId: string,
  kind: ChatLockKind,
  config: ISupabaseConfig,
  ttlSeconds: number = CHAT_LOCK_TTL[kind]
): Promise<IAcquireResult> {
  const res = await supabaseRPC(
    'acquire_chat_lock',
    {
      p_user_id: userId,
      p_chat_id: chatId,
      p_kind: kind,
      p_ttl_seconds: ttlSeconds,
    },
    config
  );

  if (!res || typeof res !== 'object') {
    throw new Error('acquire_chat_lock: unexpected response');
  }

  if (res.acquired !== true) {
    return { ok: false, lock: null, retryAfter: Number(res.retry_after) || 1 };
  }

  const token: string = res.token;
  let released = false;

  return {
    ok: true,
    retryAfter: 0,
    lock: {
      token,
      async release() {
        if (released) return;
        released = true;
        try {
          await supabaseRPC(
            'release_chat_lock',
            { p_user_id: userId, p_chat_id: chatId, p_token: token },
            config
          );
        } catch (err) {
          // Не критично: замок всё равно истечёт по TTL
          console.error('release_chat_lock failed:', (err as Error).message);
        }
      },
    },
  };
}

/** Снять замок по токену из другого запроса (вебхук, опрос статуса). Ошибки не бросает. */
export async function releaseChatLockByToken(
  userId: number,
  chatId: string,
  token: unknown,
  config: ISupabaseConfig
): Promise<void> {
  if (typeof token !== 'string' || !UUID_RE.test(token)) return;
  try {
    await supabaseRPC(
      'release_chat_lock',
      { p_user_id: userId, p_chat_id: chatId, p_token: token },
      config
    );
  } catch (err) {
    console.error('release_chat_lock failed:', (err as Error).message);
  }
}

/**
 * Бросает HttpError 409, если хотя бы в одном из чатов идёт запрос
 * (замок жив). Нужна, чтобы нельзя было удалить чат, пока генерация не закончилась.
 */
export async function assertChatsNotBusy(
  userId: number,
  chatIds: string[],
  config: ISupabaseConfig,
  message: string = CHAT_DELETE_BUSY_MESSAGE
): Promise<void> {
  const ids = chatIds.filter(isValidChatId);
  if (ids.length === 0) return;

  const rows = await supabaseFetch(
    `chat_locks?user_id=eq.${userId}&chat_id=in.(${ids.join(',')})` +
      `&locked_until=gt.${encodeURIComponent(new Date().toISOString())}&select=chat_id`,
    { method: 'GET' },
    config
  );
  if (Array.isArray(rows) && rows.length > 0) {
    throw new HttpError(409, message);
  }
}

export const CHAT_DELETE_BUSY_MESSAGE =
  'Чат нельзя удалить, пока в нём идёт генерация. Дождитесь ответа.';

export const MESSAGE_DELETE_BUSY_MESSAGE =
  'Сообщение нельзя удалить, пока в чате идёт ответ или генерация. Дождитесь окончания.';

/** Ответ 409 «в чате уже идёт запрос» (с заголовками для клиента) */
export function chatBusyResponse(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: CHAT_BUSY_MESSAGE, code: 'chat_busy' }), {
    status: 409,
    headers: {
      ...corsHeaders,
      'Retry-After': String(retryAfter),
      'X-Chat-Busy': '1',
    },
  });
}

/** Чистка давно просроченных замков (вызывается из cron) */
export async function purgeExpiredChatLocks(config: ISupabaseConfig): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await supabaseFetch(
    `chat_locks?locked_until=lt.${encodeURIComponent(cutoff)}`,
    { method: 'DELETE' },
    config
  );
}
