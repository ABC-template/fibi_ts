// ============================================
// src/modules/chat/ChatModule.ts
// Страница чата (открывается из ChatListModule)
// Версия: 8.8.0 - динамическая загрузка voice.ts и media.ts
// ============================================

import { chatStore } from '@/store/ChatStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { navigationState } from '@/core/navigation-state';
import { moduleLoader } from '@/core/module-loader';
import { uiRenderer } from '@/modules/ui/renderer';
import { 
  getWelcomeText, 
  getTopic, 
  isValidTopic,
  type IChat, 
  type TopicId, 
  type UUID 
} from '@/config';

export class ChatModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private chatStore = chatStore;
  private uiRenderer = uiRenderer;
  private eventBus = eventBus;
  private headerManager = headerManager;
  private navigationState = navigationState;
  private moduleLoader = moduleLoader;

  private _chatId: UUID | null = null;
  private _topic: TopicId | null = null;
  private _subscriptions: Array<() => void> = [];
  private _rendered: boolean = false;
  private _isShowing: boolean = false;
  private _voiceLoaded: boolean = false;
  private _mediaLoaded: boolean = false;
  
  private _delegationHandler: ((e: Event) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).chatModule = this;
    this._subscribeToEvents();
    this.isInitialized = true;

    console.log('✅ ChatModule v8.8.0 инициализирован');
  }

  // ==========================================
  // ГАРАНТИРУЕТ ЗАГРУЗКУ voice.ts
  // ==========================================

  private async _ensureVoiceFunction(): Promise<void> {
    if (typeof (window as any).toggleVoiceRecording === 'function') {
      return;
    }

    if (this._voiceLoaded) {
      console.warn('⚠️ voice.ts загружался, но функция не определена. Пробуем повторно...');
    }

    console.log('📦 Динамическая загрузка voice.ts...');

    try {
      await import('./voice');
      
      await new Promise(resolve => setTimeout(resolve, 10));

      if (typeof (window as any).toggleVoiceRecording !== 'function') {
        throw new Error('toggleVoiceRecording не определена после импорта');
      }

      this._voiceLoaded = true;
      console.log('✅ voice.ts успешно загружен динамически');
    } catch (err) {
      console.error('❌ Ошибка загрузки voice.ts:', err);
    }
  }

  // ==========================================
  // ✅ НОВЫЙ МЕТОД: ГАРАНТИРУЕТ ЗАГРУЗКУ media.ts
  // ==========================================

  private async _ensureMediaFunction(): Promise<void> {
    if (typeof (window as any).triggerMediaSelector === 'function') {
      return;
    }

    if (this._mediaLoaded) {
      console.warn('⚠️ media.ts загружался, но функция не определена. Пробуем повторно...');
    }

    console.log('📦 Динамическая загрузка media.ts...');

    try {
      await import('./media');
      
      await new Promise(resolve => setTimeout(resolve, 10));

      if (typeof (window as any).triggerMediaSelector !== 'function') {
        throw new Error('triggerMediaSelector не определена после импорта');
      }

      this._mediaLoaded = true;
      console.log('✅ media.ts успешно загружен динамически');
    } catch (err) {
      console.error('❌ Ошибка загрузки media.ts:', err);
    }
  }

  // ==========================================
  // ДЕЛЕГИРОВАНИЕ СОБЫТИЙ
  // ==========================================

  private _setupDelegation(): void {
    if (this._delegationHandler) {
      this.container.removeEventListener('click', this._delegationHandler);
      this._delegationHandler = null;
    }

    this._delegationHandler = async (event: Event) => {
      const target = event.target as HTMLElement;
      
      // ==========================================
      // 1. КНОПКА МИКРОФОНА (.voice-btn)
      // ==========================================
      const voiceBtn = target.closest('.voice-btn') as HTMLElement;
      if (voiceBtn) {
        console.log('🎙️ Делегирование: нажата кнопка микрофона');
        
        await this._ensureVoiceFunction();
        
        if ((window as any).toggleVoiceRecording) {
          (window as any).toggleVoiceRecording(voiceBtn);
        } else {
          console.error('❌ toggleVoiceRecording не определена после загрузки');
          if ((window as any).tg?.showAlert) {
            (window as any).tg.showAlert('Голосовой ввод временно недоступен. Попробуйте позже.');
          }
        }
        return;
      }

      // ==========================================
      // 2. КНОПКА МЕДИА (.media-btn)
      // ==========================================
      const mediaBtn = target.closest('.media-btn') as HTMLElement;
      if (mediaBtn) {
        console.log('📎 Делегирование: нажата кнопка медиа');
        
        // ✅ ГАРАНТИРУЕМ ЗАГРУЗКУ media.ts ПЕРЕД ВЫЗОВОМ
        await this._ensureMediaFunction();
        
        if ((window as any).triggerMediaSelector) {
          (window as any).triggerMediaSelector();
        } else {
          console.error('❌ triggerMediaSelector не определена после загрузки');
          if ((window as any).tg?.showAlert) {
            (window as any).tg.showAlert('Отправка изображений временно недоступна. Попробуйте позже.');
          }
        }
        return;
      }

      // ==========================================
      // 3. КНОПКА ОТПРАВКИ (.send-btn)
      // ==========================================
      const sendBtn = target.closest('.send-btn') as HTMLElement;
      if (sendBtn) {
        console.log('📤 Делегирование: нажата кнопка отправки');
        this.eventBus.emit('chat:send-message');
        return;
      }

      // ==========================================
      // 4. КНОПКА РАСШИРЕНИЯ ВВОДА (#fab-open-input)
      // ==========================================
      const fabBtn = target.closest('#fab-open-input') as HTMLElement;
      if (fabBtn) {
        console.log('🔧 Делегирование: нажата FAB кнопка');
        this.eventBus.emit('input:expand');
        return;
      }

      // ==========================================
      // 5. DATA-ACTION КНОПКИ (избранное, копирование, удаление, шаринг)
      // ==========================================
      const actionBtn = target.closest('[data-action]') as HTMLElement;
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const msgId = actionBtn.dataset.msgId as UUID;
        const chatId = actionBtn.dataset.chatId as UUID || this._chatId;

        console.log(`🔴 Действие: ${action}, msgId: ${msgId}`);

        switch (action) {
          case 'toggle-favorite':
            this.eventBus.emit('chat:toggle-favorite', { msgId, chatId, btn: actionBtn });
            break;
          case 'delete-message':
            this.eventBus.emit('chat:delete-message', { msgId, chatId });
            break;
          case 'copy-message':
            this.eventBus.emit('chat:copy-message', { msgId, btn: actionBtn });
            break;
          case 'share-message':
            this.eventBus.emit('chat:share-message', { msgId, btn: actionBtn });
            break;
          default:
            console.log(`ℹ️ Неизвестное действие: ${action}`);
        }
        return;
      }

      // ==========================================
      // 6. ВСЕ ОСТАЛЬНЫЕ КЛИКИ — ПРОПУСКАЕМ
      // ==========================================
    };

    this.container.addEventListener('click', this._delegationHandler);
    console.log('✅ Обработчик делегирования настроен');
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToEvents(): void {
    const unsubMsg = this.eventBus.on('chat:message_added', (data) => {
      if (data.chatId === this._chatId && this._isShowing) {
        this._loadMessages();
      }
    }, this);
    this._subscriptions.push(unsubMsg);

    const unsubDel = this.eventBus.on('chat:message_deleted', (data) => {
      if (data.chatId === this._chatId && this._isShowing) {
        this._loadMessages();
      }
    }, this);
    this._subscriptions.push(unsubDel);

    const unsubFav = this.eventBus.on('chat:favorite_toggled', (data) => {
      if (data.chatId === this._chatId && this._isShowing) {
        this._loadMessages();
      }
    }, this);
    this._subscriptions.push(unsubFav);

    const unsubRename = this.eventBus.on('chat:renamed', (data) => {
      if (data.chatId === this._chatId) {
        this._updateHeader();
      }
    }, this);
    this._subscriptions.push(unsubRename);

    const unsubAll = this.eventBus.on('chat:all_updated', () => {
      if (this._isShowing && this._chatId) {
        this._loadMessages();
      }
    }, this);
    this._subscriptions.push(unsubAll);

    const unsubOpen = this.eventBus.on('navigation:open_chat', (data) => {
      if (data.chatId && this._isShowing) {
        this.update(data);
      }
    }, this);
    this._subscriptions.push(unsubOpen);

    console.log('📡 ChatModule подписан на события');
  }

  // ==========================================
  // ПОКАЗАТЬ МОДУЛЬ
  // ==========================================

  async show(params: Record<string, any> = {}): Promise<void> {
    console.log('📱 ChatModule.show()', params);

    const { chatId, topic } = params;

    if (chatId) {
      this._openChat(chatId, topic);
    } else {
      const activeChat = this.chatStore.getActiveChat();
      if (activeChat && this.chatStore.hasRealMessages(activeChat)) {
        this._openChat(activeChat.id, activeChat.topic || this.chatStore.currentTopic);
      } else {
        const newChat = this.chatStore.createTempChat(this.chatStore.currentTopic);
        if (newChat) {
          this._openChat(newChat.id, newChat.topic || this.chatStore.currentTopic);
        } else {
          console.error('❌ Не удалось создать чат');
        }
      }
    }

    this._setupDelegation();
  }

  // ==========================================
  // ОТКРЫТЬ ЧАТ
  // ==========================================

  private _openChat(chatId: UUID, topic?: TopicId): void {
    if (!chatId) {
      console.warn('⚠️ _openChat: нет chatId');
      return;
    }

    console.log(`📂 _openChat: ${chatId}, topic: ${topic}`);

    this._chatId = chatId;
    this._topic = topic || this.chatStore.currentTopic;

    if (this._topic) {
      this.chatStore.currentTopic = this._topic;
      console.log(`🔄 currentTopic установлен в: ${this._topic}`);
    }

    if (!this._rendered) {
      this._render();
    }

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    if ((window as any).navigation) {
      (window as any).navigation.hide();
    }

    this._updateHeader();
    this._loadMessages();

    this._isShowing = true;
    this.chatStore.setActiveChat(this._topic!, this._chatId);

    console.log(`✅ Чат ${this._chatId} открыт (topic: ${this._topic})`);
  }

  // ==========================================
  // ОБНОВЛЕНИЕ ЧАТА
  // ==========================================

  update(params: Record<string, any> = {}): void {
    const { chatId, topic } = params;

    if (!chatId) {
      console.warn('⚠️ ChatModule.update: нет chatId');
      return;
    }

    if (this._chatId !== chatId) {
      console.log(`🔄 Переключение с ${this._chatId} на ${chatId}`);
      this._openChat(chatId, topic);
    } else {
      this._loadMessages();
      this._updateHeader();
    }
  }

  // ==========================================
  // РЕНДЕРИНГ
  // ==========================================

  private _render(): void {
    if (this._rendered) return;

    this.container.innerHTML = `
      <div id="chat-page" style="
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100%;
        animation: fadeIn 0.3s ease;
        position: relative;
      ">
        <div id="chat-container" style="
          flex: 1;
          overflow-y: auto;
          padding: 8px 8px 120px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 0;
          width: 100%;
          -webkit-overflow-scrolling: touch;
        "></div>

        <button id="fab-open-input" style="
          position: fixed;
          bottom: calc(var(--tg-safe-bottom, 0px) + 80px);
          right: 16px;
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: var(--app-gradient-primary);
          color: #fff;
          border: none;
          box-shadow: 0 4px 20px rgba(108,99,255,0.3);
          cursor: pointer;
          z-index: 97;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <i data-lucide="chevron-up" style="width:26px;height:26px;"></i>
        </button>

        <div id="input-overlay" class="hidden"></div>

        <div id="input-area" class="input-area-hidden">
          <div style="position:relative;width:100%;display:flex;align-items:flex-start;">
            <textarea id="user-input" placeholder="Ваш вопрос..." rows="1" style="
              width: 100%;
              border: none;
              outline: none;
              background: transparent;
              color: var(--app-text-primary);
              font-size: 16px;
              font-family: var(--app-font-family);
              max-height: 140px;
              overflow-y: auto;
              display: block;
              padding: 0 28px 0 0;
              margin: 0;
              border-radius: 0;
              line-height: 1.5;
              resize: none;
            "></textarea>
            <button id="clear-input-btn" class="hidden" style="
              position: absolute;
              right: 0;
              top: 0;
              background: transparent;
              border: none;
              outline: none;
              color: var(--app-text-tertiary);
              cursor: pointer;
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0;
              opacity: 0.7;
            ">
              <i data-lucide="x" style="width:18px;height:18px;"></i>
            </button>
          </div>
          <div class="input-footer-bar" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            height: 38px;
            margin-top: 4px;
          ">
            <div class="footer-btn-group left-group" style="
              display: flex;
              align-items: center;
              height: 38px;
              gap: 4px;
            ">
              <button class="footer-action-btn media-btn" style="
                display: inline-flex;
                width: 38px;
                height: 38px;
                border-radius: 50%;
                align-items: center;
                justify-content: center;
                padding: 0;
                border: none;
                background: var(--app-bg-tertiary);
                color: var(--app-text-secondary);
                cursor: pointer;
              ">
                <i data-lucide="paperclip" style="width:20px;height:20px;"></i>
              </button>
            </div>
            <div class="footer-btn-group right-group" style="
              display: flex;
              align-items: center;
              height: 38px;
              gap: 4px;
            ">
              <span id="voice-timer" class="hidden" style="
                font-size: 13px;
                font-weight: 600;
                color: var(--app-text-tertiary);
                margin-right: 2px;
              ">15s</span>
              <button class="footer-action-btn voice-btn" style="
                display: inline-flex;
                width: 38px;
                height: 38px;
                border-radius: 50%;
                align-items: center;
                justify-content: center;
                padding: 0;
                border: none;
                background: var(--app-bg-tertiary);
                color: var(--app-text-secondary);
                cursor: pointer;
              ">
                <i data-lucide="mic" style="width:20px;height:20px;"></i>
              </button>
              <button class="footer-action-btn send-btn" style="
                display: inline-flex;
                width: 38px;
                height: 38px;
                border-radius: 50%;
                align-items: center;
                justify-content: center;
                padding: 0;
                border: none;
                background: var(--app-gradient-primary);
                color: #fff;
                cursor: pointer;
              ">
                <i data-lucide="send" style="width:20px;height:20px;"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._rendered = true;
  }

  // ==========================================
  // ЗАГРУЗКА СООБЩЕНИЙ
  // ==========================================

  private _loadMessages(): void {
    const container = document.getElementById('chat-container');
    if (!container) {
      console.warn('⚠️ _loadMessages: chat-container не найден');
      return;
    }

    if (!this._chatId) {
      console.warn('⚠️ _loadMessages: нет chatId');
      return;
    }

    const found = this.chatStore.findChatById(this._chatId);
    if (!found) {
      console.warn(`⚠️ Чат ${this._chatId} не найден`);
      container.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--app-text-tertiary);">
          <div style="font-size:48px;margin-bottom:12px;">💬</div>
          <div>Чат не найден</div>
        </div>
      `;
      return;
    }

    const { chat } = found;
    const messages = chat.messages || [];

    console.log(`📋 Загружено ${messages.length} сообщений для чата ${this._chatId}`);

    container.innerHTML = '';

    if (messages.length === 0) {
      this._showWelcomeMessage(container);
      return;
    }

    const sortedMessages = [...messages].sort((a, b) => {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });

    let renderedCount = 0;
    for (const msg of sortedMessages) {
      if (msg.deleted_at) continue;

      const msgDiv = this.uiRenderer.renderMessage(
        msg.text,
        msg.type,
        msg.id,
        msg.isFavorite || false
      );

      if (msgDiv) {
        container.appendChild(msgDiv);
        renderedCount++;
      }
    }

    console.log(`✅ Отрендерено ${renderedCount} сообщений`);

    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 100);
  }

  private _showWelcomeMessage(container: HTMLElement): void {
    const topic = this._topic || 'code';
    const welcomeText = getWelcomeText(topic);
    this.uiRenderer.renderWelcome(welcomeText);
  }

  // ==========================================
  // ОБНОВЛЕНИЕ ЗАГОЛОВКА
  // ==========================================

  private _updateHeader(): void {
    if (!this._chatId || !this.headerManager) return;

    const found = this.chatStore.findChatById(this._chatId);
    if (!found) return;

    const chatTitle = found.chat.title || 'Versatile AI';

    this.headerManager.setTitle(chatTitle);
    this.headerManager.setActions([
      {
        id: 'context',
        icon: 'brain',
        title: 'Память чата',
        onClick: () => {
          this.eventBus.emit('modal:show_context', { chatId: this._chatId });
        }
      },
      {
        id: 'new-chat',
        icon: 'message-square-plus',
        title: 'Новый чат',
        onClick: () => {
          const newChat = this.chatStore.createTempChat(this._topic!);
          if (newChat) {
            this.eventBus.emit('navigation:open_chat', {
              chatId: newChat.id,
              topic: this._topic
            });
          }
        }
      }
    ]);
  }

  // ==========================================
  // СКРЫТЬ МОДУЛЬ
  // ==========================================

  hide(): void {
    console.log('📱 ChatModule.hide()');
    this._isShowing = false;
    this.container.classList.add('hidden');
    this.container.style.display = 'none';

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }
  }

  // ==========================================
  // УНИЧТОЖЕНИЕ
  // ==========================================

  destroy(): void {
    console.log('🗑️ ChatModule.destroy()');

    if (this._delegationHandler) {
      this.container.removeEventListener('click', this._delegationHandler);
      this._delegationHandler = null;
      console.log('🧹 Обработчик делегирования удален при destroy');
    }

    (window as any).chatModule = null;

    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки ChatModule:', e);
      }
    }
    this._subscriptions = [];
    this._rendered = false;
    this._chatId = null;
    this._topic = null;
    this._isShowing = false;
    this.container.innerHTML = '';
  }
}

(window as any).ChatModule = ChatModule;
console.log('✅ ChatModule v8.8.0 загружен');
