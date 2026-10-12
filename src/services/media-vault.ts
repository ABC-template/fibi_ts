// ============================================
// src/services/media-vault.ts
// Медиа генераций, сохранённые в самом приложении (IndexedDB).
// Нужны, чтобы результаты оставались доступны без облака: после окончания
// подписки облачные файлы удаляются через 7 дней — как и облачные чаты, —
// а сохранённые здесь продолжают открываться (как локальные чаты trial).
// Ключ — storage_path файла; хранится Blob и его тип.
// Версия: 1.0.0
// ============================================

const DB_NAME = 'fibi-media';
const DB_VERSION = 1;
const STORE = 'files';

interface IVaultEntry {
  path: string;
  blob: Blob;
  mime: string;
  size: number;
  saved_at: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const objectUrls = new Map<string, string>();
const knownPaths = new Set<string>();
let indexLoaded = false;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'path' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('⚠️ [media-vault] IndexedDB недоступна:', req.error?.message);
        resolve(null);
      };
    } catch (err) {
      console.warn('⚠️ [media-vault] IndexedDB недоступна:', (err as Error).message);
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = run(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

/** Список сохранённых путей (один раз за сессию, дальше — в памяти) */
async function loadIndex(): Promise<void> {
  if (indexLoaded) return;
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  for (const k of keys || []) knownPaths.add(String(k));
  indexLoaded = true;
}

export async function isSavedLocally(path: string): Promise<boolean> {
  await loadIndex();
  return knownPaths.has(path);
}

/** Синхронная проверка (после первой загрузки индекса) */
export function isSavedLocallySync(path: string): boolean {
  return knownPaths.has(path);
}

/** objectURL сохранённого файла или null */
export async function getLocalUrl(path: string): Promise<string | null> {
  const cached = objectUrls.get(path);
  if (cached) return cached;
  await loadIndex();
  if (!knownPaths.has(path)) return null;

  const entry = await tx<IVaultEntry>('readonly', (s) => s.get(path));
  if (!entry?.blob) {
    knownPaths.delete(path);
    return null;
  }
  const url = URL.createObjectURL(entry.blob);
  objectUrls.set(path, url);
  return url;
}

/** Сохранить файл в приложении, скачав его по (подписанной) ссылке */
export async function saveFromUrl(path: string, url: string, mime?: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    return saveBlob(path, blob, mime || blob.type);
  } catch (err) {
    console.warn('⚠️ [media-vault] Не удалось скачать файл:', (err as Error).message);
    return false;
  }
}

export async function saveBlob(path: string, blob: Blob, mime?: string): Promise<boolean> {
  await requestPersistence();
  const entry: IVaultEntry = {
    path,
    blob,
    mime: mime || blob.type || 'application/octet-stream',
    size: blob.size,
    saved_at: new Date().toISOString(),
  };
  const ok = await tx<IDBValidKey>('readwrite', (s) => s.put(entry));
  if (ok === null) return false;
  knownPaths.add(path);
  return true;
}

export async function removeLocal(path: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(path));
  knownPaths.delete(path);
  const url = objectUrls.get(path);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(path);
  }
}

/** Сколько занято (байт) и сколько файлов */
export async function vaultUsage(): Promise<{ files: number; bytes: number }> {
  const all = await tx<IVaultEntry[]>('readonly', (s) => s.getAll());
  const list = all || [];
  return { files: list.length, bytes: list.reduce((sum, e) => sum + (e.size || 0), 0) };
}

let persistAsked = false;
/** Просим браузер не вытеснять данные при нехватке места (если поддерживается) */
async function requestPersistence(): Promise<void> {
  if (persistAsked) return;
  persistAsked = true;
  try {
    await (navigator as any).storage?.persist?.();
  } catch {
    // не критично
  }
}
