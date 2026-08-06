// ============================================
// src/modules/export-local.ts
// Экспорт архива
// Версия: 3.0.1 - FIXED TYPES
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import type { IChat, IExportArchive } from '@types';

/**
 * Экспорт локального архива (доступен всем)
 */
(window as any).exportLocalArchive = async function(): Promise<void> {
  console.log('📦 Начинаем экспорт локального архива...');

  if (!chatStore) {
    if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Ошибка: хранилище не инициализировано');
    return;
  }

  const allChats = chatStore.histories || {};
  if (Object.keys(allChats).length === 0) {
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert('Нет данных для экспорта');
    } else {
      alert('Нет данных для экспорта');
    }
    return;
  }

  try {
    const exportData = {
      chatHistories: allChats,
      topicNames: (window as any).topicNames || {},
      exportDate: new Date().toISOString(),
      appVersion: '3.0.1'
    };

    const response = await fetch('/api/chats/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportData)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Ошибка экспорта');
    }

    if (data.total_parts > 1) {
      await (window as any).downloadMultiPartArchive(data);
    } else {
      (window as any).downloadJSON(data.archive, `versatile_ai_local_archive_${data.total_messages}_messages.json`);
    }

    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert(`✅ Архив успешно создан! Скачано ${data.total_messages} сообщений.`);
    }
  } catch (err) {
    console.error('Ошибка экспорта локального архива:', err);

    try {
      console.log('Пробуем прямой экспорт через браузер...');
      const fallbackArchive: IExportArchive[] = [];
      for (const [topicId, chats] of Object.entries(allChats)) {
        for (const chat of (chats as IChat[] || [])) {
          fallbackArchive.push({
            chat_id: chat.id,
            title: chat.title,
            topic_id: chat.topic,
            topic_name: (window as any).topicNames?.[topicId] || topicId,
            max_context: chat.maxContext || 15,
            user_renamed: chat.userRenamed || false,
            created_at: chat.created_at,
            updated_at: chat.updated_at,
            messages: chat.messages || []
          });
        }
      }
      (window as any).downloadJSON(fallbackArchive, `versatile_ai_local_archive_fallback.json`);

      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('⚠️ Архив создан в упрощенном формате. Некоторые данные могут отсутствовать.');
      }
    } catch (fallbackErr) {
      console.error('Fallback экспорт не удался:', fallbackErr);
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('❌ Не удалось создать архив. Попробуйте позже.');
      }
    }
  }
};

/**
 * Скачивание многокомпонентного архива
 */
(window as any).downloadMultiPartArchive = async function(firstPart: any): Promise<void> {
  const totalParts = firstPart.total_parts;
  const allArchiveParts = [firstPart.archive];

  console.log(`📦 Скачиваю архив из ${totalParts} частей...`);

  for (let part = 2; part <= totalParts; part++) {
    const response = await fetch('/api/chats/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Part': part.toString()
      },
      body: JSON.stringify({
        chatHistories: chatStore?.histories || {},
        topicNames: (window as any).topicNames || {},
        exportOptions: { part: part.toString() }
      })
    });

    const partData = await response.json();
    if (partData.success && partData.archive) {
      allArchiveParts.push(partData.archive);
    } else {
      console.warn(`Часть ${part} не загрузилась`);
    }
  }

  const fullArchive = allArchiveParts.flat();
  (window as any).downloadJSON(fullArchive, `versatile_ai_local_archive_full_${fullArchive.length}_chats.json`);
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
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert('Облачный архив доступен только для PRO-пользователей.\n\nИспользуйте "Экспорт локального архива" для сохранения данных.');
    }
    return;
  }

  const initData = (window as any).Telegram?.WebApp?.initData;
  if (!initData) {
    console.error('Нет данных авторизации');
    return;
  }

  try {
    const response = await fetch('/api/chats/export', {
      method: 'GET',
      headers: { 'X-Telegram-Init-Data': initData }
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.fallbackToLocal) {
        if ((window as any).tg?.showConfirm) {
          (window as any).tg.showConfirm(
            'Облачный архив временно недоступен. Скачать локальный архив?',
            (ok: boolean) => { if (ok) (window as any).exportLocalArchive(); }
          );
        }
      } else {
        throw new Error(data.error || 'Ошибка экспорта');
      }
      return;
    }

    if (data.total_parts > 1) {
      const allParts = [data.archive];
      for (let part = 2; part <= data.total_parts; part++) {
        const partResponse = await fetch('/api/chats/export', {
          method: 'GET',
          headers: {
            'X-Telegram-Init-Data': initData,
            'X-Request-Part': part.toString()
          }
        });
        const partData = await partResponse.json();
        if (partData.success && partData.archive) {
          allParts.push(partData.archive);
        }
      }

      const fullArchive = allParts.flat();
      (window as any).downloadJSON(fullArchive, `versatile_ai_cloud_archive_full_${fullArchive.length}_chats.json`);
    } else {
      (window as any).downloadJSON(data, `versatile_ai_cloud_archive_${Date.now()}.json`);
    }

    if (data.grace_period_days_left !== null && data.grace_period_days_left > 0) {
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert(`⚠️ Ваши данные будут удалены через ${data.grace_period_days_left} дней. Сохраните архив в надежном месте.`);
      }
    }
  } catch (err) {
    console.error('Ошибка экспорта облачного архива:', err);
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert('Не удалось загрузить облачный архив. Проверьте подключение к интернету.');
    }
  }
};

console.log('✅ ExportLocal v3.0.1 загружен (TypeScript)');
