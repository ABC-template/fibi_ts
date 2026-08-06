// ============================================
// src/modules/ui/renderer.ts
// Базовый рендеринг UI-элементов
// Версия: 4.1.0 - FIXED: стиль welcome-msg по центру
// ============================================
import './ui.css';
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { eventBus } from '@/core/event-bus';
import type { MessageType, UUID } from '@types';

export class UIRenderer {
  private chatStore = chatStore;
  private userStore = userStore;
  private eventBus = eventBus;
  private _subscriptions: Array<() => void> = [];

  constructor() {
    this._subscribeToEvents();
    console.log('✅ UIRenderer v4.1.0 загружен (EventBus-based)');
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

    const unsubUsage = this.eventBus.on('user:usage_incremented', (data) => {
      this._updateLimitDisplay({ used: data.used, limit: this.userStore.dailyLimit });
    }, this);
    this._subscriptions.push(unsubUsage);

    const unsubRole = this.eventBus.on('user:role_changed', (data) => {
      this._updateLimitDisplay({ used: this.userStore.usedToday, limit: data.dailyLimit });
    }, this);
    this._subscriptions.push(unsubRole);

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

  private _updateLimitDisplay(data: { used: number; limit: number }): void {
    const total = data.limit || this.userStore.dailyLimit || 0;
    const used = data.used || this.userStore.usedToday || 0;
    const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;

    const barEl = document.getElementById('profile-limit-bar');
    if (barEl) {
      barEl.style.width = total >= 9999 ? '100%' : `${percent}%`;
    }

    const limitInfo = document.getElementById('limit-info');
    if (limitInfo) {
      const limitLabel = (window as any).getLangString ? (window as any).getLangString('limit') : 'Лимит';
      if (total >= 9999) {
        limitInfo.innerText = `${limitLabel}: ∞`;
      } else {
        limitInfo.innerText = `${limitLabel}: ${used}/${total}`;
      }
    }
  }

  // ==========================================
  // РЕНДЕРИНГ СООБЩЕНИЙ
  // ==========================================

  renderMessage(
    text: string,
    type: MessageType,
    msgId: UUID | null = null,
    isFavorite: boolean = false
  ): HTMLElement | null {
    const container = document.getElementById('chat-container');
    if (!container) return null;

    const finalMsgId = msgId || this.chatStore.generateUUID();
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${type} msg-animated`;
    msgDiv.id = `msg-block-${finalMsgId}`;

    if (type === 'ai-msg') {
      this.renderAIMessage(msgDiv, text, finalMsgId, isFavorite);
    } else {
      this.renderUserMessage(msgDiv, text, finalMsgId);
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    return msgDiv;
  }

  // ==========================================
  // AI СООБЩЕНИЕ — кнопки для ВСЕХ сообщений
  // ==========================================

  renderAIMessage(container: HTMLElement, text: string, msgId: UUID, isFavorite: boolean): void {
    const contentDiv = document.createElement('div');
    contentDiv.style.width = '100%';

    try {
      if (typeof (window as any).marked !== 'undefined') {
        let html = (window as any).marked.parse(text);
        html = html.replace(
          /<table[^>]*>([\s\S]*?)<\/table>/gi,
          '<div class="table-wrapper"><table>$1</table></div>'
        );
        contentDiv.innerHTML = this.sanitizeHTML(html);

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
      } else {
        contentDiv.textContent = text;
      }
    } catch (e) {
      contentDiv.textContent = text;
    }

    container.appendChild(contentDiv);

    // Кнопки действий для всех AI-сообщений
    const actions = this._createMessageActions(msgId, isFavorite);
    container.appendChild(actions);
  }

  // ==========================================
  // USER СООБЩЕНИЕ
  // ==========================================

  renderUserMessage(container: HTMLElement, text: string, msgId: UUID): void {
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    container.appendChild(textSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn msg-delete-btn';
    delBtn.dataset.action = 'delete-message';
    delBtn.dataset.msgId = msgId;
    delBtn.style.cssText = 'background:transparent; border:none; outline:none; cursor:pointer; margin-left:8px; opacity:0.4; padding:0; vertical-align:middle;';
    delBtn.innerHTML = '<i data-lucide="trash-2" style="width:16px;height:16px;"></i>';
    container.appendChild(delBtn);

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 50);
  }

  // ==========================================
  // КНОПКИ ДЕЙСТВИЙ
  // ==========================================

  private _createMessageActions(msgId: UUID, isFavorite: boolean): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.dataset.action = 'copy-message';
    copyBtn.dataset.msgId = msgId;
    copyBtn.dataset.tooltip = '📋';
    copyBtn.innerHTML = '<i data-lucide="copy"></i>';
    actions.appendChild(copyBtn);

    const shareBtn = document.createElement('button');
    shareBtn.className = 'action-btn';
    shareBtn.dataset.action = 'share-message';
    shareBtn.dataset.msgId = msgId;
    shareBtn.dataset.tooltip = '🔗';
    shareBtn.innerHTML = '<i data-lucide="share-2"></i>';
    actions.appendChild(shareBtn);

    const favBtn = document.createElement('button');
    favBtn.className = `action-btn ${isFavorite ? 'is-favorite' : ''}`;
    favBtn.dataset.action = 'toggle-favorite';
    favBtn.dataset.msgId = msgId;
    favBtn.dataset.isFavorite = String(isFavorite);
    favBtn.innerHTML = `<i data-lucide="${isFavorite ? 'heart' : 'heart'}"></i>`;
    actions.appendChild(favBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn';
    delBtn.dataset.action = 'delete-message';
    delBtn.dataset.msgId = msgId;
    delBtn.style.cssText = 'margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;';
    delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    actions.appendChild(delBtn);

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 50);

    return actions;
  }

  sanitizeHTML(html: string): string {
    if (typeof (window as any).DOMPurify !== 'undefined') {
      return (window as any).DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'u', 'i', 'b',
          'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li', 'blockquote',
          'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'span', 'div', 'img', 'hr', 'sub', 'sup'
        ],
        ALLOWED_ATTR: ['href', 'target', 'class', 'id', 'style', 'src', 'alt', 'title', 'rel'],
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']
      });
    }
    const temp = document.createElement('div');
    temp.textContent = html;
    return temp.innerHTML;
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
  // ✅ ОБНОВЛЕНО: renderWelcome — стиль по центру
  // ==========================================

  renderWelcome(text: string): void {
    const container = document.getElementById('chat-container');
    if (!container) return;

    // Удаляем старое приветствие, если есть
    const oldWelcome = document.getElementById('welcome-message');
    if (oldWelcome) oldWelcome.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg ai-msg welcome-msg';
    msgDiv.id = 'welcome-message';
    
    // ✅ СТИЛИ ДЛЯ ПРИВЕТСТВИЯ ПО ЦЕНТРУ
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

    if (typeof (window as any).marked !== 'undefined') {
      contentContainer.innerHTML = (window as any).marked.parse(text);
    } else {
      contentContainer.textContent = text;
    }

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
console.log('✅ UIRenderer v4.1.0 загружен (стиль welcome-msg по центру)');
