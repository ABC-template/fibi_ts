// ============================================
// api/_lib/jwt.ts
// Токен для Supabase Realtime. Подписывается нашим ключом (standby-ключ HS256
// в Supabase → JWT Keys), без обращения к Supabase Auth.
// Переменные: SUPABASE_JWT_SECRET (секрет ключа как строка), SUPABASE_JWT_KID (ID ключа).
// API этот токен не принимает — только Realtime (политики chats/messages по auth.uid()).
// Версия: 1.0.0
// ============================================

declare const process: {
  env: {
    SUPABASE_JWT_SECRET?: string;
    SUPABASE_JWT_KID?: string;
    SUPABASE_URL?: string;
    [key: string]: string | undefined;
  };
};

/** Срок жизни токена Realtime (секунды). Клиент обновляет его заранее */
export const REALTIME_TOKEN_TTL_SEC = 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(value: unknown): string {
  return b64url(enc.encode(JSON.stringify(value)));
}

/**
 * Подписать токен Realtime.
 * sub = public.users.id (с ним сравнивают политики chats/messages через auth.uid()).
 */
export async function signRealtimeToken(
  userUuid: string,
  telegramId: number,
  ttlSec: number = REALTIME_TOKEN_TTL_SEC
): Promise<{ token: string; expiresAt: number }> {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured');

  const kid = process.env.SUPABASE_JWT_KID?.trim();
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');

  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSec;

  const header: Record<string, string> = { alg: 'HS256', typ: 'JWT' };
  if (kid) header.kid = kid;

  const payload = {
    iss: baseUrl ? `${baseUrl}/auth/v1` : 'supabase',
    sub: userUuid,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp,
    is_anonymous: false,
    app_metadata: { provider: 'telegram', telegram_id: telegramId },
    user_metadata: {},
  };

  const data = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));

  return { token: `${data}.${b64url(signature)}`, expiresAt: exp };
}
