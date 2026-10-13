// ============================================
// src/utils/user-storage.ts
// Данные пользователя в localStorage — с привязкой к Telegram ID.
// На одном устройстве могут входить разные аккаунты Telegram: роль, срок
// хранения облака, sync_token, очередь неотправленных сообщений одного
// аккаунта не должны достаться другому.
// Версия: 1.0.0
// ============================================

import { isQuotaError, warnStorageFull } from '@/store/BaseStore';

/** Ключи, которые хранятся отдельно для каждого аккаунта */
const USER_KEYS = [
  'sync_token',
  'user_role',
  'data_deadline',
  'fibi_message_outbox',
  'media_rescue_offered_on',
] as const;

export type UserStorageKey = typeof USER_KEYS[number];

/** Ключи прежних версий без владельца, которые больше не используются */
const DEAD_KEYS = [
  'session_active',
  'session_start',
  'last_user_id',
  'upload_in_progress',
  'upload_chats_count',
  'upload_current_index',
  'upload_started_at',
];

/** Telegram ID текущего пользователя (null — вне Telegram) */
export function getTelegramUserId(): number | null {
  const id = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return typeof id === 'number' && id > 0 ? id : null;
}

function fullKey(name: UserStorageKey): string | null {
  const id = getTelegramUserId();
  return id ? `${name}:${id}` : null;
}

export const userStorage = {
  get(name: UserStorageKey): string | null {
    const key = fullKey(name);
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(name: UserStorageKey, value: string): void {
    const key = fullKey(name);
    if (!key) return;
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error(`❌ [userStorage] Не удалось сохранить ${name}:`, e);
      if (isQuotaError(e)) warnStorageFull();
    }
  },

  remove(name: UserStorageKey): void {
    const key = fullKey(name);
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch { /* не критично */ }
  },
};

/** sync_token текущего пользователя (пустое значение не сохраняется) */
export function saveSyncToken(token: string | null | undefined): void {
  if (!token) return;
  userStorage.set('sync_token', token);
  console.log(`🔑 sync_token сохранён: ${token.substring(0, 8)}...`);
}

/**
 * Перенос данных прежних версий (ключи без Telegram ID) к текущему аккаунту
 * и удаление ключей, которые больше не используются. Вызывается при запуске
 * до загрузки данных. Чужие данные безопасны: в очереди сообщений только id —
 * сообщения чужих чатов не найдутся в истории и будут отброшены, роль и
 * sync_token сервер обновит при первой проверке.
 */
export function migrateLegacyUserKeys(): void {
  if (!getTelegramUserId()) return;
  try {
    for (const name of USER_KEYS) {
      const legacy = localStorage.getItem(name);
      if (legacy === null) continue;
      if (userStorage.get(name) === null) userStorage.set(name, legacy);
      localStorage.removeItem(name);
    }

    for (const key of DEAD_KEYS) localStorage.removeItem(key);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sync_token_')) localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('⚠️ [userStorage] Перенос старых ключей не выполнен:', e);
  }
}
