// ============================================
// src/services/generation-media.ts
// Медиа генеративных агентов: загрузка референсов в приватный Storage
// (напрямую по одноразовой ссылке) и получение подписанных ссылок для показа.
// В сообщениях и в localStorage хранятся только storage_path — ссылки живут
// только в памяти и перевыпрашиваются при необходимости.
// Версия: 1.0.0
// ============================================

import { apiClient } from './api';
import type {
  IGenerationMedia,
  IMediaConfirmResponse,
  IMediaSignResponse,
  IMediaUploadUrlResponse,
} from '../../types/generation';

/** Должно совпадать с MEDIA_LIMITS на сервере (api/_lib/media.ts) */
export const REFERENCE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPerRequest: 10,
  mimes: ['image/jpeg', 'image/png', 'image/webp'] as string[],
};

/** Ссылку берём заново, если до конца её жизни осталось меньше этого */
const SIGN_MARGIN_MS = 5 * 60 * 1000;
const SIGN_BATCH = 50;

interface ISignedEntry {
  url: string;
  expiresAt: number;
}

const signedCache = new Map<string, ISignedEntry>();
const inflight = new Map<string, Promise<string | null>>();

/** Загруженный и подтверждённый референс */
export interface IUploadedReference extends IGenerationMedia {
  file_id: string;
}

export class MediaValidationError extends Error {}

/** Проверка файла до обращения к серверу. Возвращает текст ошибки или null. */
export function validateReferenceFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  if (!REFERENCE_LIMITS.mimes.includes(mime)) {
    return 'Поддерживаются JPEG, PNG и WebP';
  }
  if (file.size <= 0) return 'Файл пустой';
  if (file.size > REFERENCE_LIMITS.maxBytes) {
    return `Файл больше ${Math.round(REFERENCE_LIMITS.maxBytes / 1024 / 1024)} МБ`;
  }
  return null;
}

/**
 * Загрузка референса: upload-url → PUT напрямую в Storage → confirm.
 * Файл не проходит через наши функции (лимит тела запроса Vercel).
 */
export async function uploadReference(
  file: File,
  agentId: string,
  mode: string
): Promise<IUploadedReference> {
  const invalid = validateReferenceFile(file);
  if (invalid) throw new MediaValidationError(invalid);

  const mime = file.type.toLowerCase();

  const slot = await apiClient.post<IMediaUploadUrlResponse>('/media/upload-url', {
    agent_id: agentId,
    mode,
    mime,
    size: file.size,
  });
  if (!slot?.success || !slot.upload_url) {
    throw new Error('Не удалось подготовить загрузку');
  }

  const put = await fetch(slot.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Загрузка не удалась (${put.status})`);
  }

  const done = await apiClient.post<IMediaConfirmResponse>('/media/confirm', {
    file_id: slot.file_id,
  });
  if (!done?.success) {
    throw new Error('Не удалось подтвердить загрузку');
  }

  return {
    file_id: done.file_id,
    type: done.type,
    storage_path: done.storage_path,
    mime: done.mime,
    size_bytes: done.size_bytes,
  };
}

/**
 * Подписанные ссылки для набора путей. Пачками, с кэшем в памяти и
 * склейкой одновременных запросов. Пути, для которых ссылку получить не
 * удалось, в результат не попадают.
 */
export async function resolveMediaUrls(paths: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const now = Date.now();
  const missing: string[] = [];
  const waiting: Array<Promise<void>> = [];

  for (const path of new Set(paths.filter(Boolean))) {
    const cached = signedCache.get(path);
    if (cached && cached.expiresAt - SIGN_MARGIN_MS > now) {
      result[path] = cached.url;
      continue;
    }
    const pending = inflight.get(path);
    if (pending) {
      waiting.push(
        pending.then((url) => {
          if (url) result[path] = url;
        })
      );
      continue;
    }
    missing.push(path);
  }

  for (let i = 0; i < missing.length; i += SIGN_BATCH) {
    const chunk = missing.slice(i, i + SIGN_BATCH);
    const request = signChunk(chunk);

    for (const path of chunk) {
      inflight.set(
        path,
        request.then((urls) => urls[path] || null)
      );
    }

    waiting.push(
      request
        .then((urls) => {
          for (const path of chunk) {
            if (urls[path]) result[path] = urls[path];
          }
        })
        .finally(() => {
          for (const path of chunk) inflight.delete(path);
        })
    );
  }

  await Promise.all(waiting);
  return result;
}

async function signChunk(chunk: string[]): Promise<Record<string, string>> {
  try {
    const res = await apiClient.post<IMediaSignResponse>('/media/sign', { paths: chunk });
    if (!res?.success || !res.urls) return {};

    const ttlMs = (Number(res.expires_in) || 3600) * 1000;
    const expiresAt = Date.now() + ttlMs;
    for (const [path, url] of Object.entries(res.urls)) {
      signedCache.set(path, { url, expiresAt });
    }
    return res.urls;
  } catch (err) {
    console.warn('⚠️ [media] Не удалось получить ссылки:', (err as Error).message);
    return {};
  }
}

/** Ссылка на один файл (или null) */
export async function resolveMediaUrl(path: string): Promise<string | null> {
  const urls = await resolveMediaUrls([path]);
  return urls[path] || null;
}

/** Забыть закэшированную ссылку (например, после ошибки загрузки картинки) */
export function forgetMediaUrl(path: string): void {
  signedCache.delete(path);
}
