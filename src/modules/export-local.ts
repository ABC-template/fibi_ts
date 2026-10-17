// ============================================
// src/modules/export-local.ts
// Экспорт архива
// Версия: 4.1.1 - названия тем — из config/topics (глобальная window.topicNames удалена)
//          4.1.0 - облачный архив: 429 (лимит частоты) — понятное сообщение; если часть
//                 большого архива не пришла, файл не сохраняется (раньше — молча без неё)
//          4.0.0 - локальный архив собирается целиком на устройстве (POST /api/chats/export
//                 удалён: работал без авторизации); чаты из корзины не попадают в архив;
//                 агент/тип чата и запрос генерации; удалён downloadMultiPartArchive
//          3.1.1 - замена @types → @app-types
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { topicNames } from '@/config/topics';
import type { IChat, IMessage, IExportArchive, IExportArchiveMessage, TopicId } from '@app-types';

function notify(message: string): void {
  const tg = (window as any).tg || (window as any).Telegram?.WebApp;
  if (tg?.showAlert) tg.showAlert(message);
  else alert(message);
}

function toArchiveMessage(m: IMessage): IExportArchiveMessage {
  const out: IExportArchiveMessage = {
    id: m.id,
    type: m.type,
    text: m.text,
    is_favorite: m.isFavorite === true,
    created_at: m.created_at
  };
  const meta = m.metadata as any;
  if (meta?.kind === 'generation') {
    out.generation = {
      status: meta.status || null,
      modality: meta.modality || null,
      prompt: meta.prompt || null,
      negative_prompt: meta.negative_prompt || null,
      params: meta.params || {},
      media: (Array.isArray(meta.media) ? meta.media : []).map((item: any) => ({
        type: item.type,
        mime: item.mime
      }))
    };
  }
  return out;
}

/** Архив из чатов на устройстве (без корзины и пустых чатов) */
function buildLocalArchive(): { archive: IExportArchive[]; totalMessages: number } {
  const archive: IExportArchive[] = [];
  let totalMessages = 0;

  const entries = Object.entries(chatStore.histories || {}) as [TopicId, IChat[]][];
  for (const [topicId, chats] of entries) {
    for (const chat of chats || []) {
      if (chat.deleted_at) continue;

      const messages = (chat.messages || [])
        .filter((m) => !m.deleted_at)
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        .map(toArchiveMessage);
      if (messages.length === 0) continue;

      archive.push({
        chat_id: chat.id,
        title: chat.title,
        topic_id: topicId,
        topic_name: (topicNames as Record<string, string>)[topicId] || topicId,
        max_context: chat.maxContext || 15,
        user_renamed: chat.userRenamed || false,
        pinned: chat.pinned || false,
        agent_id: chat.agent_id || null,
        modality: chat.modality || null,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        messages
      });
      totalMessages += messages.length;
    }
  }

  archive.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
  return { archive, totalMessages };
}

/**
 * Экспорт локального архива (доступен всем, без обращения к серверу)
 */
(window as any).exportLocalArchive = async function(): Promise<void> {
  console.log('📦 Собираем локальный архив...');

  const { archive, totalMessages } = buildLocalArchive();
  if (archive.length === 0) {
    notify('Нет данных для экспорта');
    return;
  }

  try {
    const date = new Date().toISOString().slice(0, 10);
    (window as any).downloadJSON(archive, `versatile_ai_local_archive_${date}_${totalMessages}_messages.json`);
    notify(`✅ Архив создан: ${archive.length} чатов, ${totalMessages} сообщений.`);
  } catch (err) {
    console.error('Ошибка экспорта локального архива:', err);
    notify('❌ Не удалось сохранить архив. Попробуйте позже.');
  }
};

/**
 * Скачивание JSON файла
 */
(window as any).downloadJSON = function(data: any, filename: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Экспорт облачного архива (только PRO)
 */
(window as any).exportCloudArchive = async function(): Promise<void> {
  if (!userStore.canSync()) {
    notify('Облачный архив доступен только для PRO-пользователей.\n\nИспользуйте "Экспорт локального архива" для сохранения данных.');
    return;
  }

  const initData = (window as any).Telegram?.WebApp?.initData;
  if (!initData) {
    console.error('Нет данных авторизации');
    return;
  }

  const fetchPart = (part: number): Promise<Response> =>
    fetch('/api/chats/export', {
      method: 'GET',
      headers: part === 1
        ? { 'X-Telegram-Init-Data': initData }
        : { 'X-Telegram-Init-Data': initData, 'X-Request-Part': String(part) }
    });

  const rateLimitedText = (retryAfter: number): string => {
    const minutes = Math.max(1, Math.ceil((Number(retryAfter) || 60) / 60));
    return `⏳ Архив скачивали слишком часто. Попробуйте через ${minutes} мин.`;
  };

  try {
    const response = await fetchPart(1);
    const data = await response.json();

    if (response.status === 429) {
      notify(rateLimitedText(data.retry_after));
      return;
    }

    if (!response.ok) {
      if (data.fallbackToLocal) {
        const tg = (window as any).tg || (window as any).Telegram?.WebApp;
        if (tg?.showConfirm) {
          tg.showConfirm(
            'Облачный архив временно недоступен. Скачать локальный архив?',
            (ok: boolean) => { if (ok) (window as any).exportLocalArchive(); }
          );
        } else if (confirm('Облачный архив временно недоступен. Скачать локальный архив?')) {
          (window as any).exportLocalArchive();
        }
      } else {
        throw new Error(data.error || 'Ошибка экспорта');
      }
      return;
    }

    if (data.total_parts > 1) {
      // Архив без пропусков: если часть не пришла, файл не сохраняем
      const allParts = [data.archive];
      for (let part = 2; part <= data.total_parts; part++) {
        const partResponse = await fetchPart(part);
        const partData = await partResponse.json().catch(() => ({}));
        if (partResponse.status === 429) {
          notify(rateLimitedText(partData.retry_after));
          return;
        }
        if (!partResponse.ok || !partData.success || !Array.isArray(partData.archive)) {
          throw new Error(partData.error || `Часть ${part} из ${data.total_parts} не загружена`);
        }
        allParts.push(partData.archive);
      }

      const fullArchive = allParts.flat();
      (window as any).downloadJSON(fullArchive, `versatile_ai_cloud_archive_full_${fullArchive.length}_chats.json`);
    } else {
      (window as any).downloadJSON(data, `versatile_ai_cloud_archive_${Date.now()}.json`);
    }

    if (data.grace_period_days_left !== null && data.grace_period_days_left > 0) {
      notify(`⚠️ Ваши данные будут удалены через ${data.grace_period_days_left} дней. Сохраните архив в надежном месте.`);
    }
  } catch (err) {
    console.error('Ошибка экспорта облачного архива:', err);
    notify(`Не удалось загрузить облачный архив: ${(err as Error).message || 'проверьте подключение к интернету'}.`);
  }
};
