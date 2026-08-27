// ============================================
// src/modules/ui/profile-ui.ts
// Работа с модалками (Избранное, Корзина) + История чатов
// Версия: 7.2.0 - с использованием конфига
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { eventBus } from '@/core/event-bus';
import { navigationState } from '@/core/navigation-state';
import { modalManager } from '@/core/modal-manager';
import { 
  getActiveTopics, 
  getTopicLabel, 
  getTopicShortLabel, 
  getTopicIcon,
  getTopicEmoji,
  isValidTopic,
  type UUID, 
  type TopicId, 
  type TopicFilter, 
  type IFavoriteItem, 
  type IChat 
} from '@/config';

export class ProfileUI {
  private chatStore = chatStore;
  private userStore = userStore;
  private eventBus = eventBus;
  private navigationState = navigationState;
  private modalManager = modalManager;
  private _subscriptions: Array<() => void> = [];

  public currentFilter: TopicFilter = 'all';

  constructor() {
    this._subscribeToEvents();
    console.log('✅ ProfileUI v7.2.0 загружен');
  }

  private _subscribeToEvents(): void {
    const unsubFav = this.eventBus.on('chat:favorite_toggled', () => {
      if (this.modalManager.isOpen()) {
        this.renderFavoritesModal();
      }
    }, this);
    this._subscriptions.push(unsubFav);

    const unsubTrash = this.eventBus.on('chat:deleted', () => {
      if (this.modalManager.isOpen()) {
        this.renderTrashModal();
      }
    }, this);
    this._subscriptions.push(unsubTrash);

    const unsubRestore = this.eventBus.on('chat:restored', () => {
      if (this.modalManager.isOpen()) {
        this.renderTrashModal();
      }
    }, this);
    this._subscriptions.push(unsubRestore);

    const unsubAll = this.eventBus.on('chat:all_updated', () => {
      this.renderHistoryChatsList(this.currentFilter);
    }, this);
    this._subscriptions.push(unsubAll);

    const unsubCreated = this.eventBus.on('chat:created', () => {
      this.renderHistoryChatsList(this.currentFilter);
    }, this);
    this._subscriptions.push(unsubCreated);

    const unsubDeleted = this.eventBus.on('chat:deleted', () => {
      this.renderHistoryChatsList(this.currentFilter);
    }, this);
    this._subscriptions.push(unsubDeleted);

    const unsubRestored2 = this.eventBus.on('chat:restored', () => {
      this.renderHistoryChatsList(this.currentFilter);
    }, this);
    this._subscriptions.push(unsubRestored2);

    console.log('📡 ProfileUI подписан на события');
  }

  // ==========================================
  // ИЗБРАННОЕ
  // ==========================================

  showFavoritesModal(): void {
    const content = this._renderFavoritesContent();

    if (this.navigationState) {
      this.navigationState.toggleModal(true, 'favorites');
    }

    this.modalManager.open({
      title: '⭐ Избранное',
      content: content,
      modalId: 'favorites',
      onClose: () => {
        if (this.navigationState) {
          this.navigationState.toggleModal(false, 'favorites');
        }
      }
    });
  }

  private _renderFavoritesContent(): string {
    const favorites = this.chatStore.getFavorites();

    if (favorites.length === 0) {
      return `
        <div style="padding: 40px 20px; text-align: center; color: var(--app-text-tertiary);">
          <i data-lucide="heart" style="width:48px;height:48px;display:block;margin:0 auto 12px;opacity:0.3;"></i>
          <p style="font-size:14px;">У вас пока нет избранных ответов</p>
          <p style="font-size:12px;margin-top:4px;">Нажмите ❤️ на любом сообщении ИИ, чтобы добавить его в избранное</p>
        </div>
      `;
    }

    let html = `<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">`;

    for (const msg of favorites) {
      const cleanText = msg.text.replace(/[#*`]/g, '');
      const shortText = cleanText.length > 80 ? cleanText.substring(0, 80) + '...' : cleanText;
      const topicLabel = getTopicLabel(msg.topic);

      html += `
        <div class="fav-item" style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:12px 14px;
          background:var(--app-bg-tertiary);
          border-radius:12px;
          cursor:pointer;
          transition:all 0.2s;
          gap:12px;
        " onclick="window.profileUI._openChatFromFavorite('${msg.chat_id}', '${msg.topic}', '${msg.id}')">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--app-text-tertiary);margin-bottom:4px;font-weight:600;">
              <span>${getTopicEmoji(msg.topic)} ${topicLabel}</span>
              <span>📂 ${msg.chat_title}</span>
            </div>
            <div style="color:var(--app-text-primary);line-height:1.3;font-size:13px;word-break:break-word;">${shortText}</div>
          </div>
          <button class="fav-unfav-btn" style="
            background:transparent;
            border:none;
            font-size:18px;
            cursor:pointer;
            padding:4px;
            opacity:0.5;
            transition:all 0.2s;
            flex-shrink:0;
          " onclick="event.stopPropagation(); window.profileUI._unfavorite('${msg.chat_id}', '${msg.id}')">
            ❤️
          </button>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  private _openChatFromFavorite(chatId: UUID, topic: TopicId, msgId: UUID): void {
    console.log(`⭐ [favorite] Открываем чат из избранного: ${chatId}`);

    this.modalManager.forceClose();

    if ((window as any).closeDrawer) {
      (window as any).closeDrawer();
    } else {
      const drawer = document.getElementById('drawer');
      const overlay = document.getElementById('drawer-overlay');
      if (drawer?.classList.contains('active')) {
        drawer.classList.remove('active');
        overlay?.classList.remove('active');
        document.body.style.overflow = '';
      }
    }

    if (this.navigationState) {
      (this.navigationState as any)._state.isDrawerOpen = false;
      (this.navigationState as any)._state.modalStack = [];
      (this.navigationState as any)._state.isModalOpen = false;
      (this.navigationState as any)._updateBackButton();
    }

    if (this.navigationState) {
      this.navigationState.openChat(chatId, topic);
    } else {
      this.eventBus.emit('navigation:open_chat', { chatId, topic });
    }

    setTimeout(() => {
      const target = document.getElementById(`msg-block-${msgId}`);
      const container = document.getElementById('chat-container');
      if (container && target) {
        container.scrollTo({ top: Math.max(0, target.offsetTop - 80), behavior: 'smooth' });
        target.style.transition = 'background 0.5s';
        target.style.background = 'rgba(212,175,55,0.15)';
        setTimeout(() => (target.style.background = ''), 1500);
      }
    }, 500);
  }

  private async _unfavorite(chatId: UUID, msgId: UUID): Promise<void> {
    if ((window as any).messageService) {
      await (window as any).messageService.toggleFavorite(chatId, msgId);
    }
    this.renderFavoritesModal();
  }

  renderFavoritesModal(): void {
    if (this.modalManager.isOpen()) {
      const content = this._renderFavoritesContent();
      this.modalManager.updateContent(content);
    }
  }

  // ==========================================
  // КОРЗИНА
  // ==========================================

  showTrashModal(): void {
    const content = this._renderTrashContent();

    if (this.navigationState) {
      this.navigationState.toggleModal(true, 'trash');
    }

    this.modalManager.open({
      title: '🗑️ Корзина',
      content: content,
      modalId: 'trash',
      footer: `
        <button id="modal-save-btn" class="btn btn-danger" style="width:100%;">
          🗑️ Очистить корзину полностью
        </button>
      `,
      showFooter: true,
      onSave: () => {
        this._clearAllTrash();
      },
      onClose: () => {
        if (this.navigationState) {
          this.navigationState.toggleModal(false, 'trash');
        }
      }
    });
  }

  private _renderTrashContent(): string {
    const trash = this.chatStore.getTrash();
    const chats = trash.chats || [];

    if (chats.length === 0) {
      return `
        <div style="padding: 40px 20px; text-align: center; color: var(--app-text-tertiary);">
          <i data-lucide="trash-2" style="width:48px;height:48px;display:block;margin:0 auto 12px;opacity:0.3;"></i>
          <p style="font-size:14px;">Корзина пуста</p>
          <p style="font-size:12px;margin-top:4px;">Удалённые чаты будут появляться здесь</p>
        </div>
      `;
    }

    let html = `<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">`;

    for (const chat of chats) {
      const deletedDate = chat.deleted_at ? new Date(chat.deleted_at) : new Date();
      const dateStr = (window as any).formatDate ? (window as any).formatDate(deletedDate) : deletedDate.toLocaleString();
      const msgCount = chat.messages ? chat.messages.length : 0;
      const topicLabel = getTopicLabel(chat.topic);

      html += `
        <div class="trash-item" style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:12px 14px;
          background:var(--app-bg-tertiary);
          border-radius:12px;
          gap:10px;
          border:1px solid var(--app-border-color-light);
        ">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:500;font-size:13px;color:var(--app-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${chat.title || 'Без названия'}
            </div>
            <div style="font-size:11px;color:var(--app-text-tertiary);">
              ${topicLabel} • ${dateStr} • ${msgCount} сообщений
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn" style="padding:4px 10px;font-size:11px;border-radius:6px;background:#27ae60;color:white;border:none;cursor:pointer;"
                    onclick="window.profileUI._restoreFromTrash('${chat.id}')">
              ↩️
            </button>
            <button class="btn" style="padding:4px 10px;font-size:11px;border-radius:6px;background:#e74c3c;color:white;border:none;cursor:pointer;"
                    onclick="window.profileUI._permanentDelete('${chat.id}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  private async _restoreFromTrash(chatId: UUID): Promise<void> {
    const confirmMsg = 'Восстановить этот чат и все его сообщения?';

    const action = async () => {
      this.chatStore.restoreChat(chatId);

      if (this.userStore.canSync() && (window as any).chatService) {
        await (window as any).chatService.restoreChat(chatId);
      }

      this.renderTrashModal();

      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('♻️ Чат восстановлен', 'success', 1500);
      }
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  private async _permanentDelete(chatId: UUID): Promise<void> {
    const confirmMsg = 'Удалить чат навсегда? Это действие нельзя отменить!';

    const action = async () => {
      this.chatStore.permanentDeleteChat(chatId);

      if (this.userStore.canSync() && (window as any).chatService) {
        await (window as any).chatService.permanentDeleteChat(chatId);
      }

      this.renderTrashModal();

      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('🗑️ Чат удалён навсегда', 'info', 1500);
      }
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  private async _clearAllTrash(): Promise<void> {
    const confirmMsg = 'Очистить корзину полностью? Все чаты будут удалены навсегда!';

    const action = async () => {
      const trash = this.chatStore.getTrash();
      const chatIds = trash.chats.map(c => c.id);

      for (const chatId of chatIds) {
        this.chatStore.permanentDeleteChat(chatId);
        if (this.userStore.canSync() && (window as any).chatService) {
          await (window as any).chatService.permanentDeleteChat(chatId);
        }
      }

      this.renderTrashModal();

      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast(`🗑️ Очищено ${chatIds.length} чатов`, 'info', 1500);
      }
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  renderTrashModal(): void {
    if (this.modalManager.isOpen()) {
      const content = this._renderTrashContent();
      this.modalManager.updateContent(content);

      const footer = `
        <button id="modal-save-btn" class="btn btn-danger" style="width:100%;">
          🗑️ Очистить корзину полностью
        </button>
      `;
      this.modalManager.updateFooter(footer);
    }
  }

  // ==========================================
  // КОНТЕКСТ (ПАМЯТЬ ЧАТА)
  // ==========================================

  showContextModal(chatId: UUID): void {
    const found = this.chatStore.findChatById(chatId);
    if (!found) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Чат не найден');
      return;
    }

    const chat = found.chat;
    const currentValue = chat.maxContext || 15;

    if (this.navigationState) {
      this.navigationState.toggleModal(true, 'context');
    }

    const content = `
      <div style="padding:4px 0;">
        <p style="font-size:13px;color:var(--app-text-secondary);margin:0 0 12px 0;line-height:1.5;">
          🧠 <strong>Память чата</strong> определяет, сколько последних сообщений ИИ учитывает при ответе.
        </p>
        <div style="background:var(--app-bg-tertiary);padding:12px;border-radius:10px;margin-bottom:16px;">
          <div style="font-size:12px;color:var(--app-text-tertiary);line-height:1.6;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:16px;">⚡</span>
              <span><strong>Меньше</strong> — быстрей ответ и экономия токенов</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;">🧠</span>
              <span><strong>Больше</strong> — ИИ идеально помнит нить беседы</span>
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;color:var(--app-text-primary);">Текущее значение: <span id="context-display-value">${currentValue}</span></span>
          <span style="font-size:11px;color:var(--app-text-tertiary);">1-40</span>
        </div>
        <input type="range" id="context-slider-modal" min="1" max="40" value="${currentValue}" 
               style="width:100%;cursor:pointer;display:block;height:4px;border-radius:2px;background:var(--app-bg-tertiary);outline:none;"
               oninput="document.getElementById('context-display-value').textContent = this.value">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--app-text-tertiary);margin-top:2px;">
          <span>1 (Выкл)</span>
          <span>40 сообщений</span>
        </div>
      </div>
    `;

    const footer = `
      <button id="modal-save-btn" class="btn" style="width:100%;">💾 Сохранить</button>
    `;

    this.modalManager.open({
      title: '🧠 Память чата',
      content: content,
      modalId: 'context',
      footer: footer,
      showFooter: true,
      onSave: () => {
        const slider = document.getElementById('context-slider-modal') as HTMLInputElement;
        if (slider) {
          const newValue = parseInt(slider.value, 10);
          this._saveChatContext(chatId, newValue);
        }
      },
      onClose: () => {
        if (this.navigationState) {
          this.navigationState.toggleModal(false, 'context');
        }
      }
    });
  }

  private async _saveChatContext(chatId: UUID, value: number): Promise<void> {
    const found = this.chatStore.findChatById(chatId);
    if (!found) return;

    found.chat.maxContext = value;
    this.chatStore.save();

    if (this.userStore.canSync() && (window as any).chatService) {
      await (window as any).chatService.updateContext(chatId, value);
    }

    this.modalManager.close();

    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast(`🧠 Память обновлена: ${value} сообщений`, 'success', 1500);
    }
  }

  // ==========================================
  // ✅ ИСПРАВЛЕНО: ИСТОРИЯ ЧАТОВ (с использованием конфига)
  // ==========================================

  renderHistoryChatsList(filter: TopicFilter): void {
    const container = document.getElementById('history-chats-list');
    if (!container) return;

    this.currentFilter = filter;

    const allChats: (IChat & { topic: TopicId })[] = [];
    
    const entries = Object.entries(this.chatStore.histories || {}) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
      if (!chats) continue;
      for (const chat of chats) {
        if (chat.deleted_at) continue;
        if (!this.chatStore.hasRealMessages(chat)) continue;
        if (filter !== 'all' && chat.topic !== filter) continue;
        allChats.push({
          ...chat,
          topic: topic
        });
      }
    }

    allChats.sort((a, b) => {
      const aTime = a.updated_at || a.created_at || '';
      const bTime = b.updated_at || b.created_at || '';
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    container.innerHTML = '';

    if (allChats.length === 0) {
      container.innerHTML = `
        <p style="font-size:13px;color:var(--app-text-tertiary);text-align:center;padding:20px 0;">
          ${filter === 'all' ? 'Нет чатов. Начните новый диалог!' : `Нет чатов в разделе ${getTopicLabel(filter as TopicId)}`}
        </p>
      `;
      return;
    }

    for (const chat of allChats) {
      const item = document.createElement('div');
      item.className = 'chat-history-item';
      item.style.cssText = `
        padding: 12px 16px;
        background: var(--app-bg-secondary);
        border-radius: 12px;
        cursor: pointer;
        border: 1px solid var(--app-border-color-light);
        transition: all 0.2s ease;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const lastMsg = chat.messages && chat.messages.length > 0
        ? chat.messages[chat.messages.length - 1]
        : null;
      const preview = lastMsg ? lastMsg.text.substring(0, 60) + (lastMsg.text.length > 60 ? '...' : '') : 'Пустой чат';
      const timeStr = (window as any).formatDate ? (window as any).formatDate(chat.updated_at || chat.created_at) : '';

      item.innerHTML = `
        <div style="flex:1;overflow:hidden;">
          <div style="
            font-weight: 500;
            font-size: 14px;
            color: var(--app-text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">
            ${chat.title || 'Без названия'}
          </div>
          <div style="
            font-size: 12px;
            color: var(--app-text-tertiary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">
            ${preview}
          </div>
        </div>
        <div style="
          font-size: 11px;
          color: var(--app-text-tertiary);
          flex-shrink: 0;
          margin-left: 12px;
        ">
          ${timeStr}
        </div>
      `;

      item.addEventListener('click', () => {
        this.eventBus.emit('navigation:open_chat', {
          chatId: chat.id,
          topic: chat.topic
        });
      });

      container.appendChild(item);
    }
  }

  updateChatTitle(chatId: UUID, newTitle: string): void {
    const found = this.chatStore.findChatById(chatId);
    if (!found) return;
    found.chat.title = newTitle;
    this.chatStore.save();
    this.renderHistoryChatsList(this.currentFilter);
  }

  // ==========================================
  // ОЧИСТКА ПОДПИСОК
  // ==========================================

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки ProfileUI:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 ProfileUI отписан от событий');
  }
}

// Создаем экземпляр
export const profileUI = new ProfileUI();
console.log('✅ ProfileUI v7.2.0 загружен');
