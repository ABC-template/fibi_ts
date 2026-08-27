// ============================================
// src/modules/chat/ChatModule.ts
// Страница чата (с индикатором токенов)
// Версия: 8.10.0 - добавлен индикатор токенов
// ============================================
import './chat.css';
import { chatStore } from '@/store/ChatStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { navigationState } from '@/core/navigation-state';
import { moduleLoader } from '@/core/module-loader';
import { uiRenderer } from '@/modules/ui/renderer';
import { ChatPatcher } from './ChatPatcher';
import { economyStore } from '@/economy/EconomyStore';
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
  private economyStore = economyStore;

  private _chatId: UUID | null = null;
  private _topic: TopicId | null = null;
  private _subscriptions: Array<() => void> = [];
  private _rendered: boolean = false;
  private _isShowing: boolean = false;
  private _voiceLoaded: boolean = false;
  private _mediaLoaded: boolean = false;
  
  private _patcher: ChatPatcher | null = null;
  private _delegationHandler: ((e: Event) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).chatModule = this;
    this._subscribeToEvents();
    this.isInitialized = true;

    console.log('✅ ChatModule v8.10.0 инициализирован (с индикатором токенов)');
  }

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

  private _setupDelegation(): void {
    if (this._delegationHandler) {
      this.container.removeEventListener('click', this._delegationHandler);
      this._delegationHandler = null;
    }

    this._delegationHandler = async (event: Event) => {
      const target = event.target as HTMLElement;
      
      const voiceBtn = target.closest('.voice-btn') as HTMLElement;
      if (voiceBtn) {
        console.log('🎙️ Делегирование: нажата кнопка микрофона');
        await this._ensureVoiceFunction();
        if ((window as any).toggleVoiceRecording) {
          (window as any).toggleVoiceRecording(voiceBtn);
        }
        return;
      }

      const mediaBtn = target.closest('.media-btn') as HTMLElement;
      if (mediaBtn) {
        console.log('📎 Делегирование: нажата кнопка медиа');
        await this._ensureMediaFunction();
        if ((window as any).triggerMediaSelector) {
          (window as any).triggerMediaSelector();
        }
        return;
      }

      const sendBtn = target.closest('.send-btn') as HTMLElement;
      if (sendBtn) {
        console.log('📤 Делегирование: нажата кнопка отправки');
        this.eventBus.emit('chat:send-message');
        return;
      }

      const fabBtn = target.closest('#fab-open-input') as HTMLElement;
      if (fabBtn) {
        console.log('🔧 Делегирование: нажата FAB кнопка');
        this.eventBus.emit('input:expand');
        return;
      }

      const actionBtn = target.closest('[data-action]') as HTMLElement;
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const msgId = actionBtn.dataset.msgId as UUID;
        const chatId = actionBtn.dataset.chatId as UUID || this._chatId;

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
    };

    this.container.addEventListener('click', this._delegationHandler);
    console.log('✅ Обработчик делегирования настроен');
  }

  private _subscribeToEvents(): void {
    const unsubFav = this.eventBus.on('chat:favorite_toggled', (data) => {
      if (data.chatId === this._chatId && this._isShowing && this._patcher) {
        console.log(`📡 [ChatModule] Точечное обновление избранного: ${data.messageId}`);
        this._patcher.updateFavorite(data.messageId, data.isFavorite);
      }
    }, this);
    this._subscriptions.push(unsubFav);

    const unsubDel = this.eventBus.on('chat:message_deleted', (data) => {
      if (data.chatId === this._chatId && this._isShowing && this._patcher) {
        console.log(`📡 [ChatModule] Точечное удаление: ${data.messageId}`);
        this._patcher.removeMessage(data.messageId);
      }
    }, this);
    this._subscriptions.push(unsubDel);

    const unsubAdd = this.eventBus.on('chat:message_added', (data) => {
      if (data.chatId === this._chatId && this._isShowing && this._patcher) {
        console.log(`📡 [ChatModule] Точечное добавление: ${data.message.id}`);
        this._patcher.addMessage(data.message);
      }
    }, this);
    this._subscriptions.push(unsubAdd);

    const unsubUpdate = this.eventBus.on('chat:message_updated', (data) => {
      if (data.chatId === this._chatId && this._isShowing && this._patcher) {
        console.log(`📡 [ChatModule] Точечное обновление текста: ${data.messageId}`);
        this._patcher.updateMessageText(data.messageId, data.text);
      }
    }, this);
    this._subscriptions.push(unsubUpdate);

    const unsubRename = this.eventBus.on('chat:renamed', (data) => {
      if (data.chatId === this._chatId) {
        this._updateHeader();
      }
    }, this);
    this._subscriptions.push(unsubRename);

    const unsubOpen = this.eventBus.on('navigation:open_chat', (data) => {
      if (data.chatId && this._isShowing) {
        this.update(data);
      }
    }, this);
    this._subscriptions.push(unsubOpen);

    // ✅ Подписка на обновление токенов
    const unsubTokens = this.eventBus.on('economy:tokens:updated', () => {
      if (this._isShowing) {
        this._updateTokenIndicator();
      }
    }, this);
    this._subscriptions.push(unsubTokens);

    console.log('📡 ChatModule подписан на события (с индикатором токенов)');
  }

  private _updateTokenIndicator(): void {
    const indicator = document.getElementById('token-indicator');
    if (!indicator) return;

    const tokens = this.economyStore.getTokenBalances();
    
    if (tokens.total > 0) {
      indicator.innerHTML = `
        <span class="token-badge" title="Бонусные токены">
          🎁 ${tokens.bonus}
        </span>
        <span class="token-badge" title="Постоянные токены">
          💎 ${tokens.permanent}
        </span>
        <span class="token-badge total" title="Всего токенов">
          ⚡ ${tokens.total}
        </span>
      `;
      indicator.style.display = 'flex';
    } else {
      indicator.innerHTML = `
        <span class="token-badge empty" title="Нет токенов">
          ⚡ 0
        </span>
      `;
      indicator.style.display = 'flex';
    }
  }

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

  private _openChat(chatId: UUID, topic?: TopicId): void {
    if (!chatId) {
      console.warn('⚠️ _openChat: нет chatId');
      return;
    }

    const found = this.chatStore.findChatById(chatId);
    if (!found) {
      console.error(`❌ Чат ${chatId} не найден`);
      return;
    }

    const actualTopic = found.chat.topic || topic || this.chatStore.currentTopic;

    console.log(`📂 _openChat: ${chatId}, topic: ${actualTopic} (из чата)`);

    this._chatId = chatId;
    this._topic = actualTopic;

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
    this._updateTokenIndicator();

    this._isShowing = true;
    this.chatStore.setActiveChat(actualTopic, this._chatId);

    console.log(`✅ Чат ${this._chatId} открыт (topic: ${actualTopic})`);
  }

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
      if (this._patcher) {
        const found = this.chatStore.findChatById(chatId);
        if (found) {
          this._patcher.renderAll(found.chat.messages || []);
        }
      } else {
        this._loadMessages();
      }
      this._updateHeader();
      this._updateTokenIndicator();
    }
  }

  private _render(): void {
    if (this._rendered) return;

    const tokens = this.economyStore.getTokenBalances();

    this.container.innerHTML = `
      <div id="chat-page" style="
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100%;
        animation: fadeIn 0.3s ease;
        position: relative;
      ">
        <!-- ✅ ИНДИКАТОР ТОКЕНОВ НАД ПОЛЕМ ВВОДА -->
        <div id="token-indicator" style="
          display: ${tokens.total > 0 ? 'flex' : 'flex'};
          gap: 8px;
          padding: 4px 16px;
          background: var(--app-bg-secondary);
          border-bottom: 1px solid var(--app-border-color-light);
          font-size: 12px;
          align-items: center;
          justify-content: flex-end;
          flex-shrink: 0;
          min-height: 32px;
        ">
          ${tokens.total > 0 ? `
            <span class="token-badge" title="Бонусные токены" style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 2px 8px;
              border-radius: 12px;
              background: rgba(241, 196, 15, 0.12);
              color: #f1c40f;
            ">
              🎁 ${tokens.bonus}
            </span>
            <span class="token-badge" title="Постоянные токены" style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 2px 8px;
              border-radius: 12px;
              background: rgba(52, 152, 219, 0.12);
              color: #3498db;
            ">
              💎 ${tokens.permanent}
            </span>
            <span class="token-badge total" title="Всего токенов" style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 2px 8px;
              border-radius: 12px;
              background: rgba(212, 175, 55, 0.12);
              color: var(--app-accent-primary);
              font-weight: 600;
            ">
              ⚡ ${tokens.total}
            </span>
          ` : `
            <span class="token-badge empty" title="Нет токенов" style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 2px 8px;
              border-radius: 12px;
              background: rgba(231, 76, 60, 0.08);
              color: #e74c3c;
              font-size: 11px;
            ">
              ⚡ Нет токенов
            </span>
          `}
        </div>

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
          bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
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

    const userInput = document.getElementById('user-input') as HTMLTextAreaElement;
    if (userInput) {
      userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        const maxHeight = 140;
        const newHeight = Math.min(this.scrollHeight, maxHeight);
        this.style.height = newHeight + 'px';
        
        const clearBtn = document.getElementById('clear-input-btn');
        if (clearBtn) {
          if (this.value.trim().length > 0) {
            clearBtn.classList.remove('hidden');
          } else {
            clearBtn.classList.add('hidden');
          }
        }
      });

      userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && this.value.trim().length === 0) {
          (window as any).collapseInputArea?.();
        }
      });
    }

    const clearBtn = document.getElementById('clear-input-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        
        const input = document.getElementById('user-input') as HTMLTextAreaElement;
        if (input) {
          input.value = '';
          input.style.height = 'auto';
          this.classList.add('hidden');
          input.focus();
          
          if (typeof (window as any).clearUserText === 'function') {
            (window as any).clearUserText(e);
          }
        }
      });
    }

    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      this._patcher = new ChatPatcher(chatContainer);
      console.log('✅ ChatPatcher инициализирован');
    }

    this._rendered = true;
  }

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

    const messages = found.chat.messages || [];
    console.log(`📋 Загружено ${messages.length} сообщений для чата ${this._chatId}`);

    if (this._patcher) {
      this._patcher.renderAll(messages);
    } else {
      container.innerHTML = '';
      if (messages.length === 0) {
        this._showWelcomeMessage(container);
        return;
      }

      const sortedMessages = [...messages]
        .filter(m => !m.deleted_at)
        .sort((a, b) => 
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );

      for (const msg of sortedMessages) {
        const msgDiv = this.uiRenderer.renderMessage(
          msg.text,
          msg.type,
          msg.id,
          msg.isFavorite || false
        );
        if (msgDiv) {
          container.appendChild(msgDiv);
        }
      }
    }

    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 100);
  }

  private _showWelcomeMessage(container: HTMLElement): void {
    const topic = this._topic || 'code';
    const welcomeText = getWelcomeText(topic);
    this.uiRenderer.renderWelcome(welcomeText);
  }

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

  hide(): void {
    console.log('📱 ChatModule.hide()');

    if (this._chatId) {
      const found = this.chatStore.findChatById(this._chatId);
      if (found) {
        const hasMessages = this.chatStore.hasRealMessages(found.chat);
        if (!hasMessages && !found.chat.deleted_at) {
          console.log(`🧹 [hide] Удаляем пустой чат ${this._chatId}`);
          this.chatStore.permanentDeleteChat(this._chatId);
          
          if (this._topic) {
            this.chatStore.setActiveChat(this._topic, null);
          }
        }
      }
    }

    this._isShowing = false;
    this.container.classList.add('hidden');
    this.container.style.display = 'none';

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }
  }

  getPatcher(): ChatPatcher | null {
    return this._patcher;
  }

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
    this._patcher = null;
    this.container.innerHTML = '';
  }
}

(window as any).ChatModule = ChatModule;
console.log('✅ ChatModule v8.10.0 загружен (с индикатором токенов)');
