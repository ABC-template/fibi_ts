// ============================================
// src/utils/clear-cache.ts
// Очистка локального кэша приложения (профиль и сайдбар)
// Версия: 1.1.0 - sync_token текущего аккаунта (user-storage)
//          1.0.0 - общая функция вместо двух копий; история чатов удаляется
//                 из IndexedDB, перезагрузка — только после завершения очистки
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { organizerStore } from '@/store/OrganizerStore';
import { questsStore } from '@/store/QuestsStore';
import { userStorage } from '@/utils/user-storage';

export const CLEAR_CACHE_CONFIRM =
  'Очистить локальный кэш приложения?\n\n' +
  '⚠️ Ваши НЕСИНХРОНИЗИРОВАННЫЕ данные (TRIAL) будут потеряны.\n' +
  '☁️ Синхронизированные данные (PRO) восстановятся из облака.';

/** Спросить подтверждение и выполнить onConfirm */
export function confirmClearCache(onConfirm: () => void): void {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.showConfirm) {
    tg.showConfirm(CLEAR_CACHE_CONFIRM, (ok: boolean) => { if (ok) onConfirm(); });
  } else if (confirm(CLEAR_CACHE_CONFIRM)) {
    onConfirm();
  }
}

/** Удалить локальные данные и перезагрузить приложение */
export async function clearLocalCache(): Promise<void> {
  await chatStore.clearPersisted();

  for (const store of [questsStore, userStore, organizerStore] as any[]) {
    store._data = {};
    store.save();
  }

  userStorage.remove('sync_token');

  (window as any).uiRenderer?.showToast?.('🧹 Кэш и токен очищены', 'success', 1500);
  setTimeout(() => location.reload(), 1000);
}
