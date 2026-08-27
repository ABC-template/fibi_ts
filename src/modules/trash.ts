// ============================================
// src/modules/trash.ts
// Работа с корзиной (ТОЛЬКО ЧАТЫ)
// Версия: 2.0.1 - FIXED TYPES
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { eventBus } from '@/core/event-bus';
import type { UUID } from '@types';

let _trashSubscriptions: Array<() => void> = [];

function _subscribeTrashEvents(): void {
  _unsubscribeTrashEvents();

  const eventBusInstance = eventBus;
  if (!eventBusInstance) return;

  const unsubDeleted = eventBusInstance.on('chat:deleted', () => {
    _updateTrashCountReactive();
  });
  _trashSubscriptions.push(unsubDeleted);

  const unsubRestored = eventBusInstance.on('chat:restored', () => {
    _updateTrashCountReactive();
  });
  _trashSubscriptions.push(unsubRestored);

  const unsubPermanent = eventBusInstance.on('chat:permanent_deleted', (data) => {
    _updateTrashCountReactive();
    if (data?.chatId) {
      _removeTrashItemReactive(data.chatId);
    }
  });
  _trashSubscriptions.push(unsubPermanent);

  const unsubTrashClear = eventBusInstance.on('chat:trash_cleared', () => {
    _updateTrashCountReactive();
    _clearTrashListReactive();
  });
  _trashSubscriptions.push(unsubTrashClear);

  const unsubAll = eventBusInstance.on('chat:all_updated', () => {
    const modal = document.getElementById('trash-modal');
    if (modal?.style?.display !== 'none') {
      (window as any).loadTrashContent();
    }
  });
  _trashSubscriptions.push(unsubAll);

  console.log('📡 Trash подписан на события');
}

function _unsubscribeTrashEvents(): void {
  for (const unsub of _trashSubscriptions) {
    try {
      unsub();
    } catch (e) {
      console.warn('Ошибка отписки Trash:', e);
    }
  }
  _trashSubscriptions = [];
}

function _updateTrashCountReactive(): void {
  const badge = document.getElementById('trash-count');
  if (!badge) return;

  try {
    const trash = chatStore.getTrash();
    const total = trash.chats.length;

    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.style.display = 'inline-block';
      badge.classList.add('visible');
    } else {
      badge.style.display = 'none';
      badge.classList.remove('visible');
    }
  } catch (err) {
    console.error('Ошибка обновления счетчика:', err);
    badge.style.display = 'none';
  }
}

function _removeTrashItemReactive(chatId: UUID): void {
  if (!chatId) return;
  const item = document.getElementById(`trash-item-${chatId}`);
  if (item) {
    item.style.transition = 'all 0.25s ease';
    item.style.opacity = '0';
    item.style.transform = 'scale(0.95)';
    setTimeout(() => item.remove(), 250);
  }

  const list = document.getElementById('trash-list');
  const empty = document.getElementById('trash-empty');
  const actions = document.getElementById('trash-actions');
  if (list && list.children.length === 0) {
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'Корзина пуста';
    }
    if (actions) actions.style.display = 'none';
  }
}

function _clearTrashListReactive(): void {
  const list = document.getElementById('trash-list');
  const empty = document.getElementById('trash-empty');
  const actions = document.getElementById('trash-actions');

  if (list) list.innerHTML = '';
  if (empty) {
    empty.style.display = 'block';
    empty.textContent = 'Корзина пуста';
  }
  if (actions) actions.style.display = 'none';
}

// Выполняем подписку
_subscribeTrashEvents();

// ==========================================
// ОТКРЫТИЕ / ЗАКРЫТИЕ КОРЗИНЫ
// ==========================================

(window as any).openTrashModal = function(): void {
  console.log('🗑️ Открываем корзину...');

  const modal = document.getElementById('trash-modal');
  if (!modal) {
    console.error('❌ Элемент trash-modal не найден');
    return;
  }

  modal.style.display = 'flex';
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  modal.classList.add('active');

  (window as any).loadTrashContent();
};

(window as any).closeTrashModal = function(): void {
  console.log('🗑️ Закрываем корзину...');
  const modal = document.getElementById('trash-modal');
  if (!modal) return;

  modal.style.display = 'none';
  modal.style.visibility = 'hidden';
  modal.style.opacity = '0';
  modal.classList.remove('active');
};

// ==========================================
// ЗАГРУЗКА СОДЕРЖИМОГО КОРЗИНЫ
// ==========================================

(window as any).loadTrashContent = function(): void {
  const list = document.getElementById('trash-list');
  const empty = document.getElementById('trash-empty');
  const actions = document.getElementById('trash-actions');

  if (!list) {
    console.error('❌ trash-list не найден');
    return;
  }

  const trash = chatStore.getTrash();
  const totalChats = trash.chats.length;

  console.log(`🗑️ В корзине: ${totalChats} чатов`);

  if (totalChats === 0) {
    list.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'Корзина пуста';
    }
    if (actions) actions.style.display = 'none';
    _updateTrashCountReactive();
    return;
  }

  if (empty) empty.style.display = 'none';
  if (actions) actions.style.display = 'block';

  list.innerHTML = '';

  if (trash.chats && trash.chats.length > 0) {
    const header = document.createElement('div');
    header.style.cssText = 'font-size:12px; font-weight:600; color:var(--hint-color); margin:8px 0 4px; padding:4px 0; border-bottom:1px solid var(--border-color);';
    header.textContent = `📁 Чаты в корзине (${trash.chats.length})`;
    list.appendChild(header);

    for (const chat of trash.chats) {
      const item = document.createElement('div');
      item.className = 'trash-item';
      item.id = `trash-item-${chat.id}`;
      item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--secondary-bg); border-radius:10px; margin-bottom:6px; border:1px solid var(--app-border-color-light);';

      const deletedDate = chat.deleted_at ? new Date(chat.deleted_at) : new Date();
      const dateStr = (window as any).formatDate ? (window as any).formatDate(deletedDate) : deletedDate.toLocaleString();

      const msgCount = chat.messages ? chat.messages.length : 0;

      item.innerHTML = `
        <div style="flex:1; overflow:hidden; min-width:0;">
          <div style="font-weight:500; font-size:13px; color:var(--text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${chat.title || 'Без названия'}
          </div>
          <div style="font-size:11px; color:var(--hint-color);">
            ${chat.topic || 'unknown'} • ${dateStr} • ${msgCount} сообщений
          </div>
        </div>
        <div style="display:flex; gap:4px; flex-shrink:0; margin-left:8px;">
          <button class="btn" style="padding:4px 10px; font-size:11px; border-radius:6px; background:#27ae60; color:white; border:none; cursor:pointer;"
                  onclick="window.restoreFromTrash('${chat.id}')">
            ↩️
          </button>
          <button class="btn" style="padding:4px 10px; font-size:11px; border-radius:6px; background:#e74c3c; color:white; border:none; cursor:pointer;"
                  onclick="window.permanentDelete('${chat.id}')">
            🗑️
          </button>
        </div>
      `;
      list.appendChild(item);
    }
  }

  _updateTrashCountReactive();
};

// ==========================================
// ВОССТАНОВЛЕНИЕ ЧАТА
// ==========================================

(window as any).restoreFromTrash = async function(chatId: UUID): Promise<void> {
  if (!navigator.onLine) {
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert('Нет интернета. Восстановление недоступно.');
    }
    return;
  }

  console.log(`♻️ Восстанавливаем чат: ${chatId}`);

  const confirmMsg = 'Восстановить этот чат и все его сообщения?';

  const action = async () => {
    try {
      const localSuccess = chatStore.restoreChat(chatId);

      if (!localSuccess) {
        console.error(`❌ Не удалось восстановить чат ${chatId} локально`);
        if ((window as any).tg?.showAlert) {
          (window as any).tg.showAlert('Не удалось восстановить чат');
        }
        return;
      }

      let serverSuccess = true;
      if (userStore.canSync() && (window as any).chatService) {
        try {
          serverSuccess = await (window as any).chatService.restoreChat(chatId);
          if (serverSuccess) {
            console.log(`✅ Чат ${chatId} восстановлен на сервере`);
          } else {
            console.warn(`⚠️ Чат ${chatId} восстановлен локально, но не на сервере`);
          }
        } catch (err) {
          console.error(`❌ Ошибка синхронизации восстановления:`, err);
          serverSuccess = false;
        }
      }

      (window as any).loadTrashContent();
      _updateTrashCountReactive();

      if ((window as any).profileUI) {
        (window as any).profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
      }

      if ((window as any).chatUI) {
        (window as any).chatUI.refreshUI();
      }

      if ((window as any).uiRenderer) {
        if (serverSuccess) {
          (window as any).uiRenderer.showToast('♻️ Чат восстановлен и синхронизирован', 'success', 1500);
        } else {
          (window as any).uiRenderer.showToast('♻️ Чат восстановлен локально', 'info', 1500);
        }
      }

      console.log(`✅ Чат ${chatId} восстановлен`);
    } catch (err) {
      console.error(`❌ Ошибка восстановления чата ${chatId}:`, err);
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('Ошибка восстановления чата');
      }
    }
  };

  if ((window as any).tg?.showConfirm) {
    (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
  } else if (confirm(confirmMsg)) {
    action();
  }
};

// ==========================================
// БЕЗВОЗВРАТНОЕ УДАЛЕНИЕ
// ==========================================

(window as any).permanentDelete = async function(chatId: UUID): Promise<void> {
  if (!navigator.onLine) {
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert('Нет интернета. Удаление недоступно.');
    }
    return;
  }

  console.log(`🗑️ Безвозвратно удаляем чат: ${chatId}`);

  const confirmMsg = 'Удалить чат навсегда? Это действие нельзя отменить!';

  const action = async () => {
    try {
      const localSuccess = chatStore.permanentDeleteChat(chatId);

      if (!localSuccess) {
        console.error(`❌ Не удалось удалить чат ${chatId} локально`);
        if ((window as any).tg?.showAlert) {
          (window as any).tg.showAlert('Не удалось удалить чат');
        }
        return;
      }

      let serverSuccess = true;
      if (userStore.canSync() && (window as any).chatService) {
        try {
          serverSuccess = await (window as any).chatService.permanentDeleteChat(chatId);
          if (serverSuccess) {
            console.log(`✅ Чат ${chatId} удален навсегда на сервере`);
          } else {
            console.warn(`⚠️ Чат ${chatId} удален локально, но не на сервере`);
          }
        } catch (err) {
          console.error(`❌ Ошибка синхронизации HARD DELETE:`, err);
          serverSuccess = false;
        }
      }

      (window as any).loadTrashContent();
      _updateTrashCountReactive();

      if ((window as any).profileUI) {
        (window as any).profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
      }

      if ((window as any).chatUI) {
        (window as any).chatUI.refreshUI();
      }

      if ((window as any).uiRenderer) {
        if (serverSuccess) {
          (window as any).uiRenderer.showToast('🗑️ Чат удален навсегда и синхронизирован', 'info', 1500);
        } else {
          (window as any).uiRenderer.showToast('🗑️ Чат удален локально', 'info', 1500);
        }
      }

      console.log(`✅ Чат ${chatId} удален навсегда`);
    } catch (err) {
      console.error(`❌ Ошибка HARD DELETE чата ${chatId}:`, err);
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('Ошибка удаления чата');
      }
    }
  };

  if ((window as any).tg?.showConfirm) {
    (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
  } else if (confirm(confirmMsg)) {
    action();
  }
};

// ==========================================
// ОЧИСТКА ВСЕЙ КОРЗИНЫ
// ==========================================

(window as any).clearAllTrash = function(): void {
  if (!navigator.onLine) {
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert('Нет интернета. Очистка недоступна.');
    }
    return;
  }

  const confirmMsg = 'Очистить корзину полностью? Все чаты будут удалены навсегда!';

  const action = async () => {
    console.log('🗑️ Очищаем всю корзину...');

    const trash = chatStore.getTrash();
    const chatIds = trash.chats.map(c => c.id);

    for (const chatId of chatIds) {
      try {
        chatStore.permanentDeleteChat(chatId);

        if (userStore.canSync() && (window as any).chatService) {
          await (window as any).chatService.permanentDeleteChat(chatId);
        }
      } catch (err) {
        console.error(`❌ Ошибка удаления чата ${chatId}:`, err);
      }
    }

    (window as any).loadTrashContent();
    _updateTrashCountReactive();

    if ((window as any).profileUI) {
      (window as any).profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
    }

    if ((window as any).chatUI) {
      (window as any).chatUI.refreshUI();
    }

    console.log(`✅ Очищено ${chatIds.length} чатов`);

    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('🗑️ Корзина очищена', 'info', 1500);
    }
  };

  if ((window as any).tg?.showConfirm) {
    (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
  } else if (confirm(confirmMsg)) {
    action();
  }
};

// ==========================================
// ОБНОВЛЕНИЕ СЧЕТЧИКА
// ==========================================

(window as any).updateTrashCount = _updateTrashCountReactive;

// Первоначальное обновление счетчика
setTimeout(_updateTrashCountReactive, 1000);

console.log('✅ Trash module v2.0.1 загружен (TypeScript)');
