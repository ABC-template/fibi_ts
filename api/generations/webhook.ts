// ============================================
// api/generations/webhook.ts
// Вебхук OpenRouter о завершении видео-задания
// (video.generation.completed | failed | cancelled | expired).
// Содержимому вебхука мы не доверяем: оно лишь сигнал «проверь задание». Состояние
// и результат берутся запросом к OpenRouter нашим ключом, поэтому подделка
// запроса ничего не даёт. Если задан OPENROUTER_WEBHOOK_SECRET, подпись
// (X-OpenRouter-Signature: t=<время>,v1=<hex HMAC-SHA256 от "<t>,<тело>">)
// проверяется дополнительно, чтобы не принимать посторонние запросы.
// Версия: 1.0.0
// ============================================

import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { finalizeVideoJob } from '../_lib/generation-store';

export const config = { runtime: 'edge' };

const MAX_SKEW_SEC = 5 * 60;

function ok(body: Record<string, any> = { ok: true }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(header: string | null, rawBody: string, secret: string): Promise<boolean> {
  if (!header) return false;

  let t = '';
  let v1 = '';
  for (const part of header.split(',')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 't') t = rest.join('=');
    if (k === 'v1') v1 = rest.join('=');
  }
  if (!t || !v1) return false;

  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  // Время может прийти в секундах или миллисекундах
  const tsSec = ts > 1e12 ? ts / 1000 : ts;
  if (Math.abs(Date.now() / 1000 - tsSec) > MAX_SKEW_SEC) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t},${rawBody}`));
  return safeEqual(toHex(sig), v1.toLowerCase());
}

export default async function handler(request: Request, ctx?: { waitUntil?: (p: Promise<unknown>) => void }): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const raw = await request.text();

    const secret = process.env.OPENROUTER_WEBHOOK_SECRET?.trim();
    if (secret) {
      const valid = await verifySignature(request.headers.get('x-openrouter-signature'), raw, secret);
      if (!valid) {
        return ok({ error: 'Invalid signature' }, 401);
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return ok({ error: 'Invalid JSON' }, 400);
    }

    const type = String(payload?.type || '');
    const jobId = String(payload?.data?.id || '');
    if (!type.startsWith('video.generation.') || !jobId || jobId.length > 200) {
      return ok({ ok: true, ignored: true });
    }

    const db = getSupabaseConfig('service');
    const rows = await supabaseFetch(
      `messages?metadata->>job_id=eq.${encodeURIComponent(jobId)}&metadata->>kind=eq.generation&select=id&limit=1`,
      { method: 'GET' },
      db
    );
    const messageId = Array.isArray(rows) && rows[0]?.id;
    if (!messageId) {
      // Чужое/удалённое задание: повторять доставку бессмысленно
      return ok({ ok: true, ignored: true });
    }

    // Скачивание и сохранение видео может занять время: отвечаем сразу, работаем в фоне.
    // Если фон оборвётся, довершит опрос статуса из приложения.
    const work = finalizeVideoJob(messageId, db).catch((err) => {
      console.error('Webhook finalize error:', (err as Error).message);
    });
    if (ctx?.waitUntil) {
      ctx.waitUntil(work);
    } else {
      await work;
    }

    return ok();
  } catch (err) {
    console.error('Generation webhook error:', err);
    return ok({ error: 'Internal error' }, 500);
  }
}
