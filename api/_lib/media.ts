// ============================================
// api/_lib/media.ts
// Медиа генераций: приватный бакет Supabase Storage + таблица media_files.
// В БД (messages.metadata) хранится только storage_path — подписанные
// ссылки генерируются на лету и нигде не сохраняются.
// Версия: 2.0.0 — референсы в отдельном бакете generation-inputs (лимит 10 МБ и только
//                  изображения на уровне Storage): путь вида in/<user>/<uuid>.<ext>, бакет
//                  определяется по пути; результаты — по-прежнему generation-media.
//                  media_files.confirmed_at: референс подтверждён /media/confirm; до этого
//                  он занимает в квоте inputMaxBytes (столько Storage максимум примет);
//                  signUrls / removeObjects работают с путями из обоих бакетов
//          1.1.0 — очистка удаляет файлы, на которые не ссылается ни одно сообщение
//          1.0.0
// ============================================

import { supabaseFetch, supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { HttpError } from './http-error';

/** Результаты генераций */
export const MEDIA_BUCKET = 'generation-media';
/** Референсы пользователя (file_size_limit = MEDIA_LIMITS.inputMaxBytes, только изображения) */
export const INPUT_BUCKET = 'generation-inputs';
/** Префикс пути референса: по нему выбирается бакет */
const INPUT_PREFIX = 'in/';

export const MEDIA_LIMITS = {
  /** Максимальный размер одного референса (= file_size_limit бакета generation-inputs) */
  inputMaxBytes: 10 * 1024 * 1024,
  /** Максимальный размер результата генерации */
  outputMaxBytes: 50 * 1024 * 1024,
  /** Жёсткий потолок референсов на один запрос (дальше ограничивает max_media режима) */
  maxInputsPerRequest: 10,
  /** Общая квота хранилища на пользователя */
  userQuotaBytes: 200 * 1024 * 1024,
  /** Сколько загруженных, но не отправленных файлов допускается одновременно */
  maxPendingUploads: 20,
  /** Через сколько часов неотправленная загрузка считается мусором */
  uploadedTtlHours: 24,
  /** Срок жизни ссылки для показа в UI */
  signTtlSec: 3600,
  /** Срок жизни ссылки, которую получает модель */
  modelSignTtlSec: 600,
} as const;

export type MediaKind = 'input' | 'output';
export type MediaType = 'image' | 'video' | 'audio';

export interface IMediaFileRow {
  id: string;
  user_id: number;
  chat_id: string | null;
  storage_path: string;
  kind: MediaKind;
  mime: string;
  size_bytes: number;
  status: 'uploaded' | 'attached';
  /** Референс подтверждён /media/confirm (у результатов — NULL) */
  confirmed_at: string | null;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STORAGE_PATH_RE = /^(?:in\/)?\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

export function isAllowedMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXT, mime);
}

export function extFromMime(mime: string): string | null {
  return MIME_TO_EXT[mime] || null;
}

export function mimeFromUrlExt(url: string): string | null {
  const m = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url);
  return m ? EXT_TO_MIME[m[1].toLowerCase()] || null : null;
}

export function mediaTypeFromMime(mime: string): MediaType | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

export function buildStoragePath(userId: number, mime: string, kind: MediaKind): string {
  const ext = extFromMime(mime);
  if (!ext) throw new HttpError(400, 'Unsupported mime type');
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  return kind === 'input' ? INPUT_PREFIX + path : path;
}

/** Бакет объекта по его пути */
export function bucketForPath(path: string): string {
  return path.startsWith(INPUT_PREFIX) ? INPUT_BUCKET : MEDIA_BUCKET;
}

/** Пути, разложенные по бакетам */
function groupByBucket(paths: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const p of paths) {
    const bucket = bucketForPath(p);
    const list = groups.get(bucket);
    if (list) list.push(p);
    else groups.set(bucket, [p]);
  }
  return groups;
}

export function assertStoragePaths(paths: unknown, max: number): string[] {
  if (!Array.isArray(paths)) throw new HttpError(400, 'paths must be an array');
  const unique = Array.from(new Set(paths.map((p) => String(p))));
  if (unique.length > max) throw new HttpError(400, `Too many files (max ${max})`);
  for (const p of unique) {
    if (!STORAGE_PATH_RE.test(p)) throw new HttpError(400, 'Invalid storage_path');
  }
  return unique;
}

// ============================================
// Storage REST API
// ============================================

function storageBase(config: ISupabaseConfig): string {
  return `${config.url}/storage/v1`;
}

function storageHeaders(config: ISupabaseConfig): Record<string, string> {
  return { apikey: config.key, Authorization: `Bearer ${config.key}` };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Одноразовая ссылка, по которой клиент грузит файл напрямую в Storage (минуя лимит тела запроса Vercel) */
export async function createSignedUploadUrl(path: string, config: ISupabaseConfig): Promise<string> {
  const res = await fetch(
    `${storageBase(config)}/object/upload/sign/${bucketForPath(path)}/${encodePath(path)}`,
    {
      method: 'POST',
      headers: { ...storageHeaders(config), 'Content-Type': 'application/json' },
      body: '{}',
    }
  );
  if (!res.ok) {
    throw new Error(`Storage upload-sign error ${res.status}: ${(await res.text()).substring(0, 200)}`);
  }
  const data = await res.json();
  if (!data?.url) throw new Error('Storage upload-sign: empty url');
  return `${storageBase(config)}${data.url}`;
}

/** Проверка, что объект загружен: возвращает реальные размер и mime из Storage */
export async function headObject(
  path: string,
  config: ISupabaseConfig
): Promise<{ exists: boolean; size: number; mime: string }> {
  const res = await fetch(
    `${storageBase(config)}/object/authenticated/${bucketForPath(path)}/${encodePath(path)}`,
    { method: 'HEAD', headers: storageHeaders(config) }
  );
  if (!res.ok) return { exists: false, size: 0, mime: '' };
  return {
    exists: true,
    size: Number(res.headers.get('content-length') || 0),
    mime: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(),
  };
}

/** Пакетная подпись ссылок на скачивание. Возвращает карту path → полный URL */
export async function signUrls(
  paths: string[],
  expiresIn: number,
  config: ISupabaseConfig
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const [bucket, bucketPaths] of groupByBucket(paths)) {
    const res = await fetch(`${storageBase(config)}/object/sign/${bucket}`, {
      method: 'POST',
      headers: { ...storageHeaders(config), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn, paths: bucketPaths }),
    });
    if (!res.ok) {
      throw new Error(`Storage sign error ${res.status}: ${(await res.text()).substring(0, 200)}`);
    }
    const data = await res.json();
    for (const item of Array.isArray(data) ? data : []) {
      if (item?.path && item?.signedURL) {
        map[item.path] = `${storageBase(config)}${item.signedURL}`;
      }
    }
  }
  return map;
}

/** Серверная загрузка (результаты генерации) */
export async function uploadObject(
  path: string,
  bytes: Uint8Array,
  mime: string,
  config: ISupabaseConfig
): Promise<void> {
  const res = await fetch(`${storageBase(config)}/object/${bucketForPath(path)}/${encodePath(path)}`, {
    method: 'POST',
    headers: {
      ...storageHeaders(config),
      'Content-Type': mime,
      'x-upsert': 'false',
      'cache-control': 'max-age=3600',
    },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`Storage upload error ${res.status}: ${(await res.text()).substring(0, 200)}`);
  }
}

/** Удаление объектов. При ошибке бросает исключение — записи в media_files остаются для повторной попытки */
export async function removeObjects(paths: string[], config: ISupabaseConfig): Promise<void> {
  for (const [bucket, bucketPaths] of groupByBucket(paths)) {
    for (let i = 0; i < bucketPaths.length; i += 100) {
      const chunk = bucketPaths.slice(i, i + 100);
      const res = await fetch(`${storageBase(config)}/object/${bucket}`, {
        method: 'DELETE',
        headers: { ...storageHeaders(config), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: chunk }),
      });
      if (!res.ok) {
        throw new Error(`Storage remove error ${res.status}: ${(await res.text()).substring(0, 200)}`);
      }
    }
  }
}

// ============================================
// media_files
// ============================================

function inList(values: string[]): string {
  return encodeURIComponent(`(${values.map((v) => `"${v}"`).join(',')})`);
}

/** Файлы пользователя по путям (чужие пути просто не вернутся) */
export async function getOwnedFiles(
  userId: number,
  paths: string[],
  config: ISupabaseConfig
): Promise<IMediaFileRow[]> {
  if (paths.length === 0) return [];
  const rows = await supabaseFetch(
    `media_files?user_id=eq.${userId}&storage_path=in.${inList(paths)}` +
      `&select=id,user_id,chat_id,storage_path,kind,mime,size_bytes,status,confirmed_at`,
    { method: 'GET' },
    config
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Занятое место: результаты и подтверждённые референсы — по факту,
 * неподтверждённые референсы — не меньше inputMaxBytes (столько Storage максимум примет).
 */
export async function getUserMediaUsage(userId: number, config: ISupabaseConfig): Promise<number> {
  const used = await supabaseRPC(
    'get_user_media_usage',
    { p_user_id: userId, p_unconfirmed_bytes: MEDIA_LIMITS.inputMaxBytes },
    config
  );
  return Number(used) || 0;
}

export async function deleteMediaRows(ids: string[], config: ISupabaseConfig): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await supabaseFetch(
      `media_files?id=in.(${chunk.join(',')})`,
      { method: 'DELETE' },
      config
    );
  }
}

/**
 * Очистка файлов:
 *  1. загруженные, но так и не отправленные в генерацию (старше uploadedTtlHours);
 *  2. файлы удалённых чатов (chat_id обнулился по FK ON DELETE SET NULL);
 *  3. файлы, на которые не ссылается ни одно сообщение чата (сообщение удалено
 *     навсегда) — раньше они занимали квоту, пока жив чат (sql/stage5_hygiene.sql).
 *     Нет функции в БД — шаг пропускается.
 * Вызывается из cron после очистки корзины.
 */
export async function cleanupMediaFiles(config: ISupabaseConfig): Promise<{ removed: number }> {
  const cutoff = new Date(Date.now() - MEDIA_LIMITS.uploadedTtlHours * 3600 * 1000).toISOString();

  const stale = await supabaseFetch(
    `media_files?status=eq.uploaded&created_at=lt.${encodeURIComponent(cutoff)}&select=id,storage_path&limit=500`,
    { method: 'GET' },
    config
  );
  const orphaned = await supabaseFetch(
    `media_files?status=eq.attached&chat_id=is.null&select=id,storage_path&limit=500`,
    { method: 'GET' },
    config
  );

  let unreferenced: any[] = [];
  try {
    const res = await supabaseRPC('find_unreferenced_media', { p_limit: 500 }, config);
    unreferenced = Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('cleanupMediaFiles: find_unreferenced_media недоступна:', (err as Error).message);
  }

  // Один файл может попасть в две выборки — убираем повторы
  const seen = new Set<string>();
  const rows = [
    ...(Array.isArray(stale) ? stale : []),
    ...(Array.isArray(orphaned) ? orphaned : []),
    ...unreferenced,
  ].filter((r: any) => r?.id && r?.storage_path && !seen.has(r.id) && seen.add(r.id));
  if (rows.length === 0) return { removed: 0 };

  await removeObjects(rows.map((r: any) => r.storage_path), config);
  await deleteMediaRows(rows.map((r: any) => r.id), config);

  return { removed: rows.length };
}
