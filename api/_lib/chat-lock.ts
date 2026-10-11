// ============================================
// api/_lib/chat-lock.ts
// Замок чата: пока в чате идёт запрос (текстовый стрим или генерация),
// второй запрос в этот же чат отклоняется (HTTP 409). Действует для всех
// типов агентов. Замок живёт в таблице chat_locks (см. sql/chat_locks.sql),
// захват атомарный, у замка есть TTL — если функция упала и не сняла замок,
// он сам освободится.
// Версия: 1.0.0
// ============================================

import { supabaseFetch, supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { corsHeaders } from './cors';
import { UUID_RE } from './media';

export type ChatLockKind = 'text' | 'generation';

/** Сколько секунд замок считается живым, если его не сняли явно */
export const CHAT_LOCK_TTL: Record<ChatLockKind, number> = {
  text: 300,
  generation: 180,
};

export const CHAT_BUSY_MESSAGE =
  'Предыдущий запрос в этом чате ещё выполняется. Дождитесь ответа.';

export interface IChatLock {
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
  config: ISupabaseConfig
): Promise<IAcquireResult> {
  const res = await supabaseRPC(
    'acquire_chat_lock',
    {
      p_user_id: userId,
      p_chat_id: chatId,
      p_kind: kind,
      p_ttl_seconds: CHAT_LOCK_TTL[kind],
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
