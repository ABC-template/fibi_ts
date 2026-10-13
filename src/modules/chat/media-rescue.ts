// ============================================
// src/modules/chat/media-rescue.ts
// Подписка закончилась → облачные чаты и файлы удалятся через 7 дней (data_deadline).
// Тексты чатов уже лежат на устройстве, а медиа генераций — только в облаке.
// Здесь: раз в день предлагаем сохранить все такие файлы в приложении
// (IndexedDB, services/media-vault.ts), чтобы результаты остались доступны.
// Версия: 1.1.0 - срок облака и отметка о показе — с привязкой к Telegram ID (user-storage)
//          1.0.0
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { resolveMediaUrls } from '@/services/generation-media';
import { isSavedLocally, saveFromUrl } from '@/services/media-vault';
import { userStorage } from '@/utils/user-storage';

interface IRescueItem {
  path: string;
  mime: string;
  size: number;
}


/** Все медиа генераций из чатов на устройстве */
export function collectGenerationMedia(): IRescueItem[] {
  const items = new Map<string, IRescueItem>();
  for (const chats of Object.values(chatStore.histories || {})) {
    for (const chat of chats || []) {
      for (const msg of chat.messages || []) {
        const meta = (msg as any).metadata;
        if (msg.deleted_at || meta?.kind !== 'generation' || !Array.isArray(meta.media)) continue;
        for (const m of meta.media) {
          if (m?.storage_path && !items.has(m.storage_path)) {
            items.set(m.storage_path, { path: m.storage_path, mime: m.mime || '', size: Number(m.size_bytes) || 0 });
          }
        }
      }
    }
  }
  return Array.from(items.values());
}

async function unsavedItems(): Promise<IRescueItem[]> {
  const all = collectGenerationMedia();
  const result: IRescueItem[] = [];
  for (const item of all) {
    if (!(await isSavedLocally(item.path))) result.push(item);
  }
  return result;
}

/** Сохранить файлы в приложении. Возвращает, сколько сохранено и сколько уже нет в облаке */
export async function saveAllMedia(
  items: IRescueItem[],
  onProgress?: (done: number, total: number) => void
): Promise<{ saved: number; missing: number; failed: number }> {
  let saved = 0;
  let missing = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += 20) {
    const chunk = items.slice(i, i + 20);
    const urls = await resolveMediaUrls(chunk.map((c) => c.path));
    for (const item of chunk) {
      const url = urls[item.path];
      if (!url) missing++;
      else if (await saveFromUrl(item.path, url, item.mime)) saved++;
      else failed++;
      onProgress?.(saved + missing + failed, items.length);
    }
  }
  return { saved, missing, failed };
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? ` (~${mb.toFixed(mb >= 10 ? 0 : 1)} МБ)` : ` (~${Math.max(1, Math.round(bytes / 1024))} КБ)`;
}

/**
 * Предложить сохранить медиа, если подписка закончилась и облако скоро удалится.
 * Не чаще раза в день.
 */
export async function offerMediaRescue(force = false): Promise<void> {
  try {
    if (userStore.role !== 'trial') return;
    const deadlineRaw = userStorage.get('data_deadline');
    const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
    if (!deadline || Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) return;

    const today = new Date().toISOString().slice(0, 10);
    if (!force && userStorage.get('media_rescue_offered_on') === today) return;

    const items = await unsavedItems();
    if (items.length === 0) return;
    userStorage.set('media_rescue_offered_on', today);

    const total = items.reduce((sum, i) => sum + i.size, 0);
    const modalManager = (window as any).modalManager;
    if (!modalManager) return;

    // Не перебиваем другую модалку (например, ежедневный бонус) — ждём, пока закроют
    for (let i = 0; i < 40 && modalManager.isOpen?.(); i++) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (modalManager.isOpen?.()) return;

    modalManager.open({
      title: '📲 Сохраните результаты генераций',
      modalId: 'media-rescue',
      showFooter: true,
      content: `
        <div style="font-size:14px;line-height:1.6;color:var(--app-text-secondary)">
          Подписка закончилась. Облачные чаты и файлы будут удалены
          <b>${deadline.toLocaleDateString('ru-RU')}</b>.<br><br>
          Тексты чатов уже сохранены на устройстве. Картинки и видео — пока только в облаке:
          <b>${items.length}</b> файл(ов)${formatSize(total)}.<br><br>
          Сохраните их в приложении, чтобы они открывались и после удаления облака.
          Продлите PRO — и ничего не удалится.
        </div>`,
      footer: `<button id="modal-save-btn" class="btn" style="width:100%;">📲 Сохранить всё</button>`,
      onSave: async () => {
        modalManager.close();
        const toast = (window as any).uiRenderer?.showToast?.bind((window as any).uiRenderer);
        toast?.(`⏳ Сохраняю ${items.length} файл(ов)…`, 'info', 2000);
        const res = await saveAllMedia(items);
        if (res.saved === items.length) {
          toast?.('✅ Все файлы сохранены в приложении', 'success', 2500);
        } else {
          const parts = [`сохранено ${res.saved}`];
          if (res.missing) parts.push(`уже удалено ${res.missing}`);
          if (res.failed) parts.push(`не удалось ${res.failed} (место?)`);
          toast?.(`📲 ${parts.join(', ')}`, res.failed ? 'warning' : 'info', 3500);
        }
      },
    });
  } catch (err) {
    console.warn('⚠️ [media-rescue]', err);
  }
}

(window as any).offerMediaRescue = offerMediaRescue;
