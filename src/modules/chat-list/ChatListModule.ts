// ============================================
// src/modules/chat-list/ChatListModule.ts
// Список чатов (стартовый экран раздела Versatile)
// Версия: 5.1.0 - с использованием конфига
// ============================================

import { chatStore } from '@/store/ChatStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { navigationState } from '@/core/navigation-state';
import { moduleLoader } from '@/core/module-loader';
import { 
  getActiveTopics, 
  getTopicShortLabel, 
  getTopicIcon,
  isValidTopic,
  type IChat, 
  type TopicId 
} from '@/config';

export class ChatListModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private chatStore = chatStore;
  private eventBus = eventBus;
  private headerManager = headerManager;
  private navigationState = navigationState;
  private moduleLoader = moduleLoader;
  private _subscriptions: Array<() => void> = [];
  private _rendered: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this._subscribeToDataEvents();
    this.isInitialized = true;
    console.log('✅ ChatListModule v5.1.0 инициализирован');
  }

  // ==========================================
  // ПОКАЗАТЬ МОДУЛЬ
  // ==========================================

  show(params: Record<string, any> = {}): void {
    console.log('📱 ChatListModule.show()');

    if (!this._rendered) {
      this._render();
    } else {
      this._refreshContent();
    }

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    if ((window as any).navigation) {
      (window as any).navigation.show();
      (window as any).navigation.setActive('chat-list');
    }

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);
  }

  // ==========================================
  // СКРЫТЬ МОДУЛЬ
  // ==========================================

  hide(): void {
    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  // ==========================================
  // ✅ ИСПРАВЛЕНО: РЕНДЕРИНГ (с использованием конфига)
  // ==========================================

  private _render(): void {
    if (this._rendered) return;

    this.container.innerHTML = `
      <div id="chatlist-start" style="
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        padding-bottom: 100px;
        animation: fadeIn 0.3s ease;
        display: flex;
        flex-direction: column;
        height: 100%;
      ">
        <h2 style="
          font-size: 20px;
          font-weight: 700;
          color: var(--app-text-primary);
          margin: 0 0 4px 0;
        ">
          Versatile AI
        </h2>
        <p style="
          font-size: 14px;
          color: var(--app-text-tertiary);
          margin: 0 0 20px 0;
        ">
          Выберите тему для нового чата или продолжите диалог
        </p>

        <div style="margin-bottom: 20px;">
          <div style="
            font-size: 13px;
            font-weight: 600;
            color: var(--app-text-secondary);
            margin-bottom: 10px;
          ">
            📌 Темы
          </div>
          <div id="chatlist-topics" style="
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          "></div>
        </div>

        <div style="flex: 1;">
          <div style="
            font-size: 13px;
            font-weight: 600;
            color: var(--app-text-secondary);
            margin-bottom: 10px;
          ">
            🕐 Последние чаты
          </div>
          <div id="chatlist-recent-chats" style="
            display: flex;
            flex-direction: column;
            gap: 8px;
          "></div>
        </div>
      </div>
    `;

    this._renderTopics();
    this._renderRecentChats();
    this._rendered = true;
  }

  private _refreshContent(): void {
    this._renderRecentChats();
  }

  // ==========================================
  // ✅ ИСПРАВЛЕНО: ТЕМЫ (из конфига)
  // ==========================================

  private _renderTopics(): void {
    const container = document.getElementById('chatlist-topics');
    if (!container) return;

    // ✅ ИСПРАВЛЕНО: получаем темы из конфига
    const topics = getActiveTopics();

    container.innerHTML = '';

    for (const topic of topics) {
      const chip = document.createElement('button');
      chip.className = 'filter-chip';
      chip.textContent = `${topic.icon} ${topic.shortLabel}`;
      chip.dataset.topic = topic.id;
      chip.style.cssText = `
        padding: 6px 16px;
        border-radius: 20px;
        border: 1px solid var(--app-border-color, rgba(212,175,55,0.15));
        background: var(--app-bg-tertiary, rgba(40,40,40,0.6));
        color: var(--app-text-secondary, #E8E0D0);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: var(--app-font-family, -apple-system, sans-serif);
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      `;

      chip.addEventListener('click', () => {
        this._createChatWithTopic(topic.id);
      });
      container.appendChild(chip);
    }
  }

  // ==========================================
  // ПОСЛЕДНИЕ ЧАТЫ
  // ==========================================

  private _renderRecentChats(): void {
    const container = document.getElementById('chatlist-recent-chats');
    if (!container) return;

    const allChats: (IChat & { topic: TopicId })[] = [];
    for (const [topic, chats] of Object.entries(this.chatStore.histories || {})) {
      if (!chats) continue;
      for (const chat of chats) {
        if (chat.deleted_at) continue;
        if (!this.chatStore.hasRealMessages(chat)) continue;
        allChats.push({
          ...chat,
          topic: topic as TopicId
        });
      }
    }

    allChats.sort((a, b) => {
      const aTime = a.updated_at || a.created_at || '';
      const bTime = b.updated_at || b.created_at || '';
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    const recent = allChats.slice(0, 5);

    if (recent.length === 0) {
      container.innerHTML = `
        <p style="
          font-size: 13px;
          color: var(--app-text-tertiary);
          text-align: center;
          padding: 20px 0;
        ">
          Нет чатов. Начните новый диалог!
        </p>
      `;
      return;
    }

    container.innerHTML = '';

    for (const chat of recent) {
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

  // ==========================================
  // ДЕЙСТВИЯ
  // ==========================================

  private _createChatWithTopic(topic: TopicId): void {
    console.log(`➕ Создаём чат с темой: ${topic}`);

    const chat = this.chatStore.createTempChat(topic);
    if (chat) {
      chat.topic = topic;
      this.chatStore.save();

      this.eventBus.emit('navigation:open_chat', {
        chatId: chat.id,
        topic: topic
      });
    }
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToDataEvents(): void {
    const update = () => {
      if (this._rendered) {
        this._refreshContent();
      }
    };

    const unsub1 = this.eventBus.on('chat:all_updated', update, this);
    this._subscriptions.push(unsub1);

    const unsub2 = this.eventBus.on('chat:created', update, this);
    this._subscriptions.push(unsub2);

    const unsub3 = this.eventBus.on('chat:deleted', update, this);
    this._subscriptions.push(unsub3);

    const unsub4 = this.eventBus.on('chat:restored', update, this);
    this._subscriptions.push(unsub4);

    const unsub5 = this.eventBus.on('chat:renamed', update, this);
    this._subscriptions.push(unsub5);

    console.log('📡 ChatListModule подписан на события данных');
  }

  // ==========================================
  // УНИЧТОЖЕНИЕ
  // ==========================================

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки ChatListModule:', e);
      }
    }
    this._subscriptions = [];
    this._rendered = false;
    this.container.innerHTML = '';
    console.log('🗑️ ChatListModule уничтожен');
  }
}

// Экспортируем класс в глобальный объект
(window as any).ChatListModule = ChatListModule;
console.log('✅ ChatListModule v5.1.0 загружен');
