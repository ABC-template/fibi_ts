// ============================================
// src/modules/ui/renderer.ts
// Базовый рендеринг UI-элементов
// Версия: 4.5.0 - время под сообщениями: у ответа ИИ кнопки (копировать, поделиться,
//                 избранное, удалить) слева, время справа; запрос пользователя — пузырь и
//                 под ним строка шириной с пузырь: слева «удалить», справа время;
//                 блок сообщения хранит дату (data-ts / data-day) для разделителей дней
//          4.4.0 - удалены остатки старого лимита запросов (_updateLimitDisplay и подписки)
//          4.3.0 - текст сообщения лежит в .msg-content, кнопки действий — рядом, отдельно:
//                 обновление текста (стрим, Realtime) их больше не стирает;
//                 fillAIContent / createMessageActions — общие для чата, стрима и патчера
//          4.2.0 - Markdown только через utils/html (без DOMPurify — текст, а не сырой
//                 HTML); приветствие агента тоже очищается
//          4.1.1 - замена @types → @app-types
// ============================================
import './ui.css';
import { renderMarkdown, sanitizeRichHtml, escapeHtml } from '@/utils/html';
import { dayKey, formatDayLabel, formatMessageTime } from '@/utils/chat-time';
import { chatStore } from '@/store/ChatStore';
import { eventBus } from '@/core/event-bus';
import type { MessageType, UUID } from '@app-types';

export class UIRenderer {
  private chatStore = chatStore;
  private eventBus = eventBus;
  private _subscriptions: Array<() => void> = [];

  constructor() {
    this._subscribeToEvents();
  }

  private _subscribeToEvents(): void {
    const unsubBalance = this.eventBus.on('tasks:balance_changed', (data) => {
      this._updateCoinDisplay(data.newBalance);
    }, this);
    this._subscriptions.push(unsubBalance);

    const unsubTokens = this.eventBus.on('tasks:tokens_changed', (data) => {
      this._updateTokensDisplay(data.newTokens);
    }, this);
    this._subscriptions.push(unsubTokens);

    console.log('📡 UIRenderer подписан на события');
  }

  private _updateCoinDisplay(balance: number): void {
    document.querySelectorAll('.coin-amount').forEach(el => {
      (el as HTMLElement).textContent = String(balance || 0);
    });

    const drawerCoins = document.getElementById('drawer-coins-amount');
    if (drawerCoins) drawerCoins.textContent = String(balance || 0);

    const headerCoins = document.getElementById('header-coins-amount');
    if (headerCoins) headerCoins.textContent = String(balance || 0);
  }

  private _updateTokensDisplay(tokens: number): void {
    const tokensEl = document.getElementById('tasks-tokens');
    if (tokensEl) tokensEl.textContent = String(tokens || 0);
  }

  // ==========================================
  // РЕНДЕРИНГ СООБЩЕНИЙ
  // ==========================================

  renderMessage(
    text: string,
    type: MessageType,
    msgId: UUID | null = null,
    isFavorite: boolean = false,
    createdAt: string | null = null
  ): HTMLElement | null {
    const container = document.getElementById('chat-container');
    if (!container) return null;

    const finalMsgId = msgId || this.chatStore.generateUUID();
    const time = createdAt || new Date().toISOString();
    const msgDiv = document.createElement('div');
    msgDiv.id = `msg-block-${finalMsgId}`;
    this.stampBlock(msgDiv, time);

    if (type === 'ai-msg') {
      msgDiv.className = 'msg ai-msg msg-animated';
      this.renderAIMessage(msgDiv, text, finalMsgId, isFavorite, time);
    } else {
      msgDiv.className = 'msg-block user-block';
      this.renderUserMessage(msgDiv, text, finalMsgId, time);
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    return msgDiv;
  }

  /** Дата сообщения на блоке: по ней ставятся разделители дней */
  stampBlock(block: HTMLElement, createdAt: string): void {
    block.dataset.ts = createdAt;
    block.dataset.day = dayKey(createdAt);
  }

  /** Разделитель дня в ленте: «Сегодня», «Вчера», «15 октября» */
  createDaySeparator(createdAt: string): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'chat-day-sep';
    sep.dataset.day = dayKey(createdAt);
    const label = document.createElement('span');
    label.textContent = formatDayLabel(createdAt);
    sep.appendChild(label);
    return sep;
  }

  private _createTime(createdAt: string): HTMLElement {
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = formatMessageTime(createdAt);
    time.title = new Date(createdAt).toLocaleString('ru-RU');
    return time;
  }

  // ==========================================
  // AI СООБЩЕНИЕ — кнопки для ВСЕХ сообщений
  // ==========================================

  renderAIMessage(container: HTMLElement, text: string, msgId: UUID, isFavorite: boolean, createdAt: string): void {
    const contentDiv = this.createAIContent();
    this.fillAIContent(contentDiv, text);
    container.appendChild(contentDiv);

    // Кнопки действий для всех AI-сообщений
    container.appendChild(this.createMessageActions(msgId, isFavorite, createdAt));
  }

  /** Блок текста ответа ИИ (.msg-content) — его обновляют стрим и патчер */
  createAIContent(): HTMLElement {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.style.width = '100%';
    return contentDiv;
  }

  /** Markdown ответа ИИ в блок .msg-content + кнопки копирования кода */
  fillAIContent(contentDiv: HTMLElement, text: string): void {
    try {
      contentDiv.innerHTML = renderMarkdown(text, { wrapTables: true });
    } catch (e) {
      contentDiv.textContent = text;
      return;
    }

    contentDiv.querySelectorAll('pre').forEach((pre) => {
      const codeText = pre.querySelector('code')?.innerText || pre.innerText;
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative; width:100%;';
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-copy-btn';
      copyBtn.innerText = '📋 Копировать';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(codeText).then(() => {
          copyBtn.innerText = '✅ Готово!';
          setTimeout(() => copyBtn.innerText = '📋 Копировать', 1500);
        });
      };
      wrapper.appendChild(copyBtn);
    });
  }

  // ==========================================
  // USER СООБЩЕНИЕ: пузырь и под ним строка «удалить … время» шириной с пузырь
  // ==========================================

  renderUserMessage(container: HTMLElement, text: string, msgId: UUID, createdAt: string): void {
    const bubble = document.createElement('div');
    bubble.className = 'msg user-msg';
    const textSpan = document.createElement('span');
    textSpan.className = 'msg-content';
    textSpan.textContent = text;
    bubble.appendChild(textSpan);
    container.appendChild(bubble);

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn msg-meta-btn action-btn-danger';
    delBtn.dataset.action = 'delete-message';
    delBtn.dataset.msgId = msgId;
    delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    meta.appendChild(delBtn);
    meta.appendChild(this._createTime(createdAt));
    container.appendChild(meta);

    this._refreshIcons();
  }

  // ==========================================
  // КНОПКИ ДЕЙСТВИЙ ОТВЕТА: слева кнопки, справа время
  // ==========================================

  createMessageActions(msgId: UUID, isFavorite: boolean, createdAt: string): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const group = document.createElement('div');
    group.className = 'msg-actions-group';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.dataset.action = 'copy-message';
    copyBtn.dataset.msgId = msgId;
    copyBtn.dataset.tooltip = '📋';
    copyBtn.innerHTML = '<i data-lucide="copy"></i>';
    group.appendChild(copyBtn);

    const shareBtn = document.createElement('button');
    shareBtn.className = 'action-btn';
    shareBtn.dataset.action = 'share-message';
    shareBtn.dataset.msgId = msgId;
    shareBtn.dataset.tooltip = '🔗';
    shareBtn.innerHTML = '<i data-lucide="share-2"></i>';
    group.appendChild(shareBtn);

    const favBtn = document.createElement('button');
    favBtn.className = `action-btn ${isFavorite ? 'is-favorite' : ''}`;
    favBtn.dataset.action = 'toggle-favorite';
    favBtn.dataset.msgId = msgId;
    favBtn.dataset.isFavorite = String(isFavorite);
    favBtn.innerHTML = '<i data-lucide="heart"></i>';
    group.appendChild(favBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn action-btn-danger';
    delBtn.dataset.action = 'delete-message';
    delBtn.dataset.msgId = msgId;
    delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    group.appendChild(delBtn);

    actions.appendChild(group);
    actions.appendChild(this._createTime(createdAt));

    this._refreshIcons();
    return actions;
  }

  private _refreshIcons(): void {
    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 50);
  }

  /** Очистка готового HTML; без DOMPurify — HTML показывается как текст */
  sanitizeHTML(html: string): string {
    const clean = sanitizeRichHtml(html);
    return clean === null ? escapeHtml(html) : clean;
  }

  // ==========================================
  // ИНДИКАТОР "ПЕЧАТАЕТ"
  // ==========================================

  showSkeleton(): void {
    const container = document.getElementById('chat-container');
    if (!container) return;

    const existing = document.getElementById('ai-typing-indicator');
    if (existing) return;

    const indicator = document.createElement('div');
    indicator.id = 'ai-typing-indicator';
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    `;
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
  }

  hideSkeleton(): void {
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // ==========================================
  // ПРИВЕТСТВИЕ
  // ==========================================

  renderWelcome(text: string): void {
    const container = document.getElementById('chat-container');
    if (!container) return;

    const oldWelcome = document.getElementById('welcome-message');
    if (oldWelcome) oldWelcome.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg ai-msg welcome-msg';
    msgDiv.id = 'welcome-message';
    
    msgDiv.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      padding: 40px 24px;
      text-align: center;
      width: 100%;
      box-sizing: border-box;
    `;

    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = `
      font-size: 24px;
      font-weight: 400;
      color: var(--app-text-tertiary, #A89880);
      line-height: 1.6;
      max-width: 420px;
      margin: 0 auto;
    `;

    contentContainer.innerHTML = renderMarkdown(text);

    msgDiv.appendChild(contentContainer);
    container.appendChild(msgDiv);
    container.scrollTop = 0;
  }

  showSyncStatus(status: string, isError: boolean = false): void {
    const indicator = document.getElementById('chat-model-indicator');
    if (!indicator) return;

    const originalText = indicator.innerText;
    switch (status) {
      case 'syncing':
        indicator.innerHTML = '<span style="opacity:0.7;">🔄 синхр...</span>';
        setTimeout(() => {
          if (indicator.innerHTML === '<span style="opacity:0.7;">🔄 синхр...</span>') {
            indicator.innerText = originalText;
          }
        }, 2000);
        break;
      case 'success':
        indicator.innerHTML = '<span style="color: #27ae60;">✓ синхр.</span>';
        setTimeout(() => {
          if (indicator.innerHTML === '<span style="color: #27ae60;">✓ синхр.</span>') {
            indicator.innerText = originalText;
          }
        }, 1500);
        break;
      case 'error':
        indicator.innerHTML = '<span style="color: #e74c3c;">⚠️ офлайн</span>';
        break;
      default:
        indicator.innerText = originalText;
    }
  }

  showToast(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration: number = 2000): void {
    let toast = document.getElementById('custom-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'custom-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `show ${type}`;
    toast.style.display = 'block';

    clearTimeout((toast as any)._timeout);
    (toast as any)._timeout = setTimeout(() => {
      toast!.className = 'hide';
      setTimeout(() => {
        toast!.style.display = 'none';
      }, 300);
    }, duration);
  }

  // ==========================================
  // ОЧИСТКА ПОДПИСОК
  // ==========================================

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки UIRenderer:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 UIRenderer отписан от событий');
  }
}

export const uiRenderer = new UIRenderer();
