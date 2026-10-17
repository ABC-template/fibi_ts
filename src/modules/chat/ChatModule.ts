// ============================================
// src/modules/chat/ChatModule.ts
// Страница чата (с проверкой доступа к агенту)
// Версия: 9.5.0 — чат удалён (последнее сообщение, корзина, другое устройство) — выход на
//                  предыдущий раздел; открытый чат публикуется в open-chat (отправка идёт
//                  только в него); сообщения рисует только ChatPatcher (разделители дней)
//          9.4.1 - без console.log с устаревшим номером версии
//          9.4.0 — в шапке только название чата (без 🤖); нижнее меню не трогает (его прячет
//                  ModuleLoader на время чата); удалён неиспользуемый _redirectIfEmpty
//                  (слал событие, которого никто не слушал: пустой чат удаляется при уходе)
//          9.3.2 — окно «Доступ ограничен»: название чата экранируется (самоXSS); текст про
//                  тариф без устаревших названий Plus/Ultra
//          9.3.1 — убран неиспользуемый импорт IAiAgentWithAccess (тип удалён)
//          9.3.0 — кнопка «Память чата» в шапке открывает настройку (событие без
//                  слушателя заменено прямым вызовом); в чатах генерации кнопки и счётчика
//                  контекста нет — история там не используется
//          9.2.0 — ограничения доступа применяются к реальным кнопкам (.send-btn/.voice-btn/
//                  .media-btn/.file-btn); полоска энергии показывает баланс без выдуманных
//                  «токенов» (символы/4) и не блокирует отправку — цену проверяет сервер;
//                  причины отказа auth/tier/inactive (вместо устаревшей role);
//                  чат с идущей генерацией не удаляется как пустой при выходе
//          9.1.0 — генеративные агенты вынесены в generation.ts (GenerationController):
//                  форма с референсами и негативным промптом, карточки в сообщениях,
//                  «Повторить», опрос незавершённых генераций; исправлен TS1308
//          9.0.0 — единый open_chat через NavigationState — добавлена кнопка прикрепления текстового файла
//                  (.file-btn → attach-file.ts, по образцу .media-btn)
// ============================================
import './chat.css';
import { chatStore, NEW_CHAT_TITLE } from '@/store/ChatStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { navigationState } from '@/core/navigation-state';
import { moduleLoader } from '@/core/module-loader';
import { uiRenderer } from '@/modules/ui/renderer';
import { escapeHtml } from '@/utils/html';
import { ChatPatcher } from './ChatPatcher';
import { GenerationController } from './generation';
import { setOpenChatId } from './open-chat';
import { economyStore } from '@/economy/EconomyStore';
import { userStore } from '@/store/UserStore';
import { 
  getWelcomeText, 
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
  private userStore = userStore;

  private _chatId: UUID | null = null;
  private _topic: TopicId | null = null;
  private _agentId: string | null = null;
  private _agentAccess: boolean = true;
  private _agentReason: string | null = null;
  private _isGenerative: boolean = false;
  private _pendingScrollMsgId: string | null = null;
  private _subscriptions: Array<() => void> = [];
  private _rendered: boolean = false;
  private _isShowing: boolean = false;
  
  private _patcher: ChatPatcher | null = null;
  private _delegationHandler: ((e: Event) => void) | null = null;
  private _generation: GenerationController;

  constructor(container: HTMLElement) {
    this.container = container;
    this._generation = new GenerationController({
      getChatId: () => this._chatId,
      getAgentId: () => this._agentId,
      hasAccess: () => this._agentAccess,
      showAccessDenied: () => this._showAccessDeniedModal(),
      getPatcher: () => this._patcher,
    });
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).chatModule = this;
    this._subscribeToEvents();
    this.isInitialized = true;

  }

  private async _ensureVoiceFunction(): Promise<void> {
    if (typeof (window as any).toggleVoiceRecording === 'function') {
      return;
    }

    console.log('📦 Динамическая загрузка voice.ts...');

    try {
      await import('./voice');
      
      await new Promise(resolve => setTimeout(resolve, 10));

      if (typeof (window as any).toggleVoiceRecording !== 'function') {
        throw new Error('toggleVoiceRecording не определена после импорта');
      }

      console.log('✅ voice.ts успешно загружен динамически');
    } catch (err) {
      console.error('❌ Ошибка загрузки voice.ts:', err);
    }
  }

  private async _ensureMediaFunction(): Promise<void> {
    if (typeof (window as any).triggerMediaSelector === 'function') {
      return;
    }

    console.log('📦 Динамическая загрузка media.ts...');

    try {
      await import('./media');
      
      await new Promise(resolve => setTimeout(resolve, 10));

      if (typeof (window as any).triggerMediaSelector !== 'function') {
        throw new Error('triggerMediaSelector не определена после импорта');
      }

      console.log('✅ media.ts успешно загружен динамически');
    } catch (err) {
      console.error('❌ Ошибка загрузки media.ts:', err);
    }
  }

  private async _ensureFileFunction(): Promise<void> {
    if (typeof (window as any).triggerFileSelector === 'function') {
      return;
    }

    console.log('📦 Динамическая загрузка attach-file.ts...');

    try {
      await import('./attach-file');

      await new Promise(resolve => setTimeout(resolve, 10));

      if (typeof (window as any).triggerFileSelector !== 'function') {
        throw new Error('triggerFileSelector не определена после импорта');
      }

      console.log('✅ attach-file.ts успешно загружен динамически');
    } catch (err) {
      console.error('❌ Ошибка загрузки attach-file.ts:', err);
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

      const fileBtn = target.closest('.file-btn') as HTMLElement;
      if (fileBtn) {
        console.log('📄 Делегирование: нажата кнопка файла');
        await this._ensureFileFunction();
        if ((window as any).triggerFileSelector) {
          (window as any).triggerFileSelector();
        }
        return;
      }

      const sendBtn = target.closest('.send-btn') as HTMLElement;
      if (sendBtn) {
        console.log('📤 Делегирование: нажата кнопка отправки');
        
        if (!this._agentAccess) {
          this._showAccessDeniedModal();
          return;
        }
        
        this.eventBus.emit('chat:send-message');
        return;
      }

      const fabBtn = target.closest('#fab-open-input') as HTMLElement;
      if (fabBtn) {
        console.log('🔧 Делегирование: нажата FAB кнопка');
        if (this._isGenerative) {
          void this._generation.open();
        } else {
          this.eventBus.emit('input:expand');
          setTimeout(() => {
            const input = document.getElementById('user-input') as HTMLTextAreaElement;
            if (input && this._agentAccess !== false) {
              input.disabled = false;
              input.focus();
            }
            this._updateEnergyBar();
          }, 50);
        }
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
        console.log(`📡 [ChatModule] Точечное обновление сообщения: ${data.messageId}`);
        if (data.message) {
          this._patcher.updateMessage(data.message);
        } else {
          this._patcher.updateMessageText(data.messageId, data.text);
        }
      }
    }, this);
    this._subscriptions.push(unsubUpdate);

    // Открытый чат удалён (последнее сообщение, корзина, синхронизация) — уходим из него:
    // иначе поле ввода осталось бы, а запрос ушёл бы в другой чат
    const onChatGone = (data: any) => {
      if (!data?.chatId || data.chatId !== this._chatId || !this._isShowing) return;
      this._leaveDeletedChat(data.chatId);
    };
    this._subscriptions.push(this.eventBus.on('chat:permanent_deleted', onChatGone, this));
    this._subscriptions.push(this.eventBus.on('chat:deleted', onChatGone, this));

    const unsubRename = this.eventBus.on('chat:renamed', (data) => {
      if (data.chatId === this._chatId) {
        this._updateHeader();
      }
    }, this);
    this._subscriptions.push(unsubRename);

    // navigation:open_chat обрабатывает ТОЛЬКО NavigationState → navigate → show().
    // Здесь не слушаем, иначе двойная renderAll.

    const unsubTokens = this.eventBus.on('economy:tokens:updated', () => {
      if (this._isShowing) {
        this._updateTokenIndicator();
      }
    }, this);
    this._subscriptions.push(unsubTokens);

    const unsubAgent = this.eventBus.on('agents:access_updated', () => {
      if (this._isShowing && this._agentId) {
        this._checkAgentAccess();
        this._updateSendButton();
      }
    }, this);
    this._subscriptions.push(unsubAgent);

    console.log('📡 ChatModule подписан на события (с проверкой агента)');
  }

  /** Чат исчез, пока открыт: отправка в него закрыта сразу, выход — после анимации удаления */
  private _leaveDeletedChat(chatId: UUID): void {
    setOpenChatId(null);
    const input = this.container.querySelector('#user-input') as HTMLTextAreaElement | null;
    if (input) input.disabled = true;
    setTimeout(() => {
      if (this._isShowing && this._chatId === chatId) this.navigationState.leaveChat();
    }, 300);
  }

  private async _checkAgentAccess(): Promise<void> {
    if (!this._agentId) {
      this._agentAccess = true;
      this._agentReason = null;
      return;
    }

    try {
      const { fetchAgentsWithAccess } = await import('@/services/agents');
      const data = await fetchAgentsWithAccess();
      const agent = data.agents.find(a => a.id === this._agentId);

      if (agent) {
        this._agentAccess = agent.has_access;
        this._applyAccessRestrictions();
        this._updateEnergyBar();
        this._agentReason = agent.access_reason || null;
        console.log(`🔍 [ChatModule] Доступ к агенту: ${this._agentAccess}, причина: ${this._agentReason}`);
      } else {
        this._agentAccess = false;
        this._agentReason = 'not_found';
        console.warn(`⚠️ [ChatModule] Агент ${this._agentId} не найден`);
      }
    } catch (err) {
      console.error('❌ [ChatModule] Ошибка проверки доступа:', err);
      this._agentAccess = true;
    }

    this._updateSendButton();
  }

  private _updateSendButton(): void {
    const sendBtn = this.container.querySelector('.send-btn') as HTMLButtonElement;
    if (!sendBtn) return;

    if (!this._agentAccess) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = '0.5';
      sendBtn.style.cursor = 'not-allowed';
      sendBtn.title = 'Доступ к агенту ограничен';
      
      const icon = sendBtn.querySelector('[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', 'lock');
        if (typeof (window as any).lucide !== 'undefined') {
          (window as any).lucide.createIcons({ root: sendBtn });
        }
      }
    } else {
      sendBtn.disabled = false;
      sendBtn.style.opacity = '1';
      sendBtn.style.cursor = 'pointer';
      sendBtn.title = 'Отправить';
      
      const icon = sendBtn.querySelector('[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', 'send');
        if (typeof (window as any).lucide !== 'undefined') {
          (window as any).lucide.createIcons({ root: sendBtn });
        }
      }
    }

    this._updateTokenIndicator();
  }

  private _showAccessDeniedModal(): void {
    // Название — из названия чата (вводит пользователь): только экранированное
    const agentName = escapeHtml(this._getAgentName());

    let title = '🔒 Доступ ограничен';
    let description = `Для отправки сообщений агенту "${agentName}" требуется:`;
    let actionLabel = '📈 Расширить возможности';

    if (this._agentReason === 'inactive') {
      title = '⏳ Агент временно недоступен';
      description = 'Этот агент отключён администратором. Попробуйте позже.';
      actionLabel = '🔄 Обновить';
    } else if (this._agentReason === 'auth') {
      description = `Чтобы пользоваться агентом "${agentName}", перезапустите приложение и войдите заново.`;
      actionLabel = '🔄 Понятно';
    } else if (this._agentReason === 'tier') {
      description = `Для использования агента "${agentName}" требуется подходящая подписка.`;
    } else if (this._agentReason === 'not_found') {
      title = '❌ Агент не найден';
      description = 'Этот агент больше не доступен. Пожалуйста, выберите другого агента.';
      actionLabel = '⬅️ Вернуться к списку';
    }

    const content = `
      <div style="text-align: center; padding: 8px 0;">
        <div style="font-size: 56px; margin-bottom: 12px;">${this._agentReason === 'inactive' ? '⏳' : '🔒'}</div>
        <div style="font-size: 20px; font-weight: 700; color: var(--app-text-primary);">${title}</div>
        <div style="font-size: 14px; color: var(--app-text-secondary); margin-top: 8px; line-height: 1.6;">
          ${description}
        </div>
        ${this._agentReason === 'tier' ? `
          <div style="
            margin-top: 16px;
            background: var(--app-bg-tertiary);
            border-radius: 12px;
            padding: 12px;
            text-align: left;
          ">
            <div style="font-size: 12px; color: var(--app-text-tertiary);">
              💡 <strong>Как получить доступ?</strong>
            </div>
            <div style="font-size: 12px; color: var(--app-text-secondary); margin-top: 4px;">
              Оформите подходящую подписку в разделе «Экономика»
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const footer = `
      <button id="modal-save-btn" class="btn" style="width:100%;">
        ${actionLabel}
      </button>
    `;

    const modalManager = (window as any).modalManager;
    if (modalManager) {
      modalManager.open({
        title: title,
        content: content,
        footer: footer,
        modalId: 'agent-chat-blocked',
        showFooter: true,
        onSave: () => {
          if (this._agentReason === 'not_found') {
            modalManager.close();
            if (this.navigationState) {
              this.navigationState.navigate('agents', {}, { replace: true });
            }
          } else if (this._agentReason === 'inactive') {
            this._checkAgentAccess();
            modalManager.close();
          } else if (this._agentReason === 'auth') {
            modalManager.close();
          } else {
            modalManager.close();
            if (this.navigationState) {
              this.navigationState.navigate('economy', {}, { addToHistory: true });
            } else if (this.moduleLoader) {
              this.moduleLoader.load('economy');
            }
          }
        },
      });
    }
  }

  private _getAgentName(): string {
    try {
      const found = this.chatStore.findChatById(this._chatId!);
      if (found?.chat?.title) {
        return found.chat.title;
      }
    } catch (e) {}
    return 'агента';
  }

  private _updateTokenIndicator(): void {
    const indicator = document.getElementById('token-indicator');
    if (!indicator) return;

    const tokens = this.economyStore.getTokenBalances();
    const isBlocked = !this._agentAccess;

    if (isBlocked) {
      indicator.innerHTML = `
        <span class="token-badge blocked" style="
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 12px; border-radius: 12px;
          background: rgba(231, 76, 60, 0.12); color: #e74c3c;
          font-weight: 600; font-size: 12px;
        ">🔒 Доступ ограничен</span>
      `;
      indicator.style.display = 'flex';
      indicator.style.justifyContent = 'center';
      return;
    }

    // Только общий баланс «Энергия» (детали — в разделе Экономика)
    const total = tokens.total ?? 0;
    indicator.innerHTML = `
      <span class="token-badge total" title="Энергия (бонус + постоянные)" style="
        display: inline-flex; align-items: center; gap: 6px;
        padding: 2px 12px; border-radius: 12px;
        background: rgba(212, 175, 55, 0.12); color: var(--app-text-primary);
        font-weight: 600; font-size: 12px;
      ">⚡ Энергия ${total}</span>
    `;
    indicator.style.display = 'flex';
    indicator.style.justifyContent = 'flex-end';
  }

  async show(params: Record<string, any> = {}): Promise<void> {
    console.log('📱 ChatModule.show()', params);

    const { chatId, topic, messageId } = params;
    this._pendingScrollMsgId = messageId || null;

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
    const sameChat = this._isShowing && this._chatId === chatId;

    console.log(`📂 _openChat: ${chatId}, topic: ${actualTopic}, same=${sameChat}`);

    if (!sameChat) {
      this._generation.stop();
    }

    this._chatId = chatId;
    this._topic = actualTopic;
    this._agentId = found.chat.agent_id || null;
    this._isGenerative = ['image', 'video', 'audio'].includes(found.chat.modality || '');

    if (this._topic) {
      this.chatStore.currentTopic = this._topic;
    }

    if (!this._rendered) {
      this._render();
    }

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this._isShowing = true;
    setOpenChatId(this._chatId);
    this.chatStore.setActiveChat(actualTopic, this._chatId);

    // Уже этот чат — без полной перерисовки сообщений
    if (sameChat) {
      this._updateHeader();
      this._updateTokenIndicator();
      this._updateSendButton();
      // Тот же чат, но открыли из избранного — только скролл к msg
      if (this._pendingScrollMsgId) {
        const msgId = this._pendingScrollMsgId;
        this._pendingScrollMsgId = null;
        setTimeout(() => {
          const target = document.getElementById(`msg-block-${msgId}`);
          const container = document.getElementById('chat-container');
          if (target && container) {
            container.scrollTo({ top: Math.max(0, target.offsetTop - 80), behavior: 'smooth' });
            target.classList.add('highlight-msg');
            setTimeout(() => target.classList.remove('highlight-msg'), 2000);
            console.log(`⭐ Скролл к сообщению ${msgId} (same chat)`);
          }
        }, 50);
      }
      console.log(`✅ Чат ${this._chatId} уже на экране — skip renderAll`);
      return;
    }

    this._checkAgentAccess().then(() => {
      this._updateHeader();
      this._loadMessages();
      this._updateTokenIndicator();
      this._updateSendButton();
    });

    console.log(`✅ Чат ${this._chatId} открыт (topic: ${actualTopic}, agent: ${this._agentId})`);
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
      // Тот же чат — без renderAll (единый путь через show/_openChat)
      this._updateHeader();
      this._updateTokenIndicator();
      this._updateSendButton();
    }
  }

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
        <div id="token-indicator" style="
          display: flex;
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
          <span class="token-badge empty" title="Загрузка..." style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            background: rgba(149, 165, 166, 0.08);
            color: #95a5a6;
            font-size: 11px;
          ">
            ⏳ Загрузка...
          </span>
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
          <div id="energy-bar" style="
            font-size: 13px;
            color: var(--app-text-secondary);
            padding: 6px 12px 4px;
            text-align: center;
            background: rgba(0,0,0,0.35);
            backdrop-filter: blur(8px);
            border-radius: 12px 12px 0 0;
          ">
            ⚡ —
          </div>
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
              <button class="footer-action-btn file-btn" style="
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
                <i data-lucide="file-text" style="width:20px;height:20px;"></i>
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
    userInput?.addEventListener('input', () => this._updateEnergyBar());
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
      this._patcher.setDecorator((msg, el) => this._generation.decorate(msg, el));
      console.log('✅ ChatPatcher инициализирован');
    }

    this._rendered = true;
  }

  private async _loadMessages(): Promise<void> {
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

    this._patcher?.renderAll(messages);
    if (messages.length === 0) {
      const created = new Date(found.chat.created_at || 0).getTime();
      if (Date.now() - created < 8000) {
        await this._showWelcomeMessage();
      }
    }

    this._generation.syncPolling();

    // Скролл: если открыли из избранного — к сообщению, иначе вниз
    const targetMsgId = this._pendingScrollMsgId;
    this._pendingScrollMsgId = null;

    setTimeout(() => {
      if (targetMsgId) {
        const target = document.getElementById(`msg-block-${targetMsgId}`);
        if (target) {
          const top = Math.max(0, target.offsetTop - 80);
          container.scrollTo({ top, behavior: 'smooth' });
          target.classList.add('highlight-msg');
          setTimeout(() => target.classList.remove('highlight-msg'), 2000);
          console.log(`⭐ Скролл к сообщению ${targetMsgId}`);
          return;
        }
        console.warn(`⚠️ Сообщение ${targetMsgId} не найдено в DOM после renderAll`);
      }
      container.scrollTop = container.scrollHeight;
    }, 50);
  }

  private async _showWelcomeMessage(): Promise<void> {
    const chatId = this._chatId;
    let text: string | null = null;
    const lang = this.userStore.languageCode || 'ru';

    if (this._agentId) {
      try {
        // First try from AgentsModule cache if available
        const agentsModule = (window as any).agentsModule;
        let agent = agentsModule?._agents?.find((a: any) => a.id === this._agentId);
        
        if (!agent) {
          const { fetchAgentsWithAccess } = await import('@/services/agents');
          const data = await fetchAgentsWithAccess();
          agent = (data.agents || []).find((a: any) => a.id === this._agentId);
        }

        if (agent?.welcome_message) {
          text = agent.welcome_message[lang] || agent.welcome_message.ru || agent.welcome_message.en || null;
          console.log('[welcome] Found agent welcome:', text?.substring(0, 50));
        } else {
          console.log('[welcome] Agent found but no welcome_message', agent?.slug);
        }
      } catch (e) {
        console.warn('Failed to load agent for welcome:', e);
      }
    } else {
      console.log('[welcome] No _agentId, using topic fallback');
    }

    if (!text) {
      const topic = this._topic || 'code';
      text = getWelcomeText(topic) || null;
    }

    // Пока грузилось приветствие, в чате могло появиться первое сообщение
    // (или пользователь уже ушёл в другой чат)
    const chat = chatId && this._chatId === chatId ? this.chatStore.findChatById(chatId)?.chat : null;
    if (text && chat && !this.chatStore.hasRealMessages(chat)) {
      this.uiRenderer.renderWelcome(text);
    }
  }

  private _updateHeader(): void {
    if (!this._chatId || !this.headerManager) return;

    const found = this.chatStore.findChatById(this._chatId);
    if (!found) return;

    this.headerManager.setTitle(found.chat.title || NEW_CHAT_TITLE);
    // «Память чата» — только для текстовых агентов: генерация истории не использует
    const contextAction = this._isGenerative ? [] : [{
      id: 'context',
      icon: 'brain',
      title: 'Память чата',
      onClick: () => {
        // Раньше уходило событие modal:show_context, которое никто не слушал
        if (this._chatId) (window as any).showContextModal?.(this._chatId);
      }
    }];

    this.headerManager.setActions([
      ...contextAction,
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

    // До удаления пустого чата: его событие удаления не должно уводить из чата повторно
    this._isShowing = false;
    setOpenChatId(null);

    if (this._chatId) {
      const found = this.chatStore.findChatById(this._chatId);
      if (found) {
        // Чат генерации во время запроса пуст (сообщения создаст сервер в конце) —
        // isDisposableEmpty его не считает пустым
        if (this.chatStore.isDisposableEmpty(found.chat)) {
          console.log(`🧹 [hide] Удаляем пустой чат ${this._chatId}`);
          this.chatStore.permanentDeleteChat(this._chatId);
          
          if (this._topic) {
            this.chatStore.setActiveChat(this._topic, null);
          }
        }
      }
    }

    this._generation.stop();
    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  getPatcher(): ChatPatcher | null {
    return this._patcher;
  }


  private _applyAccessRestrictions(): void {
    const input = this.container.querySelector('#user-input') as HTMLTextAreaElement | null;
    const buttons = ['.send-btn', '.voice-btn', '.media-btn', '.file-btn']
      .map((sel) => this.container.querySelector(sel) as HTMLButtonElement | null);
    const blocked = this._agentAccess === false;

    if (input) {
      input.disabled = blocked;
      if (blocked) {
        input.placeholder = 'Доступно на другом тарифе';
      } else if (input.placeholder === 'Доступно на другом тарифе') {
        input.placeholder = 'Ваш вопрос...';
      }
    }
    for (const btn of buttons) {
      if (!btn) continue;
      btn.disabled = blocked;
      btn.style.opacity = blocked ? '0.5' : '';
    }
  }

  /**
   * Полоска над полем ввода: баланс энергии и объём контекста.
   * Стоимость текстового запроса зависит от модели и длины ответа и известна
   * только после ответа (usage.cost), поэтому здесь её не угадываем: хватит ли
   * энергии, проверяет сервер перед запросом.
   */
  private _updateEnergyBar(): void {
    const bar = this.container.querySelector('#energy-bar') as HTMLElement | null;
    if (!bar) return;

    const tokens = this.economyStore.getTokenBalances();
    const total = tokens.total ?? 0;

    let contextCount = 0;
    if (this._chatId && !this._isGenerative) {
      const found = this.chatStore.findChatById(this._chatId);
      const visible = (found?.chat?.messages || []).filter((m: any) => !m.deleted_at);
      const limit = found?.chat?.maxContext || 15;
      contextCount = Math.min(visible.length, limit);
    }

    const energy = tokens.bypass ? '∞' : String(total);
    bar.textContent = contextCount > 0
      ? `⚡ ${energy}  ·  в контексте ${contextCount} сообщ.`
      : `⚡ ${energy}`;
  }


  destroy(): void {
    console.log('🗑️ ChatModule.destroy()');

    if (this._delegationHandler) {
      this.container.removeEventListener('click', this._delegationHandler);
      this._delegationHandler = null;
      console.log('🧹 Обработчик делегирования удален при destroy');
    }

    this._generation.dispose();
    setOpenChatId(null);
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
    this._agentId = null;
    this._isShowing = false;
    this._patcher = null;
    this.container.innerHTML = '';
  }
}

(window as any).ChatModule = ChatModule;
