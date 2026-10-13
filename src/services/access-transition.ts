// ============================================
// src/services/access-transition.ts
// Переходы между бесплатным доступом и PRO (синхронизацией):
//   trial → PRO: локальные чаты выгружаются в облако, включается Realtime
//   PRO → trial: Realtime выключается, предупреждение о сроке удаления данных
// Вызывается после каждой проверки доступа: при запуске (app.ts) и сразу после
// активации подписки (subscription.ts), чтобы не ждать перезапуска приложения.
// Версия: 1.0.0
// ============================================

import { chatService } from './chats';
import { syncService } from './sync';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';
import type { IAuthResult } from './auth';

const PRO_ROLES = new Set(['premium', 'admin', 'creator']);

let running: Promise<void> | null = null;

export function applyAccessTransition(result: IAuthResult): Promise<void> {
  // Два вызова подряд (запуск + активация) не должны выгружать чаты дважды
  if (running) return running;
  running = doTransition(result).finally(() => {
    running = null;
  });
  return running;
}

async function doTransition(result: IAuthResult): Promise<void> {
  const wasPro = PRO_ROLES.has(result.previousRole || '');
  const isPro = result.syncEnabled === true;

  if (isPro && !wasPro) {
    console.log('🔄 [access] Синхронизация включена: выгружаем локальные чаты');
    try {
      await chatService.uploadLocalDataToCloud();
    } catch (err) {
      console.error('❌ [access] Ошибка выгрузки локальных чатов:', err);
    }
    // Токен синхронизации после выгрузки — актуальный с сервера
    await (window as any).refreshSyncToken?.();

    const userId = userStore.userId;
    if (userId) syncService.subscribe(userId);

    uiRenderer?.showToast('🎉 PRO включён: чаты синхронизируются между устройствами.', 'success', 3000);
    return;
  }

  if (!isPro && wasPro) {
    console.log('⚠️ [access] Синхронизация выключена (подписка закончилась)');
    syncService.setRealtimeToken(null);
    syncService.unsubscribe();
    if (result.dataDeadline) {
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(result.dataDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );
      uiRenderer?.showToast(
        `⚠️ Подписка закончилась. Данные в облаке будут удалены через ${daysLeft} дн. — сохраните архив.`,
        'warning',
        5000
      );
    }
  }
}
