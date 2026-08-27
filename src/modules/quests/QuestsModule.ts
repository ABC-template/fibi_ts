// ============================================
// src/modules/quests/QuestsModule.ts
// All quests 
// Версия: 3.3.0 - FIXED: все ошибки типов
// ============================================

import './quests.css';
import { headerManager } from '@/core/header-manager';
import { questsStore } from '@/store/QuestsStore';
import { eventBus } from '@/core/event-bus';
import { uiRenderer } from '@/modules/ui/renderer';
import { userStore } from '@/store/UserStore';
import type { IUserQuest } from '@/store/QuestsStore';

type QuestTab = 'daily' | 'sponsor' | 'event';

export class QuestsModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _isVisible: boolean = false;
  private _activeTab: QuestTab = 'daily';

  private headerManager = headerManager;
  private questsStore = questsStore;
  private eventBus = eventBus;
  private uiRenderer = uiRenderer;
  private userStore = userStore;

  private userId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.userId = this.userStore.userId;
    (window as any).questsModule = this;

    this.container.innerHTML = `
      <div class="quests-container">
        <h2 class="quests-title">
          <i data-lucide="trophy"></i>
          Задания
        </h2>

        <div class="quests-tabs">
          <button class="quests-tab ${this._activeTab === 'daily' ? 'active' : ''}" data-tab="daily">
            📅 Ежедневные
          </button>
          <button class="quests-tab ${this._activeTab === 'sponsor' ? 'active' : ''}" data-tab="sponsor">
            🤝 Спонсоры
          </button>
          <button class="quests-tab ${this._activeTab === 'event' ? 'active' : ''}" data-tab="event">
            🎪 Ивенты
          </button>
        </div>

        <div id="quests-content" class="quests-content">
          ${this._renderTabContent()}
        </div>
      </div>
    `;

    this._bindEvents();
    this._subscribeToEvents();
    this.render();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ QuestsModule v3.3.0 инициализирован');
  }

  private _bindEvents(): void {
    this.container.querySelectorAll('.quests-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab') as QuestTab;
        if (tabId) this.switchTab(tabId);
      });
    });
  }

  private _subscribeToEvents(): void {
    const unsubSync = this.eventBus.on('quests:synced', () => {
      this.render();
    }, this);
    this._subscriptions.push(unsubSync);

    const unsubComplete = this.eventBus.on('quests:quest_completed', () => {
      this.render();
    }, this);
    this._subscriptions.push(unsubComplete);

    const unsubClaim = this.eventBus.on('quests:quest_claimed', () => {
      this.render();
    }, this);
    this._subscriptions.push(unsubClaim);

    const unsubSubmit = this.eventBus.on('quests:proof_submitted', () => {
      this.render();
    }, this);
    this._subscriptions.push(unsubSubmit);

    const unsubVerify = this.eventBus.on('quests:verified', () => {
      this.render();
    }, this);
    this._subscriptions.push(unsubVerify);

    const unsubBalance = this.eventBus.on('economy:balance:updated', (data) => {
      if (data.userId === this.userId) {
        this._updateBalanceUI(data.newBalance);
      }
    }, this);
    this._subscriptions.push(unsubBalance);

    console.log('📡 QuestsModule подписан на события');
  }

  private _updateBalanceUI(newBalance: number): void {
    document.querySelectorAll('.quests-balance-display').forEach(el => {
      (el as HTMLElement).textContent = String(newBalance);
    });
  }

  switchTab(tab: QuestTab): void {
    if (this._activeTab === tab) return;
    this._activeTab = tab;

    this.container.querySelectorAll('.quests-tab').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-tab') === tab);
    });

    const content = document.getElementById('quests-content');
    if (content) {
      content.innerHTML = this._renderTabContent();
      content.style.animation = 'fadeIn 0.2s ease';
    }
  }

  private _renderTabContent(): string {
    switch (this._activeTab) {
      case 'daily':
        return this._renderQuestList('daily', '📅 Ежедневные задания');
      case 'sponsor':
        return this._renderQuestList('sponsor', '🤝 Спонсорские задания');
      case 'event':
        return this._renderQuestList('event', '🎪 Ивентовые задания');
      default:
        return '<div>Неизвестная вкладка</div>';
    }
  }

  private _renderQuestList(type: IUserQuest['type'], title: string): string {
    const quests = this.questsStore.getQuestsByType(type);
    const stats = this.questsStore.getStats();

    if (quests.length === 0) {
      return `
        <div class="quests-empty">
          <div>📭</div>
          <p>Нет ${title.toLowerCase()}</p>
          <span>Загляните позже — появятся новые!</span>
        </div>
      `;
    }

    const completed = quests.filter(q => q.completed && q.claimed).length;
    const total = quests.length;

    return `
      <div class="quests-list-header">
        <span>${title}</span>
        <span>${completed}/${total}</span>
      </div>
      <div class="quests-list">
        ${quests.map(q => this._renderQuestItem(q)).join('')}
      </div>
    `;
  }

  private _renderQuestItem(quest: IUserQuest): string {
    const t = (obj: Record<string, string>): string => {
      const lang = this._getUserLang();
      return obj[lang] || obj['ru'] || Object.values(obj)[0] || '';
    };

    const title = t(quest.title);
    const description = quest.description ? t(quest.description) : '';
    const progress = Math.min(quest.progress / quest.target * 100, 100);
    const isCompleted = quest.completed && quest.claimed;
    const isUnlocked = quest.completed && !quest.claimed;

    // Динамические классы
    const externalClass = quest.quest_id ? `quests-item--${quest.quest_id}` : '';
    const typeClass = quest.type ? `quests-item--${quest.type}` : '';
    const categoryClass = quest.category ? `quests-item--${quest.category}` : '';
    const statusClass = quest.completed ? 'quests-item--completed' : '';
    const claimedClass = quest.claimed ? 'quests-item--claimed' : '';
    const pendingClass = !quest.completed && !quest.claimed ? 'quests-item--pending' : '';
    let sponsorStatusClass = '';
    if (quest.type === 'sponsor') {
      sponsorStatusClass = `quests-item--sponsor-${quest.status}`;
    }
    const expiredClass = quest.expires_at && new Date(quest.expires_at) < new Date() 
      ? 'quests-item--expired' 
      : '';

    const dynamicClasses = [
      externalClass,
      typeClass,
      categoryClass,
      statusClass,
      claimedClass,
      pendingClass,
      sponsorStatusClass,
      expiredClass,
    ]
      .filter(Boolean)
      .join(' ');

    // Статусы
    const statusMap: Record<IUserQuest['status'], { label: string; color: string }> = {
      pending: { label: '⏳ Ожидает', color: '#f39c12' },
      submitted: { label: '📤 На проверке', color: '#3498db' },
      approved: { label: '✅ Одобрено', color: '#27ae60' },
      rejected: { label: '❌ Отклонено', color: '#e74c3c' },
    };

    const status = statusMap[quest.status] || statusMap.pending;
    let actionButton = '';

    // ✅ ЛОГИКА КНОПОК ДЛЯ СПОНСОРСКИХ КВЕСТОВ
    if (quest.type === 'sponsor') {
      if (quest.status === 'pending') {
        actionButton = `
          <button class="quests-action-btn primary" onclick="window.questsModule.submitProof('${quest.user_quest_id}')">
            📢 Подписаться
          </button>
        `;
      } else if (quest.status === 'submitted') {
        const timeLeft = quest.expires_at 
          ? Math.max(0, Math.ceil((new Date(quest.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)))
          : 0;
        actionButton = `
          <div class="quests-status-badge" style="color: ${status.color};">
            ${status.label}
            ${timeLeft > 0 ? `⏱️ осталось ~${timeLeft}ч` : ''}
          </div>
        `;
      } else if (quest.status === 'approved' && !quest.claimed) {
        actionButton = `
          <button class="quests-action-btn claim" onclick="window.questsModule.claim('${quest.user_quest_id}')">
            🪙 Забрать +${quest.reward_coins}
          </button>
        `;
      }
    } else if (isUnlocked) {
      // ✅ ДЛЯ ОБЫЧНЫХ КВЕСТОВ (daily, event) — кнопка получения награды
      actionButton = `
        <button class="quests-action-btn claim" onclick="window.questsModule.claim('${quest.user_quest_id}')">
          🪙 Забрать +${quest.reward_coins}
        </button>
      `;
    } else if (isCompleted) {
      actionButton = `
        <div class="quests-status-badge" style="color: #27ae60;">
          ✅ Награда получена
        </div>
      `;
    } else {
      // ✅ ДЛЯ ВСЕХ ОСТАЛЬНЫХ — показываем прогресс
      actionButton = `
        <div class="quests-status-badge" style="color: var(--app-text-tertiary);">
          ${quest.progress}/${quest.target}
        </div>
      `;
    }

    return `
      <div class="quests-item ${dynamicClasses}">
        <div class="quests-item-header">
          <div class="quests-item-title">${title}</div>
          <div class="quests-item-reward">+${quest.reward_coins} 🪙</div>
        </div>
        ${description ? `<div class="quests-item-desc">${description}</div>` : ''}
        <div class="quests-item-progress">
          <div class="quests-item-progress-bar">
            <div class="quests-item-progress-fill" style="width: ${Math.min(progress, 100)}%;"></div>
          </div>
          <span class="quests-item-progress-text">${quest.progress}/${quest.target}</span>
        </div>
        <div class="quests-item-actions">
          ${actionButton}
          ${quest.type === 'sponsor' && quest.status === 'rejected' ? `
            <div class="quests-status-badge" style="color: #e74c3c;">
              ❌ Отклонено
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private _getUserLang(): string {
    try {
      const tg = (window as any).Telegram?.WebApp;
      const lang = tg?.initDataUnsafe?.user?.language_code || 'ru';
      return ['ru', 'en', 'it'].includes(lang) ? lang : 'ru';
    } catch {
      return 'ru';
    }
  }

  // ==========================================
  // ДЕЙСТВИЯ
  // ==========================================

  async claim(userQuestId: string): Promise<void> {
    if (!this.userId) {
      this.uiRenderer.showToast('⚠️ Ошибка авторизации', 'error', 1500);
      return;
    }

    const result = await this.questsStore.claim(userQuestId);
    if (result) {
      this.render();
      this.uiRenderer.showToast(`🎉 +${result.reward} монет!`, 'success', 1500);
    } else {
      this.uiRenderer.showToast('⚠️ Не удалось забрать награду', 'error', 1500);
    }
  }

  async submitProof(userQuestId: string): Promise<void> {
    if (!this.userId) {
      this.uiRenderer.showToast('⚠️ Ошибка авторизации', 'error', 1500);
      return;
    }

    this.uiRenderer.showToast('⏳ Проверяем подписку...', 'info', 2000);
    
    const success = await this.questsStore.submitProof(userQuestId);
    if (success) {
      this.render();
      this.uiRenderer.showToast('✅ Подписка подтверждена! Получите награду.', 'success', 2500);
    } else {
      this.render();
      this.uiRenderer.showToast('❌ Вы не подписаны на канал. Подпишитесь и попробуйте снова.', 'error', 3000);
    }
  }

  // ==========================================
  // УПРАВЛЕНИЕ МОДУЛЕМ
  // ==========================================

  render(): void {
    const content = document.getElementById('quests-content');
    if (content) {
      content.innerHTML = this._renderTabContent();
    }
  }

  show(): void {
    console.log('📱 QuestsModule.show() вызван');

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this._isVisible = true;

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this.render();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);

    this.questsStore.sync().catch(() => {});

    const dailyLogin = this.questsStore.getQuestByExternalId('daily_login');
    if (dailyLogin && dailyLogin.completed && !dailyLogin.claimed) {
      console.log('📌 [QuestsModule] daily_login готов к получению!');
      if (this.uiRenderer) {
        this.uiRenderer.showToast('🎁 Ежедневная награда ждёт! Заберите в разделе "Ежедневные"', 'info', 3000);
      }
    }

    console.log('✅ QuestsModule показан и обновлён');
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки QuestsModule:', e);
      }
    }
    this._subscriptions = [];
    this._isVisible = false;
    console.log('📡 QuestsModule отписан от событий');
  }
}

(window as any).QuestsModule = QuestsModule;
console.log('✅ QuestsModule v3.3.0 загружен');
