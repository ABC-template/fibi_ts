// ============================================
// api/_lib/openrouter-media.ts
// Клиент отдельных медиа-API OpenRouter:
//   видео  — POST /videos (асинхронное задание), GET /videos/{id}, скачивание;
//   фото   — POST /images (синхронно, b64_json);
//   аудио  — POST /audio/speech (озвучка, готовый файл) и POST /chat/completions
//            с modalities ['text','audio'] (музыка и аудио-ответы, поток base64).
// Плюс перевод параметров формы в поля API и оценка цены в $.
// Версия: 1.2.0 — аудио: generateSpeech / generateChatAudio, определение формата по
//                  содержимому (mp3 / wav / ogg / flac), сырой pcm16 → WAV; цена озвучки
//                  за символ (per_char) и музыки за запрос (per_request); фактическая цена
//                  озвучки — по X-Generation-Id из GET /generation
//          1.1.0 — энергия считается в energy-pricing.ts по общему курсу из настроек
//                  (energy_per_usd в прайсе агента больше не используется; удалён energyForUsd)
//          1.0.0
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
// Аудио: POST /audio/speech и POST /chat/completions (modalities audio)
// ============================================

export interface IAudioResult {
  item: { bytes: Uint8Array; mime: string };
  costUsd: number | null;
}

export interface IAudioOutput {
  /** Что просим у модели */
  format: string;
  /** Для сырого pcm16: частота и каналы WAV-заголовка */
  sampleRate: number;
  channels: number;
}

const SPEECH_API_PARAMS = ['voice', 'speed', 'instructions'];

/** Формат по первым байтам файла (null — не похоже ни на один контейнер) */
function sniffAudioMime(bytes: Uint8Array): string | null {
  const ascii = (from: number, len: number) =>
    String.fromCharCode(...Array.from(bytes.subarray(from, from + len)));
  if (bytes.length < 12) return null;
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 4) === 'fLaC') return 'audio/flac';
  return null;
}

/** Сырой PCM 16 бит → WAV (заголовок 44 байта) */
function pcm16ToWav(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) out[at + i] = value.charCodeAt(i);
  };
  const blockAlign = channels * 2;
  text(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Байты ответа модели → файл: известный контейнер как есть, pcm16 — в WAV */
function toAudioFile(bytes: Uint8Array, output: IAudioOutput): { bytes: Uint8Array; mime: string } {
  if (bytes.length === 0) throw new Error('Модель вернула пустой звук');
  if (bytes.length > MEDIA_LIMITS.outputMaxBytes) throw new Error('Аудио слишком большое');
  const mime = sniffAudioMime(bytes);
  // Сырой PCM может случайно начинаться как кадр mp3 (0xFF 0xE…): при pcm16 верим только WAV-заголовку
  if (output.format === 'pcm16' || output.format === 'pcm') {
    if (mime === 'audio/wav') return { bytes, mime };
    return { bytes: pcm16ToWav(bytes, output.sampleRate, output.channels), mime: 'audio/wav' };
  }
  if (mime) return { bytes, mime };
  throw new Error(`Неизвестный формат аудио от модели (ожидался ${output.format})`);
}

/** Фактическая цена запроса по его id (GET /generation); статистика появляется с задержкой */
async function generationCost(id: string | null, key: string): Promise<number | null> {
  if (!id) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`${OPENROUTER}/generation?id=${encodeURIComponent(id)}`, { headers: headers(key) });
      if (res.ok) {
        const cost = Number((await res.json())?.data?.total_cost);
        if (Number.isFinite(cost) && cost > 0) return cost;
      }
    } catch {
      // повторим
    }
  }
  return null;
}

/** Озвучка текста: POST /audio/speech, в ответ — файл (mp3) */
export async function generateSpeech(opts: {
  model: string;
  text: string;
  params: Record<string, any>;
}): Promise<IAudioResult> {
  const keys = routerKeys();
  if (keys.length === 0) throw new Error('Server keys not configured');

  const body: Record<string, any> = { model: opts.model, input: opts.text, response_format: 'mp3' };
  for (const k of SPEECH_API_PARAMS) {
    if (opts.params[k] !== undefined && opts.params[k] !== '') body[k] = opts.params[k];
  }
  if (body.speed !== undefined) body.speed = Number(body.speed);

  let lastError = 'Speech generation failed';
  for (const { key } of keys) {
    // Другой ключ пробуем только если запрос не принят; принятый (и оплаченный) не повторяем
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER}/audio/speech`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastError = (e as Error).message;
      continue;
    }
    if (!res.ok) {
      const txt = await res.text();
      lastError = `OpenRouter ${res.status}: ${txt.substring(0, 200)}`;
      if (res.status === 400 || res.status === 422) break;
      continue;
    }

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MEDIA_LIMITS.outputMaxBytes) throw new Error('Аудио слишком большое');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const item = toAudioFile(bytes, { format: 'mp3', sampleRate: 24000, channels: 1 });
    const costUsd = await generationCost(res.headers.get('x-generation-id'), key);
    return { item, costUsd };
  }
  throw new Error(lastError);
}

/** Декодер base64 по кускам: куски потока не выровнены по 4 символа */
class Base64Collector {
  private tail = '';
  private parts: Uint8Array[] = [];
  private size = 0;

  push(chunk: string): void {
    const text = this.tail + chunk.replace(/\s+/g, '');
    const cut = text.length - (text.length % 4);
    this.tail = text.slice(cut);
    if (cut === 0) return;
    const part = base64ToBytes(text.slice(0, cut));
    this.size += part.length;
    if (this.size > MEDIA_LIMITS.outputMaxBytes) throw new Error('Аудио слишком большое');
    this.parts.push(part);
  }

  bytes(): Uint8Array {
    if (this.tail) {
      const part = base64ToBytes(this.tail.padEnd(Math.ceil(this.tail.length / 4) * 4, '='));
      this.parts.push(part);
      this.size += part.length;
      this.tail = '';
    }
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

/**
 * Музыка и аудио-ответы: POST /chat/completions с modalities ['text','audio'] и stream
 * (звук приходит только потоком: choices[0].delta.audio.data — куски base64)
 */
export async function generateChatAudio(opts: {
  model: string;
  prompt: string;
  systemPrompt: string | null;
  params: Record<string, any>;
  output: IAudioOutput;
}): Promise<IAudioResult> {
  const keys = routerKeys();
  if (keys.length === 0) throw new Error('Server keys not configured');

  const audio: Record<string, any> = { format: opts.output.format };
  if (opts.params.voice) audio.voice = String(opts.params.voice);
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  messages.push({ role: 'user', content: opts.prompt });

  const body = { model: opts.model, messages, modalities: ['text', 'audio'], audio, stream: true };

  let lastError = 'Audio generation failed';
  for (const { key } of keys) {
    // Другой ключ пробуем только если запрос не принят; начатую генерацию не повторяем
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastError = (e as Error).message;
      continue;
    }
    if (!res.ok || !res.body) {
      const txt = await res.text();
      lastError = `OpenRouter ${res.status}: ${txt.substring(0, 200)}`;
      if (res.status === 400 || res.status === 422) break;
      continue;
    }
    return readAudioStream(res.body, opts.output);
  }
  throw new Error(lastError);
}

/** Поток SSE чата: склеивает куски звука (delta.audio.data), берёт usage.cost */
async function readAudioStream(stream: ReadableStream<Uint8Array>, output: IAudioOutput): Promise<IAudioResult> {
  const collector = new Base64Collector();
  let costUsd: number | null = null;
  let streamError: string | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (json?.error) {
      streamError = String(json.error?.message || json.error);
      return;
    }
    const delta = json?.choices?.[0]?.delta;
    const piece = typeof delta?.audio === 'string' ? delta.audio : delta?.audio?.data;
    if (typeof piece === 'string' && piece) collector.push(piece);
    const cost = Number(json?.usage?.cost);
    if (Number.isFinite(cost) && cost > 0) costUsd = cost;
  };

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      handleLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
    }
  }
  if (buffer) handleLine(buffer);

  if (streamError) throw new Error(streamError);
  return { item: toAudioFile(collector.bytes(), output), costUsd };
}

// ============================================
// Цена и энергия
// ============================================

export interface IPricing {
  kind: 'per_second' | 'per_image' | 'per_char' | 'per_request';
  prices?: Record<string, number>;
  /** Цена за секунду со звуком (если у модели она другая) */
  audio_prices?: Record<string, number>;
  usd?: number;
}

export function readPricing(gen: any): IPricing | null {
  const p = gen?.pricing;
  if (!p || !['per_second', 'per_image', 'per_char', 'per_request'].includes(p.kind)) return null;
  return p as IPricing;
}

/** Цена секунды: учитывает звук. Если звук не задан, а у модели есть цена со звуком — берём бóльшую (оценка с запасом). */
function perSecondUsd(p: any, params: Record<string, any>): number {
  const res = String(params.resolution);
  const base = Number(p.prices?.[res] ?? p.prices?.default);
  const audioTable = p.audio_prices && Object.keys(p.audio_prices).length > 0 ? p.audio_prices : null;
  const withSound = audioTable ? Number(audioTable[res] ?? audioTable.default) : NaN;

  const flag = params.generate_audio;
  if (flag === true || flag === 'true') return Number.isFinite(withSound) ? withSound : base;
  if (flag === false || flag === 'false') return base;
  const options = [base, withSound].filter((x) => Number.isFinite(x));
  return options.length ? Math.max(...options) : NaN;
}

/** Оценка стоимости запроса в долларах по прайсу из generation_config (prompt — для цены за символ) */
export function estimateUsd(pricing: IPricing | null, params: Record<string, any>, prompt = ''): number | null {
  if (!pricing) return null;

  if (pricing.kind === 'per_char' || pricing.kind === 'per_request') {
    const usd = Number(pricing.usd);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return pricing.kind === 'per_char' ? usd * Math.max(1, prompt.length) : usd;
  }

  if (pricing.kind === 'per_image') {
    const usd = Number(pricing.usd);
    if (!Number.isFinite(usd) || usd <= 0) return null;
    const n = Math.max(1, Number(params.n) || 1);
    return usd * n;
  }

  const duration = Number(params.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const perSec = perSecondUsd(pricing, params);
  if (!Number.isFinite(perSec) || perSec <= 0) return null;
  return perSec * duration;
}
