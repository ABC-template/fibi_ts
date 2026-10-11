// ============================================
// api/_lib/openrouter-media.ts
// Клиент отдельных медиа-API OpenRouter:
//   видео  — POST /videos (асинхронное задание), GET /videos/{id}, скачивание;
//   фото   — POST /images (синхронно, b64_json).
// Плюс перевод параметров формы в поля API и расчёт цены/энергии.
// Версия: 1.0.0
// ============================================

import type { ISupabaseConfig } from './supabase-client';
import { signUrls, MEDIA_LIMITS } from './media';
import { HttpError } from './http-error';

export const OPENROUTER = 'https://openrouter.ai/api/v1';

/** Ключи OpenRouter из окружения (ROUTER_KEY0..9) с их номерами */
export function routerKeys(): Array<{ index: number; key: string }> {
  const out: Array<{ index: number; key: string }> = [];
  for (let i = 0; i < 10; i++) {
    const key = process.env[`ROUTER_KEY${i}`];
    if (key) out.push({ index: i, key });
  }
  return out;
}

export function routerKeyByIndex(index: unknown): string | null {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i > 9) return null;
  return process.env[`ROUTER_KEY${i}`] || null;
}

function headers(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.APP_URL?.trim() || 'https://vercel.com',
    'X-Title': 'FIBI Generation',
  };
}

/** Корень приложения для callback_url (без завершающего /) */
export function appBaseUrl(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  const url = raw.replace(/\/+$/, '');
  return url.startsWith('https://') ? url : null;
}

// ============================================
// Параметры
// ============================================

export interface IModeInputs {
  /** Подписанные ссылки на референсы в порядке, который прислал клиент */
  urls: string[];
}

const IMAGE_API_PARAMS = [
  'resolution',
  'aspect_ratio',
  'quality',
  'background',
  'output_format',
  'output_compression',
  'seed',
  'size',
];

const VIDEO_API_PARAMS = ['resolution', 'aspect_ratio', 'size', 'seed', 'generate_audio'];

/** Промпт + негативный промпт (в API OpenRouter отдельного поля нет) */
export function composePrompt(prompt: string, negative: string | null): string {
  return negative ? `${prompt}\n\nAvoid: ${negative}` : prompt;
}

/** Подписанные ссылки на референсы (короткоживущие, для модели) */
export async function signReferenceUrls(
  paths: string[],
  config: ISupabaseConfig
): Promise<string[]> {
  if (paths.length === 0) return [];
  const map = await signUrls(paths, MEDIA_LIMITS.modelSignTtlSec, config);
  return paths.map((p) => {
    if (!map[p]) throw new HttpError(500, 'Не удалось подготовить ссылку на референс');
    return map[p];
  });
}

const imageRef = (url: string) => ({ type: 'image_url', image_url: { url } });

// ============================================
// Фото: POST /images
// ============================================

export interface IImageResult {
  items: Array<{ bytes: Uint8Array; mime: string }>;
  costUsd: number | null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Генерация изображений. Перебирает ключи: ошибка одного не мешает остальным.
 * Бросает Error с понятным текстом, если ни один ключ не сработал.
 */
export async function generateImages(opts: {
  model: string;
  prompt: string;
  negative: string | null;
  params: Record<string, any>;
  referenceUrls: string[];
}): Promise<IImageResult> {
  const keys = routerKeys();
  if (keys.length === 0) throw new Error('Server keys not configured');

  const body: Record<string, any> = {
    model: opts.model,
    prompt: composePrompt(opts.prompt, opts.negative),
  };
  for (const k of IMAGE_API_PARAMS) {
    if (opts.params[k] !== undefined) body[k] = opts.params[k];
  }
  if (opts.params.n !== undefined) body.n = Number(opts.params.n);
  if (opts.referenceUrls.length > 0) body.input_references = opts.referenceUrls.map(imageRef);

  let lastError = 'Image generation failed';

  for (const { key } of keys) {
    try {
      const res = await fetch(`${OPENROUTER}/images`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text();
        lastError = `OpenRouter ${res.status}: ${txt.substring(0, 200)}`;
        // Ошибка запроса (4xx, кроме лимитов/авторизации) от смены ключа не изменится
        if (res.status === 400 || res.status === 422) break;
        continue;
      }

      const data = await res.json();
      const items: IImageResult['items'] = [];
      for (const d of Array.isArray(data?.data) ? data.data : []) {
        if (typeof d?.b64_json === 'string' && d.b64_json) {
          items.push({
            bytes: base64ToBytes(d.b64_json),
            mime: String(d.media_type || 'image/png').toLowerCase(),
          });
        }
      }
      if (items.length === 0) {
        lastError = 'No images in model response';
        continue;
      }

      const cost = Number(data?.usage?.cost);
      return { items, costUsd: Number.isFinite(cost) ? cost : null };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  throw new Error(lastError);
}

// ============================================
// Видео: POST /videos, GET /videos/{id}
// ============================================

export interface IVideoJob {
  id: string;
  status: string;
  urls: string[];
  costUsd: number | null;
  isByok: boolean;
  error: string | null;
}

function parseJob(data: any): IVideoJob {
  const cost = Number(data?.usage?.cost);
  return {
    id: String(data?.id || ''),
    status: String(data?.status || 'pending'),
    urls: Array.isArray(data?.unsigned_urls) ? data.unsigned_urls.map((u: any) => String(u)) : [],
    costUsd: Number.isFinite(cost) ? cost : null,
    isByok: data?.usage?.is_byok === true,
    error: data?.error ? String(typeof data.error === 'string' ? data.error : data.error?.message || JSON.stringify(data.error)) : null,
  };
}

/**
 * Отправляет задание на видео. Возвращает job и индекс ключа, которым оно создано
 * (опрашивать задание нужно тем же ключом).
 */
export async function submitVideoJob(opts: {
  model: string;
  prompt: string;
  negative: string | null;
  params: Record<string, any>;
  /** none | references | first_frame | first_last_frames */
  input: string;
  referenceUrls: string[];
  callbackUrl: string | null;
}): Promise<{ job: IVideoJob; keyIndex: number }> {
  const keys = routerKeys();
  if (keys.length === 0) throw new Error('Server keys not configured');

  const body: Record<string, any> = {
    model: opts.model,
    prompt: composePrompt(opts.prompt, opts.negative),
  };
  for (const k of VIDEO_API_PARAMS) {
    if (opts.params[k] !== undefined) body[k] = opts.params[k];
  }
  if (opts.params.duration !== undefined) body.duration = Number(opts.params.duration);
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;

  const urls = opts.referenceUrls;
  if (opts.input === 'first_frame' && urls.length >= 1) {
    body.frame_images = [{ ...imageRef(urls[0]), frame_type: 'first_frame' }];
  } else if (opts.input === 'first_last_frames' && urls.length >= 1) {
    body.frame_images = [
      { ...imageRef(urls[0]), frame_type: 'first_frame' },
      ...(urls[1] ? [{ ...imageRef(urls[1]), frame_type: 'last_frame' }] : []),
    ];
  } else if (opts.input === 'references' && urls.length >= 1) {
    body.input_references = urls.map(imageRef);
  }

  let lastError = 'Video submit failed';

  for (const { index, key } of keys) {
    try {
      const res = await fetch(`${OPENROUTER}/videos`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text();
        lastError = `OpenRouter ${res.status}: ${txt.substring(0, 200)}`;
        if (res.status === 400 || res.status === 422) break;
        continue;
      }

      const job = parseJob(await res.json());
      if (!job.id) {
        lastError = 'OpenRouter did not return a job id';
        continue;
      }
      return { job, keyIndex: index };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  throw new Error(lastError);
}

/** Состояние задания. Бросает Error при сетевой/серверной ошибке (повторить позже). */
export async function getVideoJob(jobId: string, keyIndex: unknown): Promise<IVideoJob> {
  const key = routerKeyByIndex(keyIndex) || routerKeys()[0]?.key;
  if (!key) throw new Error('Server keys not configured');

  const res = await fetch(`${OPENROUTER}/videos/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: headers(key),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.substring(0, 200)}`);
  }
  const job = parseJob(await res.json());
  if (!job.id) job.id = jobId;
  return job;
}

/** Скачивает готовое видео (ссылки не подписаны — нужен тот же ключ) */
export async function downloadVideo(
  job: IVideoJob,
  jobId: string,
  keyIndex: unknown
): Promise<{ bytes: Uint8Array; mime: string }> {
  const key = routerKeyByIndex(keyIndex) || routerKeys()[0]?.key;
  if (!key) throw new Error('Server keys not configured');

  const url = job.urls[0] || `${OPENROUTER}/videos/${encodeURIComponent(jobId)}/content?index=0`;
  if (!url.startsWith('https://')) throw new Error('Unsupported video URL');

  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Video download failed: ${res.status}`);

  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MEDIA_LIMITS.outputMaxBytes) throw new Error('Video is too large');

  const bytes = new Uint8Array(await res.arrayBuffer());
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return { bytes, mime: mime.startsWith('video/') ? mime : 'video/mp4' };
}

// ============================================
// Цена и энергия
// ============================================

export interface IPricing {
  kind: 'per_second' | 'per_image';
  prices?: Record<string, number>;
  usd?: number;
  energy_per_usd: number;
}

export function readPricing(gen: any): IPricing | null {
  const p = gen?.pricing;
  if (!p || (p.kind !== 'per_second' && p.kind !== 'per_image')) return null;
  const rate = Number(p.energy_per_usd);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return p as IPricing;
}

/** Оценка стоимости запроса в долларах по прайсу из generation_config */
export function estimateUsd(pricing: IPricing | null, params: Record<string, any>): number | null {
  if (!pricing) return null;

  if (pricing.kind === 'per_image') {
    const usd = Number(pricing.usd);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    const n = Math.max(1, Number(params.n) || 1);
    return usd * n;
  }

  const duration = Number(params.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const prices = pricing.prices || {};
  const perSec = Number(prices[String(params.resolution)] ?? prices.default);
  if (!Number.isFinite(perSec) || perSec <= 0) return null;
  return perSec * duration;
}

/**
 * Энергия за запрос: $ × энергия за $ × коэффициент, не меньше min_charge.
 * Без цены (старые агенты) — минимальное списание с коэффициентом.
 */
export function energyForUsd(
  usd: number | null,
  pricing: IPricing | null,
  agent: any,
  markup: number
): number {
  const min = Number(agent?.min_charge) || 1;
  if (usd === null || !pricing) {
    return Math.max(Math.ceil(min * markup), min);
  }
  const raw = Math.ceil(usd * pricing.energy_per_usd * markup);
  return Math.max(raw, Math.ceil(min * markup), min);
}
