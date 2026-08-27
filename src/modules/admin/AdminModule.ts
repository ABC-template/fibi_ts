// ============================================
// src/modules/admin/AdminModule.ts
// Админ-панель (только для creator)
// Версия: 4.8.0 - FIXED: сохранение состояния и обновление при переключении
// ============================================

import { adminStore } from './AdminStore';
import { userStore } from '@/store/UserStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { uiRenderer } from '@/modules/ui/renderer';
import { questsStore } from '@/store/QuestsStore';
import { modalManager } from '@/core/modal-manager';
import type { UUID } from '@types';

type AdminTab = 'quests' | 'coins' | 'referrals' | 'users' | 'economy' | 'audit';

interface IQuest {
  id: UUID;
  external_id: string;
  type: 'daily' | 'sponsor' | 'event';
  category: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  target: number;
  reward_coins: number;
  reset_type: 'never' | 'daily' | 'weekly';
  cooldown_hours: number;
  max_completions: number | null;
  verification_type: 'auto' | 'pseudo' | 'manual';
  pseudo_hours: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
  sponsor_name: string | null;
  sponsor_logo: string | null;
  sponsor_target: string | null;
  sponsor_action_required: string | null;
  event_banner: string | null;
  event_color: string | null;
  created_at: string;
  updated_at: string;
  completions_count?: number;
}

interface IEconomyRule {
  id: UUID;
  source: string;
  amount: number;
  cooldown_hours: number;
  max_per_user: number | null;
  is_active: boolean;
  description: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface IAuditLog {
  id: UUID;
  user_id: number;
  event_type: string;
  source: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  currency: string;
  created_at: string;
}

export class AdminModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _activeTab: AdminTab = 'quests';
  private _quests: IQuest[] = [];
  private _editingQuestId: UUID | null = null;
  private _editingRuleId: UUID | null = null;
  private _rules: IEconomyRule[] = [];
  private _auditLogs: IAuditLog[] = [];
  private _isRefreshing: boolean = false;

  private headerManager = headerManager;
  private eventBus = eventBus;
  private userStore = userStore;
  private adminStore = adminStore;
  private uiRenderer = uiRenderer;
  private questsStore = questsStore;
  private modalManager = modalManager;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    if (this.userStore.role !== 'creator') {
      this.container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--app-text-tertiary);">
          <div style="font-size: 48px; margin-bottom: 12px;">⛔</div>
          <div style="font-size: 16px; font-weight: 600;">Доступ запрещён</div>
          <div style="font-size: 13px; margin-top: 4px;">Только для создателя приложения</div>
        </div>
      `;
      return;
    }

    this.headerManager.setTitle('👑 Админ-панель');
    this.headerManager.setActions([]);

    await this.loadQuests();
    await this.loadRules();
    await this.loadAudit();

    this._render();
    this._subscribeToEvents();

    this.isInitialized = true;
    console.log('✅ AdminModule v4.8.0 инициализирован');
  }

  private _subscribeToEvents(): void {
    const unsub = this.eventBus.on('admin:quests_updated', () => {
      this.loadQuests();
      if (this._activeTab === 'quests') {
        this._refreshContent();
      }
    }, this);
    this._subscriptions.push(unsub);

    const unsub2 = this.eventBus.on('admin:rules_updated', () => {
      this.loadRules();
      if (this._activeTab === 'economy') {
        this._refreshContent();
      }
    }, this);
    this._subscriptions.push(unsub2);
  }

  // ==========================================
  // ЗАГРУЗКА ДАННЫХ
  // ==========================================

  async loadQuests(): Promise<void> {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const response = await fetch('/api/admin/quests', {
        headers: {
          'X-Telegram-Init-Data': initData,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      const data = await response.json();
      if (data.success) {
        this._quests = data.quests || [];
        console.log(`📋 Загружено ${this._quests.length} квестов`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки квестов:', err);
    }
  }

  async loadRules(): Promise<void> {
    try {
      const { economyService } = await import('@/economy/EconomyService');
      const result = await economyService.getRules(100, 0);
      if (result.success) {
        this._rules = result.rules || [];
        console.log(`📋 Загружено ${this._rules.length} правил`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки правил:', err);
      this._rules = [];
    }
  }

  async loadAudit(filters?: { userId?: number; eventType?: string }): Promise<void> {
    try {
      const { economyService } = await import('@/economy/EconomyService');
      const result = await economyService.getAudit(
        filters?.userId || null,
        filters?.eventType || null,
        100,
        0
      );
      if (result.success) {
        this._auditLogs = result.logs || [];
        console.log(`📋 Загружено ${this._auditLogs.length} записей аудита`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки аудита:', err);
      this._auditLogs = [];
    }
  }

  // ==========================================
  // РЕНДЕРИНГ
  // ==========================================

  private _render(): void {
    this.container.innerHTML = `
      <div style="
        padding: 16px;
        flex: 1;
        overflow-y: auto;
        padding-bottom: 80px;
        display: flex;
        flex-direction: column;
        height: 100%;
      ">
        <div style="
          display: flex;
          gap: 4px;
          background: var(--app-bg-tertiary);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 16px;
          flex-shrink: 0;
          overflow-x: auto;
        ">
          ${this._renderTabs()}
        </div>

        <div id="admin-content" style="flex: 1; overflow-y: auto;">
          ${this._renderTabContent()}
        </div>
      </div>
    `;

    this._bindTabEvents();
  }

  /**
   * Обновить только содержимое вкладки (без пересоздания всего контейнера)
   */
  private async _refreshContent(): Promise<void> {
    if (this._isRefreshing) return;
    this._isRefreshing = true;

    try {
      // ✅ ПРИНУДИТЕЛЬНО ПЕРЕЗАГРУЖАЕМ ДАННЫЕ ПЕРЕД РЕНДЕРИНГОМ
      if (this._activeTab === 'quests') {
        await this.loadQuests();
      } else if (this._activeTab === 'economy') {
        await this.loadRules();
      } else if (this._activeTab === 'audit') {
        await this.loadAudit();
      }

      const content = document.getElementById('admin-content');
      if (content) {
        content.innerHTML = this._renderTabContent();
        this._bindTabEvents();
      }
    } catch (err) {
      console.error('❌ Ошибка обновления контента:', err);
    } finally {
      this._isRefreshing = false;
    }
  }

  /**
   * Привязать события к кнопкам вкладки
   */
  private _bindTabEvents(): void {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab') as AdminTab;
        if (tabId) this._switchTab(tabId);
      });
    });

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);
  }

  private _renderTabs(): string {
    const tabs: { id: AdminTab; label: string; icon: string }[] = [
      { id: 'quests', label: '📋 Квесты', icon: 'clipboard-list' },
      { id: 'coins', label: '💰 Монеты', icon: 'coins' },
      { id: 'referrals', label: '🤝 Рефералы', icon: 'users' },
      { id: 'users', label: '👤 Пользователи', icon: 'user' },
      { id: 'economy', label: '⚙️ Правила', icon: 'settings' },
      { id: 'audit', label: '📜 Аудит', icon: 'file-text' },
    ];

    return tabs.map(tab => `
      <button class="admin-tab" data-tab="${tab.id}" style="
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        background: ${this._activeTab === tab.id ? 'var(--app-accent-primary)' : 'transparent'};
        color: ${this._activeTab === tab.id ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)'};
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
        font-family: var(--app-font-family);
      ">
        ${tab.label}
      </button>
    `).join('');
  }

  private _renderTabContent(): string {
    switch (this._activeTab) {
      case 'quests': return this._renderQuestsTab();
      case 'coins': return this._renderCoinsTab();
      case 'referrals': return this._renderReferralsTab();
      case 'users': return this._renderUsersTab();
      case 'economy': return this._renderEconomyTab();
      case 'audit': return this._renderAuditTab();
      default: return '<div>Неизвестная вкладка</div>';
    }
  }

  private _switchTab(tabId: AdminTab): void {
    if (this._activeTab === tabId) return;
    this._activeTab = tabId;
    // ✅ ПРИ ПЕРЕКЛЮЧЕНИИ ВКЛАДКИ ПРИНУДИТЕЛЬНО ОБНОВЛЯЕМ ДАННЫЕ
    this._refreshContent();
  }

  // ==========================================
  // ВКЛАДКА: КВЕСТЫ
  // ==========================================

  private _renderQuestsTab(): string {
    const daily = this._quests.filter(q => q.type === 'daily');
    const sponsor = this._quests.filter(q => q.type === 'sponsor');
    const event = this._quests.filter(q => q.type === 'event');

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <button onclick="window.adminModule.showCreateQuestForm()" style="
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: 2px dashed var(--app-accent-primary);
          background: transparent;
          color: var(--app-accent-primary);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        ">
          ➕ Создать новый квест
        </button>

        <div id="admin-quest-form" style="display: none; background: var(--app-bg-secondary); padding: 16px; border-radius: 12px; border: 1px solid var(--app-border-color-light);">
          ${this._renderQuestForm()}
        </div>

        ${this._renderQuestGroup('📅 Ежедневные', daily)}
        ${this._renderQuestGroup('🤝 Спонсорские', sponsor)}
        ${this._renderQuestGroup('🎪 Ивентовые', event)}
      </div>
    `;
  }

  private _renderQuestGroup(title: string, quests: IQuest[]): string {
    if (quests.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
          <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 8px;">${title}</div>
          <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary); font-size: 13px;">
            Нет квестов этого типа
          </div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 12px;">
          ${title} (${quests.length})
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto;">
          ${quests.map(q => this._renderQuestCard(q)).join('')}
        </div>
      </div>
    `;
  }

  private _renderQuestCard(quest: IQuest): string {
    const title = quest.title?.ru || quest.title?.en || 'Без названия';
    const typeColors: Record<string, string> = {
      daily: '#f1c40f',
      sponsor: '#8e44ad',
      event: '#e74c3c',
    };
    const color = typeColors[quest.type] || '#3498db';

    const statusLabel = quest.is_active ? '🟢 Активен' : '🔴 Неактивен';
    const statusColor = quest.is_active ? '#27ae60' : '#e74c3c';

    return `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        background: var(--app-bg-tertiary);
        border-radius: 10px;
        border-left: 4px solid ${color};
        gap: 10px;
      ">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-weight: 600; font-size: 14px; color: var(--app-text-primary);">
              ${title}
            </span>
            <span style="font-size: 10px; background: ${color}22; color: ${color}; padding: 2px 8px; border-radius: 10px; font-weight: 600;">
              ${quest.type}
            </span>
            <span style="font-size: 10px; color: ${statusColor}; padding: 2px 8px; border-radius: 10px; font-weight: 600;">
              ${statusLabel}
            </span>
            ${quest.completions_count !== undefined ? `
              <span style="font-size: 10px; color: var(--app-text-tertiary); padding: 2px 8px; border-radius: 10px; background: var(--app-bg-secondary);">
                ✅ ${quest.completions_count} выполнений
              </span>
            ` : ''}
          </div>
          <div style="font-size: 12px; color: var(--app-text-tertiary); margin-top: 2px;">
            ${quest.external_id} • +${quest.reward_coins} 🪙 • ${quest.target} цель
            ${quest.expires_at ? ` • до ${new Date(quest.expires_at).toLocaleDateString()}` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0;">
          <button onclick="window.adminModule.editQuest('${quest.id}')" style="
            background: var(--app-bg-secondary);
            border: 1px solid var(--app-border-color);
            border-radius: 6px;
            padding: 4px 10px;
            color: var(--app-text-primary);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
          ">
            ✏️
          </button>
          <button onclick="window.adminModule.toggleQuestStatus('${quest.id}')" style="
            background: ${quest.is_active ? 'rgba(231, 76, 60, 0.1)' : 'rgba(39, 174, 96, 0.1)'};
            border: 1px solid ${quest.is_active ? 'rgba(231, 76, 60, 0.2)' : 'rgba(39, 174, 96, 0.2)'};
            border-radius: 6px;
            padding: 4px 10px;
            color: ${quest.is_active ? '#e74c3c' : '#27ae60'};
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
          ">
            ${quest.is_active ? '⏸️' : '▶️'}
          </button>
          <button onclick="window.adminModule.deleteQuest('${quest.id}')" style="
            background: rgba(231, 76, 60, 0.1);
            border: 1px solid rgba(231, 76, 60, 0.2);
            border-radius: 6px;
            padding: 4px 10px;
            color: #e74c3c;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
          ">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  private _renderQuestForm(quest?: IQuest): string {
    const isEdit = !!quest;
    const q = quest || {} as IQuest;

    return `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Название *</label>
            <input id="admin-quest-title" value="${q.title?.ru || ''}" placeholder="Название квеста" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Тип *</label>
            <select id="admin-quest-type" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            " onchange="window.adminModule.toggleQuestFields(this.value)">
              <option value="daily" ${q.type === 'daily' ? 'selected' : ''}>📅 Ежедневный</option>
              <option value="sponsor" ${q.type === 'sponsor' ? 'selected' : ''}>🤝 Спонсорский</option>
              <option value="event" ${q.type === 'event' ? 'selected' : ''}>🎪 Ивентовый</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Описание</label>
          <textarea id="admin-quest-description" rows="2" placeholder="Описание квеста" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
            resize: vertical;
            font-family: var(--app-font-family);
          ">${q.description?.ru || ''}</textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Награда 🪙</label>
            <input id="admin-quest-reward" type="number" value="${q.reward_coins || 0}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Цель</label>
            <input id="admin-quest-target" type="number" value="${q.target || 1}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Сброс</label>
            <select id="admin-quest-reset" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
              <option value="never" ${q.reset_type === 'never' ? 'selected' : ''}>Никогда</option>
              <option value="daily" ${q.reset_type === 'daily' ? 'selected' : ''}>Ежедневно</option>
              <option value="weekly" ${q.reset_type === 'weekly' ? 'selected' : ''}>Еженедельно</option>
            </select>
          </div>
        </div>

        <!-- Спонсорские поля -->
        <div id="admin-sponsor-fields" style="display: ${q.type === 'sponsor' ? 'block' : 'none'};">
          <div style="border-top: 1px solid var(--app-border-color-light); padding-top: 10px; margin-top: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--app-text-secondary); margin-bottom: 8px;">🤝 Партнёрские данные</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Название партнёра</label>
                <input id="admin-quest-sponsor" value="${q.sponsor_name || ''}" placeholder="Имя партнёра" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                ">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Ссылка/Цель</label>
                <input id="admin-quest-target-url" value="${q.sponsor_target || ''}" placeholder="https://..." style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                ">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Тип действия</label>
                <select id="admin-quest-action" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                ">
                  <option value="subscribe" ${q.sponsor_action_required === 'subscribe' ? 'selected' : ''}>📢 Подписка</option>
                  <option value="visit" ${q.sponsor_action_required === 'visit' ? 'selected' : ''}>🌐 Переход</option>
                  <option value="action" ${q.sponsor_action_required === 'action' ? 'selected' : ''}>⚡ Действие</option>
                  <option value="survey" ${q.sponsor_action_required === 'survey' ? 'selected' : ''}>📝 Опрос</option>
                </select>
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Верификация</label>
                <select id="admin-quest-verification" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                ">
                  <option value="auto" ${q.verification_type === 'auto' ? 'selected' : ''}>⚡ Авто</option>
                  <option value="pseudo" ${q.verification_type === 'pseudo' ? 'selected' : ''}>⏳ Псевдо (${q.pseudo_hours || 12}ч)</option>
                  <option value="manual" ${q.verification_type === 'manual' ? 'selected' : ''}>👤 Ручная</option>
                </select>
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Часов проверки</label>
                <input id="admin-quest-pseudo-hours" type="number" value="${q.pseudo_hours || 12}" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                ">
              </div>
            </div>
          </div>
        </div>

        <!-- Ивентовые поля -->
        <div id="admin-event-fields" style="display: ${q.type === 'event' ? 'block' : 'none'};">
          <div style="border-top: 1px solid var(--app-border-color-light); padding-top: 10px; margin-top: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--app-text-secondary); margin-bottom: 8px;">🎪 Ивентовые данные</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Баннер (URL)</label>
                <input id="admin-quest-banner" value="${q.event_banner || ''}" placeholder="https://..." style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                ">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Цвет ивента</label>
                <input id="admin-quest-color" type="color" value="${q.event_color || '#e74c3c'}" style="
                  width: 100%;
                  padding: 4px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  outline: none;
                  height: 40px;
                ">
              </div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Начало</label>
            <input id="admin-quest-starts" type="datetime-local" value="${q.starts_at ? new Date(q.starts_at).toISOString().slice(0, 16) : ''}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Окончание</label>
            <input id="admin-quest-expires" type="datetime-local" value="${q.expires_at ? new Date(q.expires_at).toISOString().slice(0, 16) : ''}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Макс. выполнений</label>
            <input id="admin-quest-max-completions" type="number" value="${q.max_completions || ''}" placeholder="Безлимит" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Кулдаун (часы)</label>
            <input id="admin-quest-cooldown" type="number" value="${q.cooldown_hours || 0}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button onclick="window.adminModule.saveQuest('${q.id || ''}')" style="
            flex: 1;
            padding: 12px;
            border-radius: 8px;
            border: none;
            background: var(--app-gradient-primary);
            color: var(--app-text-inverse);
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
          ">
            💾 ${isEdit ? 'Обновить' : 'Создать'}
          </button>
          <button onclick="document.getElementById('admin-quest-form').style.display='none'" style="
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: transparent;
            color: var(--app-text-secondary);
            cursor: pointer;
          ">
            ✕ Отмена
          </button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // ПУБЛИЧНЫЙ МЕТОД ДЛЯ ПЕРЕКЛЮЧЕНИЯ ПОЛЕЙ
  // ==========================================

  toggleQuestFields(type: string): void {
    const sponsorFields = document.getElementById('admin-sponsor-fields');
    const eventFields = document.getElementById('admin-event-fields');
    
    if (sponsorFields) {
      sponsorFields.style.display = type === 'sponsor' ? 'block' : 'none';
    }
    if (eventFields) {
      eventFields.style.display = type === 'event' ? 'block' : 'none';
    }
  }

  // ==========================================
  // ДЕЙСТВИЯ С КВЕСТАМИ
  // ==========================================

  showCreateQuestForm(): void {
    const form = document.getElementById('admin-quest-form');
    if (!form) return;

    this._editingQuestId = null;

    const isVisible = form.style.display !== 'none';
    form.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      (document.getElementById('admin-quest-title') as HTMLInputElement).value = '';
      (document.getElementById('admin-quest-description') as HTMLTextAreaElement).value = '';
      (document.getElementById('admin-quest-reward') as HTMLInputElement).value = '0';
      (document.getElementById('admin-quest-target') as HTMLInputElement).value = '1';
      (document.getElementById('admin-quest-sponsor') as HTMLInputElement).value = '';
      (document.getElementById('admin-quest-target-url') as HTMLInputElement).value = '';
      (document.getElementById('admin-quest-pseudo-hours') as HTMLInputElement).value = '12';
      (document.getElementById('admin-quest-max-completions') as HTMLInputElement).value = '';
      (document.getElementById('admin-quest-cooldown') as HTMLInputElement).value = '0';
      (document.getElementById('admin-quest-type') as HTMLSelectElement).value = 'daily';

      const now = new Date();
      const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      (document.getElementById('admin-quest-starts') as HTMLInputElement).value = 
        startDate.toISOString().slice(0, 16);

      const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      (document.getElementById('admin-quest-expires') as HTMLInputElement).value = 
        expiresDate.toISOString().slice(0, 16);

      this.toggleQuestFields('daily');

      const saveBtn = form.querySelector('button[onclick*="saveQuest"]') as HTMLButtonElement;
      if (saveBtn) {
        saveBtn.textContent = '💾 Создать';
        saveBtn.setAttribute('onclick', `window.adminModule.saveQuest('')`);
      }
    }

    form.scrollIntoView({ behavior: 'smooth' });
  }

  async editQuest(questId: UUID): Promise<void> {
    console.log(`✏️ Редактируем квест ${questId}`);

    await this.loadQuests();

    const quest = this._quests.find(q => q.id === questId);
    if (!quest) {
      console.error(`❌ Квест ${questId} не найден в списке`);
      this.uiRenderer?.showToast('⚠️ Квест не найден. Обновите страницу.', 'error', 1500);
      return;
    }

    this._editingQuestId = questId;

    const form = document.getElementById('admin-quest-form');
    if (!form) return;

    (document.getElementById('admin-quest-title') as HTMLInputElement).value = quest.title?.ru || '';
    (document.getElementById('admin-quest-description') as HTMLTextAreaElement).value = quest.description?.ru || '';
    (document.getElementById('admin-quest-type') as HTMLSelectElement).value = quest.type;
    (document.getElementById('admin-quest-reward') as HTMLInputElement).value = String(quest.reward_coins);
    (document.getElementById('admin-quest-target') as HTMLInputElement).value = String(quest.target);
    (document.getElementById('admin-quest-reset') as HTMLSelectElement).value = quest.reset_type;
    (document.getElementById('admin-quest-sponsor') as HTMLInputElement).value = quest.sponsor_name || '';
    (document.getElementById('admin-quest-target-url') as HTMLInputElement).value = quest.sponsor_target || '';
    (document.getElementById('admin-quest-action') as HTMLSelectElement).value = quest.sponsor_action_required || 'subscribe';
    (document.getElementById('admin-quest-verification') as HTMLSelectElement).value = quest.verification_type;
    (document.getElementById('admin-quest-pseudo-hours') as HTMLInputElement).value = String(quest.pseudo_hours || 12);
    (document.getElementById('admin-quest-max-completions') as HTMLInputElement).value = quest.max_completions ? String(quest.max_completions) : '';
    (document.getElementById('admin-quest-cooldown') as HTMLInputElement).value = String(quest.cooldown_hours || 0);
    (document.getElementById('admin-quest-banner') as HTMLInputElement).value = quest.event_banner || '';
    (document.getElementById('admin-quest-color') as HTMLInputElement).value = quest.event_color || '#e74c3c';

    if (quest.starts_at) {
      (document.getElementById('admin-quest-starts') as HTMLInputElement).value = 
        new Date(quest.starts_at).toISOString().slice(0, 16);
    }
    if (quest.expires_at) {
      (document.getElementById('admin-quest-expires') as HTMLInputElement).value = 
        new Date(quest.expires_at).toISOString().slice(0, 16);
    }

    this.toggleQuestFields(quest.type);

    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth' });

    const saveBtn = form.querySelector('button[onclick*="saveQuest"]') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.textContent = '💾 Обновить';
      saveBtn.setAttribute('onclick', `window.adminModule.saveQuest('${questId}')`);
    }
  }

  // ==========================================
  // ✅ ИСПРАВЛЕНО: saveQuest — сохраняем is_active
  // ==========================================

  async saveQuest(questId: string): Promise<void> {
    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
    const getNum = (id: string) => parseInt((document.getElementById(id) as HTMLInputElement)?.value || '0', 10) || 0;

    const isEditing = questId && questId.length > 0;
    console.log(`💾 Сохраняем квест: ${isEditing ? 'редактирование' : 'создание'}`, { questId });

    const type = getVal('admin-quest-type') as 'daily' | 'sponsor' | 'event';

    // ✅ Для редактирования — получаем текущий статус из формы
    // Для создания — всегда активен
    let isActive = true;
    if (isEditing) {
      const quest = this._quests.find(q => q.id === questId);
      if (quest) {
        isActive = quest.is_active;
      }
    }

    const data = {
      title: { ru: getVal('admin-quest-title'), en: getVal('admin-quest-title') },
      description: { ru: getVal('admin-quest-description'), en: getVal('admin-quest-description') },
      type: type,
      category: type,
      reward_coins: getNum('admin-quest-reward'),
      target: getNum('admin-quest-target'),
      reset_type: getVal('admin-quest-reset') as 'never' | 'daily' | 'weekly',
      cooldown_hours: getNum('admin-quest-cooldown'),
      max_completions: parseInt(getVal('admin-quest-max-completions')) || null,
      verification_type: getVal('admin-quest-verification') as 'auto' | 'pseudo' | 'manual',
      pseudo_hours: getNum('admin-quest-pseudo-hours'),
      starts_at: getVal('admin-quest-starts') || new Date().toISOString(),
      expires_at: getVal('admin-quest-expires') || null,
      sponsor_name: getVal('admin-quest-sponsor') || null,
      sponsor_target: getVal('admin-quest-target-url') || null,
      sponsor_action_required: getVal('admin-quest-action') || null,
      event_banner: getVal('admin-quest-banner') || null,
      event_color: getVal('admin-quest-color') || null,
      is_active: isActive,  // ✅ Сохраняем текущий статус
    };

    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      
      const endpoint = isEditing ? `/api/admin/quests/${questId}` : '/api/admin/quests';
      const method = isEditing ? 'PUT' : 'POST';

      console.log(`📤 ${method} ${endpoint}`, data);

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: JSON.stringify(data),
      });

      console.log(`📥 Ответ: status ${response.status}`);

      const text = await response.text();
      console.log(`📥 Тело ответа:`, text || '(пусто)');

      if (!response.ok) {
        if (response.status === 405 && isEditing) {
          console.warn('⚠️ Получили 405, пробуем PATCH...');
          
          const fallbackResponse = await fetch(endpoint, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-Telegram-Init-Data': initData,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            body: JSON.stringify(data),
          });
          
          if (fallbackResponse.ok) {
            this.uiRenderer?.showToast('✅ Квест обновлён (через PATCH)', 'success', 1500);
            document.getElementById('admin-quest-form')!.style.display = 'none';
            await this._refreshContent();
            return;
          }
        }
        throw new Error(`HTTP ${response.status}: ${text || 'Unknown error'}`);
      }

      if (!text || text.trim().length === 0) {
        console.log('✅ Пустой ответ при статусе OK — операция успешна');
        this.uiRenderer?.showToast(
          isEditing ? '✅ Квест обновлён' : '✅ Квест создан',
          'success',
          1500
        );
        document.getElementById('admin-quest-form')!.style.display = 'none';
        await this._refreshContent();
        return;
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch (parseErr) {
        console.warn('⚠️ Ответ не JSON, но статус OK');
        this.uiRenderer?.showToast(
          isEditing ? '✅ Квест обновлён' : '✅ Квест создан',
          'success',
          1500
        );
        document.getElementById('admin-quest-form')!.style.display = 'none';
        await this._refreshContent();
        return;
      }

      if (result.success) {
        this.uiRenderer?.showToast(
          isEditing ? '✅ Квест обновлён' : '✅ Квест создан',
          'success',
          1500
        );
        document.getElementById('admin-quest-form')!.style.display = 'none';
        await this._refreshContent();
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка сохранения квеста:', err);
      this.uiRenderer?.showToast(`⚠️ ${(err as Error).message}`, 'error', 1500);
    }
  }

  // ==========================================
  // toggleQuestStatus (без изменений, работает)
  // ==========================================

  async toggleQuestStatus(questId: UUID): Promise<void> {
    console.log(`⏸️ Переключаем статус квеста ${questId}`);

    await this.loadQuests();

    const quest = this._quests.find(q => q.id === questId);
    if (!quest) {
      console.error(`❌ Квест ${questId} не найден`);
      this.uiRenderer?.showToast('⚠️ Квест не найден', 'error', 1500);
      return;
    }

    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const endpoint = `/api/admin/quests/${questId}`;

      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: JSON.stringify({ is_active: !quest.is_active }),
      });

      if (!response.ok) {
        if (response.status === 405) {
          console.warn('⚠️ PATCH вернул 405, пробуем PUT...');
          const fallbackResponse = await fetch(endpoint, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Telegram-Init-Data': initData,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            body: JSON.stringify({ is_active: !quest.is_active }),
          });
          
          if (fallbackResponse.ok) {
            this.uiRenderer?.showToast(
              quest.is_active ? '⏸️ Квест приостановлен' : '▶️ Квест активирован',
              'info',
              1500
            );
            await this._refreshContent();
            return;
          }
        }
        throw new Error(`HTTP ${response.status}`);
      }

      this.uiRenderer?.showToast(
        quest.is_active ? '⏸️ Квест приостановлен' : '▶️ Квест активирован',
        'info',
        1500
      );
      
      await this._refreshContent();
    } catch (err) {
      console.error('❌ Ошибка изменения статуса:', err);
      this.uiRenderer?.showToast(`⚠️ ${(err as Error).message}`, 'error', 1500);
    }
  }

  // ==========================================
  // deleteQuest (без изменений, работает)
  // ==========================================

  async deleteQuest(questId: UUID): Promise<void> {
    if (!confirm('Удалить этот квест навсегда? Все данные прогресса будут потеряны!')) return;

    console.log(`🗑️ Удаляем квест ${questId}`);

    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const endpoint = `/api/admin/quests/${questId}`;

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'X-Telegram-Init-Data': initData,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.uiRenderer?.showToast('🗑️ Квест удалён', 'info', 1500);
      
      await this._refreshContent();
    } catch (err) {
      console.error('❌ Ошибка удаления квеста:', err);
      this.uiRenderer?.showToast(`⚠️ ${(err as Error).message}`, 'error', 1500);
    }
  }

  // ==========================================
  // ОСТАЛЬНЫЕ МЕТОДЫ (экономика, аудит, и т.д.)
  // ==========================================

  private _renderEconomyTab(): string {
    // ... (код без изменений, использует this._rules)
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary);">
            ⚙️ Правила начисления монет
          </div>
          <button onclick="window.adminModule.showCreateRuleForm()" style="
            padding: 6px 14px;
            border-radius: 8px;
            border: none;
            background: var(--app-accent-primary);
            color: var(--app-text-inverse);
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
          ">
            ➕ Добавить
          </button>
        </div>

        <div style="font-size: 12px; color: var(--app-text-tertiary); margin-bottom: 12px;">
          Правила определяют, сколько монет начисляется за различные действия.
          Сумма 0 означает, что сумма берётся из события.
        </div>

        <div id="admin-rule-form" style="display: none; background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; margin-bottom: 12px; border: 1px solid var(--app-border-color-light);">
          ${this._renderRuleForm()}
        </div>

        <div id="economy-rules-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 400px; overflow-y: auto;">
          ${this._renderRulesList()}
        </div>

        <button onclick="window.adminModule.reloadRules()" style="
          margin-top: 12px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--app-border-color);
          background: var(--app-bg-tertiary);
          color: var(--app-text-primary);
          font-size: 12px;
          cursor: pointer;
          width: 100%;
        ">
          🔄 Перезагрузить правила
        </button>
      </div>
    `;
  }

  private _renderRuleForm(rule?: IEconomyRule): string {
    const isEdit = !!rule;
    const r = rule || {} as IEconomyRule;

    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 10px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Источник *</label>
            <input id="admin-rule-source" value="${r.source || ''}" placeholder="game:tetris:win" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-secondary);
              color: var(--app-text-primary);
              font-size: 12px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 10px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Сумма 🪙</label>
            <input id="admin-rule-amount" type="number" value="${r.amount || 0}" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-secondary);
              color: var(--app-text-primary);
              font-size: 12px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 10px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Кулдаун (часы)</label>
            <input id="admin-rule-cooldown" type="number" value="${r.cooldown_hours || 0}" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-secondary);
              color: var(--app-text-primary);
              font-size: 12px;
              outline: none;
            ">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 10px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Макс. на пользователя</label>
            <input id="admin-rule-max" type="number" value="${r.max_per_user || ''}" placeholder="Безлимит" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-secondary);
              color: var(--app-text-primary);
              font-size: 12px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 10px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Валюта</label>
            <select id="admin-rule-currency" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-secondary);
              color: var(--app-text-primary);
              font-size: 12px;
              outline: none;
            ">
              <option value="FIBI" ${r.currency === 'FIBI' ? 'selected' : ''}>🪙 FIBI</option>
              <option value="TOKEN" ${r.currency === 'TOKEN' ? 'selected' : ''}>🔮 TOKEN</option>
            </select>
          </div>
        </div>
        <div>
          <label style="font-size: 10px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Описание</label>
          <input id="admin-rule-description" value="${r.description || ''}" placeholder="Описание правила" style="
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-secondary);
            color: var(--app-text-primary);
            font-size: 12px;
            outline: none;
          ">
        </div>
        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button onclick="window.adminModule.saveRule('${r.id || ''}')" style="
            flex: 1;
            padding: 10px;
            border-radius: 6px;
            border: none;
            background: var(--app-gradient-primary);
            color: var(--app-text-inverse);
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
          ">
            💾 ${isEdit ? 'Обновить' : 'Создать'}
          </button>
          <button onclick="document.getElementById('admin-rule-form').style.display='none'" style="
            padding: 10px 16px;
            border-radius: 6px;
            border: 1px solid var(--app-border-color);
            background: transparent;
            color: var(--app-text-secondary);
            cursor: pointer;
          ">
            ✕ Отмена
          </button>
        </div>
      </div>
    `;
  }

  private _renderRulesList(): string {
    if (this._rules.length === 0) {
      return `
        <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary); font-size: 13px;">
          Нет правил. Добавьте первое правило.
        </div>
      `;
    }

    return this._rules.map((rule: IEconomyRule) => `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: var(--app-bg-tertiary);
        border-radius: 8px;
        border-left: 3px solid ${rule.is_active ? '#27ae60' : '#e74c3c'};
        opacity: ${rule.is_active ? 1 : 0.5};
      ">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 500; color: var(--app-text-primary);">
            ${rule.source}
          </div>
          <div style="font-size: 11px; color: var(--app-text-tertiary);">
            ${rule.amount} 🪙 • ${rule.cooldown_hours}h кулдаун • ${rule.max_per_user === null ? '∞' : rule.max_per_user} раз
            ${rule.currency !== 'FIBI' ? ` • ${rule.currency}` : ''}
          </div>
          ${rule.description ? `<div style="font-size: 10px; color: var(--app-text-tertiary); opacity: 0.7;">${rule.description}</div>` : ''}
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0; margin-left: 8px;">
          <button onclick="window.adminModule.editRule('${rule.id}')" style="
            background: var(--app-bg-secondary);
            border: 1px solid var(--app-border-color);
            border-radius: 4px;
            padding: 2px 8px;
            color: var(--app-text-primary);
            font-size: 11px;
            cursor: pointer;
          ">
            ✏️
          </button>
          <button onclick="window.adminModule.toggleRule('${rule.id}')" style="
            background: ${rule.is_active ? 'rgba(231, 76, 60, 0.1)' : 'rgba(39, 174, 96, 0.1)'};
            border: 1px solid ${rule.is_active ? 'rgba(231, 76, 60, 0.2)' : 'rgba(39, 174, 96, 0.2)'};
            border-radius: 4px;
            padding: 2px 8px;
            color: ${rule.is_active ? '#e74c3c' : '#27ae60'};
            font-size: 11px;
            cursor: pointer;
          ">
            ${rule.is_active ? '⏸️' : '▶️'}
          </button>
        </div>
      </div>
    `).join('');
  }

  showCreateRuleForm(): void {
    const form = document.getElementById('admin-rule-form');
    if (!form) return;

    this._editingRuleId = null;
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    
    if (form.style.display === 'block') {
      (document.getElementById('admin-rule-source') as HTMLInputElement).value = '';
      (document.getElementById('admin-rule-amount') as HTMLInputElement).value = '0';
      (document.getElementById('admin-rule-cooldown') as HTMLInputElement).value = '0';
      (document.getElementById('admin-rule-max') as HTMLInputElement).value = '';
      (document.getElementById('admin-rule-description') as HTMLInputElement).value = '';
      (document.getElementById('admin-rule-currency') as HTMLSelectElement).value = 'FIBI';
    }

    form.scrollIntoView({ behavior: 'smooth' });
  }

  async editRule(ruleId: UUID): Promise<void> {
    const rule = this._rules.find(r => r.id === ruleId);
    if (!rule) {
      this.uiRenderer?.showToast('⚠️ Правило не найдено', 'error', 1500);
      return;
    }

    this._editingRuleId = ruleId;
    const form = document.getElementById('admin-rule-form');
    if (!form) return;

    (document.getElementById('admin-rule-source') as HTMLInputElement).value = rule.source;
    (document.getElementById('admin-rule-amount') as HTMLInputElement).value = String(rule.amount);
    (document.getElementById('admin-rule-cooldown') as HTMLInputElement).value = String(rule.cooldown_hours);
    (document.getElementById('admin-rule-max') as HTMLInputElement).value = rule.max_per_user ? String(rule.max_per_user) : '';
    (document.getElementById('admin-rule-description') as HTMLInputElement).value = rule.description || '';
    (document.getElementById('admin-rule-currency') as HTMLSelectElement).value = rule.currency || 'FIBI';

    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth' });
  }

  async saveRule(ruleId: string): Promise<void> {
    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
    const getNum = (id: string) => parseInt((document.getElementById(id) as HTMLInputElement)?.value || '0', 10) || 0;

    const source = getVal('admin-rule-source');
    if (!source) {
      this.uiRenderer?.showToast('⚠️ Источник обязателен', 'error', 1500);
      return;
    }

    const data = {
      source: source,
      amount: getNum('admin-rule-amount'),
      cooldown_hours: getNum('admin-rule-cooldown'),
      max_per_user: parseInt(getVal('admin-rule-max')) || null,
      description: getVal('admin-rule-description') || null,
      currency: getVal('admin-rule-currency') || 'FIBI',
    };

    try {
      const { supabaseFetch, getSupabaseConfig } = await import('@api/_lib/supabase-client');
      const config = getSupabaseConfig('service');

      if (ruleId) {
        await supabaseFetch(
          `economy_rules?id=eq.${ruleId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...data,
              updated_at: new Date().toISOString(),
            }),
          },
          config
        );
      } else {
        await supabaseFetch(
          'economy_rules',
          {
            method: 'POST',
            body: JSON.stringify({
              ...data,
              created_at: new Date().toISOString(),
            }),
          },
          config
        );
      }

      this.uiRenderer?.showToast(
        ruleId ? '✅ Правило обновлено' : '✅ Правило создано',
        'success',
        1500
      );

      document.getElementById('admin-rule-form')!.style.display = 'none';
      await this._refreshContent();
    } catch (err) {
      console.error('❌ Ошибка сохранения правила:', err);
      this.uiRenderer?.showToast(`⚠️ ${(err as Error).message}`, 'error', 1500);
    }
  }

  async toggleRule(ruleId: UUID): Promise<void> {
    const rule = this._rules.find(r => r.id === ruleId);
    if (!rule) return;

    try {
      const { supabaseFetch, getSupabaseConfig } = await import('@api/_lib/supabase-client');
      const config = getSupabaseConfig('service');

      await supabaseFetch(
        `economy_rules?id=eq.${ruleId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_active: !rule.is_active,
            updated_at: new Date().toISOString(),
          }),
        },
        config
      );

      this.uiRenderer?.showToast(
        rule.is_active ? '⏸️ Правило отключено' : '▶️ Правило активировано',
        'info',
        1500
      );

      await this._refreshContent();
    } catch (err) {
      console.error('❌ Ошибка переключения правила:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка', 'error', 1500);
    }
  }

  async reloadRules(): Promise<void> {
    await this._refreshContent();
    this.uiRenderer?.showToast('🔄 Правила перезагружены', 'info', 1500);
  }

  async searchAudit(): Promise<void> {
    const userId = parseInt((document.getElementById('audit-user-filter') as HTMLInputElement)?.value || '0', 10);
    const eventType = (document.getElementById('audit-type-filter') as HTMLSelectElement)?.value || '';

    await this.loadAudit({
      userId: userId || undefined,
      eventType: eventType || undefined,
    });

    this._refreshContent();
    this.uiRenderer?.showToast(
      `📋 Загружено ${this._auditLogs.length} записей`,
      'info',
      1500
    );
  }

  private _renderCoinsTab(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">💰 Управление монетами</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <input id="admin-coin-user" type="number" placeholder="Telegram ID" style="
            flex: 1;
            min-width: 120px;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
          <input id="admin-coin-amount" type="number" placeholder="Сумма" style="
            width: 100px;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
          <input id="admin-coin-reason" placeholder="Причина" style="
            flex: 1;
            min-width: 120px;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
          <button onclick="window.adminModule.manageCoins('add')" style="
            padding: 10px 16px;
            border-radius: 8px;
            border: none;
            background: #27ae60;
            color: white;
            font-weight: 600;
            cursor: pointer;
          ">
            ➕ Начислить
          </button>
          <button onclick="window.adminModule.manageCoins('spend')" style="
            padding: 10px 16px;
            border-radius: 8px;
            border: none;
            background: #e74c3c;
            color: white;
            font-weight: 600;
            cursor: pointer;
          ">
            ➖ Списать
          </button>
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: var(--app-text-tertiary);">
          ⚠️ Введите Telegram ID пользователя и сумму монет
        </div>
      </div>
    `;
  }

  private _renderReferralsTab(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">🤝 Управление рефералами</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <input id="admin-ref-user" type="number" placeholder="Telegram ID" style="
            flex: 1;
            min-width: 120px;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
          <button onclick="window.adminModule.resetReferralLimit()" style="
            padding: 10px 16px;
            border-radius: 8px;
            border: none;
            background: #f39c12;
            color: white;
            font-weight: 600;
            cursor: pointer;
          ">
            🔄 Сбросить лимит
          </button>
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: var(--app-text-tertiary);">
          ⚠️ Сброс лимита позволит пользователю снова получать награды за рефералов
        </div>
      </div>
    `;
  }

  private _renderUsersTab(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">👤 Управление пользователями</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
          <input id="admin-user-id" type="number" placeholder="Telegram ID" style="
            flex: 1;
            min-width: 120px;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
          <select id="admin-user-role" style="
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
            <option value="trial">🔓 Бесплатный</option>
            <option value="premium">⭐ PRO</option>
            <option value="admin">👑 Админ</option>
            <option value="creator">👑 Создатель</option>
          </select>
          <button onclick="window.adminModule.updateUserRole()" style="
            padding: 10px 16px;
            border-radius: 8px;
            border: none;
            background: var(--app-accent-primary);
            color: var(--app-text-inverse);
            font-weight: 600;
            cursor: pointer;
          ">
            💾 Обновить роль
          </button>
        </div>
        <div style="border-top: 1px solid var(--app-border-color-light); padding-top: 12px; margin-top: 4px;">
          <div style="font-size: 13px; font-weight: 600; color: var(--app-text-secondary); margin-bottom: 8px;">
            🔒 Блокировка экономических операций
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <input id="admin-user-lock-id" type="number" placeholder="Telegram ID" style="
              flex: 1;
              min-width: 120px;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
            <button onclick="window.adminModule.toggleUserLock(true)" style="
              padding: 10px 16px;
              border-radius: 8px;
              border: none;
              background: #e74c3c;
              color: white;
              font-weight: 600;
              cursor: pointer;
            ">
              🔒 Заблокировать
            </button>
            <button onclick="window.adminModule.toggleUserLock(false)" style="
              padding: 10px 16px;
              border-radius: 8px;
              border: none;
              background: #27ae60;
              color: white;
              font-weight: 600;
              cursor: pointer;
            ">
              🔓 Разблокировать
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderAuditTab(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 12px;">
          📜 Аудит экономических операций
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <input id="audit-user-filter" type="number" placeholder="ID пользователя" style="
            flex: 1;
            min-width: 100px;
            padding: 8px 10px;
            border-radius: 6px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 12px;
            outline: none;
          ">
          <select id="audit-type-filter" style="
            padding: 8px 10px;
            border-radius: 6px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 12px;
            outline: none;
          ">
            <option value="">Все типы</option>
            <option value="EARN">📈 Начисления</option>
            <option value="SPEND">📉 Списания</option>
            <option value="REFUND">🔄 Возвраты</option>
            <option value="ADJUST">⚙️ Корректировки</option>
          </select>
          <button onclick="window.adminModule.searchAudit()" style="
            padding: 8px 16px;
            border-radius: 6px;
            border: none;
            background: var(--app-accent-primary);
            color: var(--app-text-inverse);
            font-weight: 600;
            cursor: pointer;
            font-size: 12px;
          ">
            🔍 Найти
          </button>
        </div>

        <div id="audit-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 450px; overflow-y: auto;">
          ${this._renderAuditList()}
        </div>
      </div>
    `;
  }

  private _renderAuditList(): string {
    if (this._auditLogs.length === 0) {
      return `
        <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary); font-size: 13px;">
          📭 Нет записей
        </div>
      `;
    }

    return this._auditLogs.map((log: IAuditLog) => {
      const date = new Date(log.created_at);
      const dateStr = date.toLocaleString();
      const isEarn = log.event_type === 'EARN';
      const sign = isEarn ? '+' : '';
      const color = isEarn ? '#27ae60' : '#e74c3c';

      return `
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: var(--app-bg-tertiary);
          border-radius: 6px;
          border-left: 3px solid ${color};
          font-size: 12px;
          gap: 8px;
        ">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; color: var(--app-text-primary);">
              ${log.source}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">
              👤 ${log.user_id} • ${dateStr} • ${log.event_type}
              ${log.metadata?.reason ? ` • ${log.metadata.reason}` : ''}
            </div>
          </div>
          <div style="font-weight: 600; color: ${color};">
            ${sign}${log.amount} 🪙
          </div>
        </div>
      `;
    }).join('');
  }

  async manageCoins(action: 'add' | 'spend'): Promise<void> {
    const userId = parseInt((document.getElementById('admin-coin-user') as HTMLInputElement)?.value || '0', 10);
    const amount = parseInt((document.getElementById('admin-coin-amount') as HTMLInputElement)?.value || '0', 10);
    const reason = (document.getElementById('admin-coin-reason') as HTMLInputElement)?.value || 'Админ-действие';

    if (!userId || userId <= 0) {
      this.uiRenderer?.showToast('⚠️ Введите корректный Telegram ID', 'error', 1500);
      return;
    }

    if (!amount || amount <= 0) {
      this.uiRenderer?.showToast('⚠️ Введите корректную сумму', 'error', 1500);
      return;
    }

    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const response = await fetch('/api/admin/coins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({ user_id: userId, amount, reason, action }),
      });

      const result = await response.json();
      if (result.success) {
        this.uiRenderer?.showToast(
          `✅ ${action === 'add' ? 'Начислено' : 'Списано'} ${amount} монет пользователю ${userId}`,
          'success',
          2000
        );
        (document.getElementById('admin-coin-user') as HTMLInputElement).value = '';
        (document.getElementById('admin-coin-amount') as HTMLInputElement).value = '';
        (document.getElementById('admin-coin-reason') as HTMLInputElement).value = '';
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка управления монетами:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

  async resetReferralLimit(): Promise<void> {
    const userId = parseInt((document.getElementById('admin-ref-user') as HTMLInputElement)?.value || '0', 10);

    if (!userId || userId <= 0) {
      this.uiRenderer?.showToast('⚠️ Введите корректный Telegram ID', 'error', 1500);
      return;
    }

    if (!confirm(`Сбросить лимит рефералов для пользователя ${userId}?`)) return;

    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const response = await fetch('/api/admin/referrals/reset-limit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const result = await response.json();
      if (result.success) {
        this.uiRenderer?.showToast(`✅ Лимит сброшен для пользователя ${userId}`, 'success', 2000);
        (document.getElementById('admin-ref-user') as HTMLInputElement).value = '';
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка сброса лимита:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

  async updateUserRole(): Promise<void> {
    const userId = parseInt((document.getElementById('admin-user-id') as HTMLInputElement)?.value || '0', 10);
    const role = (document.getElementById('admin-user-role') as HTMLSelectElement)?.value || 'trial';

    if (!userId || userId <= 0) {
      this.uiRenderer?.showToast('⚠️ Введите корректный Telegram ID', 'error', 1500);
      return;
    }

    if (!confirm(`Изменить роль пользователя ${userId} на "${role}"?`)) return;

    try {
      const initData = (window as any).Telegram?.WebApp?.initData || '';
      const response = await fetch('/api/admin/users/role', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({ user_id: userId, role }),
      });

      const result = await response.json();
      if (result.success) {
        this.uiRenderer?.showToast(`✅ Роль обновлена для пользователя ${userId}`, 'success', 2000);
        (document.getElementById('admin-user-id') as HTMLInputElement).value = '';
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка обновления роли:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

  async toggleUserLock(lock: boolean): Promise<void> {
    const userId = parseInt((document.getElementById('admin-user-lock-id') as HTMLInputElement)?.value || '0', 10);

    if (!userId || userId <= 0) {
      this.uiRenderer?.showToast('⚠️ Введите корректный Telegram ID', 'error', 1500);
      return;
    }

    const action = lock ? 'заблокировать' : 'разблокировать';
    if (!confirm(`${lock ? '🔒' : '🔓'} ${action.charAt(0).toUpperCase() + action.slice(1)} пользователя ${userId}?`)) return;

    try {
      const { economyService } = await import('@/economy/EconomyService');
      const success = await economyService.toggleUserLock(userId, lock);

      if (success) {
        this.uiRenderer?.showToast(
          `${lock ? '🔒' : '🔓'} Пользователь ${userId} ${action}ен`,
          'success',
          2000
        );
        (document.getElementById('admin-user-lock-id') as HTMLInputElement).value = '';
      } else {
        this.uiRenderer?.showToast('⚠️ Ошибка изменения статуса', 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка блокировки пользователя:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

  // ==========================================
  // УПРАВЛЕНИЕ МОДУЛЕМ
  // ==========================================

  show(): void {
    if (this.userStore.role !== 'creator') {
      this.container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--app-text-tertiary);">
          <div style="font-size: 48px; margin-bottom: 12px;">⛔</div>
          <div style="font-size: 16px; font-weight: 600;">Доступ запрещён</div>
          <div style="font-size: 13px; margin-top: 4px;">Только для создателя приложения</div>
        </div>
      `;
      return;
    }

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle('👑 Админ-панель');
    this.headerManager.setActions([]);

    this._refreshContent();

    if ((window as any).navigation) {
      (window as any).navigation.hide();
    }
  }

  hide(): void {
    this.container.classList.add('hidden');
    this.container.style.display = 'none';

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки AdminModule:', e);
      }
    }
    this._subscriptions = [];
    this.container.innerHTML = '';
    console.log('🗑️ AdminModule уничтожен');
  }
}

// Привязываем методы для глобального доступа
(window as any).AdminModule = AdminModule;
const adminModule = new AdminModule(document.createElement('div'));

(window as any).adminModule = adminModule;
(window as any).showCreateQuestForm = adminModule.showCreateQuestForm.bind(adminModule);
(window as any).editQuest = adminModule.editQuest.bind(adminModule);
(window as any).saveQuest = adminModule.saveQuest.bind(adminModule);
(window as any).toggleQuestStatus = adminModule.toggleQuestStatus.bind(adminModule);
(window as any).deleteQuest = adminModule.deleteQuest.bind(adminModule);
(window as any).toggleQuestFields = adminModule.toggleQuestFields.bind(adminModule);
(window as any).showCreateRuleForm = adminModule.showCreateRuleForm.bind(adminModule);
(window as any).editRule = adminModule.editRule.bind(adminModule);
(window as any).saveRule = adminModule.saveRule.bind(adminModule);
(window as any).toggleRule = adminModule.toggleRule.bind(adminModule);
(window as any).reloadRules = adminModule.reloadRules.bind(adminModule);
(window as any).searchAudit = adminModule.searchAudit.bind(adminModule);
(window as any).manageCoins = adminModule.manageCoins.bind(adminModule);
(window as any).resetReferralLimit = adminModule.resetReferralLimit.bind(adminModule);
(window as any).updateUserRole = adminModule.updateUserRole.bind(adminModule);
(window as any).toggleUserLock = adminModule.toggleUserLock.bind(adminModule);

console.log('✅ AdminModule v4.8.0 загружен');
