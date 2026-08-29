// ============================================
// src/modules/admin/AdminModule.ts
// Контейнер админ-панели (максимально простой)
// Версия: 6.1.0 — добавлена вкладка Квесты
// ============================================

import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';

export class AdminModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _activeTab: string = 'dashboard';
  private _isVisible: boolean = false;
  private headerManager = headerManager;
  private eventBus = eventBus;
  private userStore = userStore;

  // Данные для вкладок
  private limits: any[] = [];
  private settings: any = null;
  private tiers: any[] = [];
  private users: any[] = [];
  private blocks: any[] = [];
  private auditLogs: any[] = [];
  private auditTotal: number = 0;
  private auditPage: number = 0;

  // Данные для квестов
  private quests: any[] = [];
  private questFilterType: string = 'all';
  private questFilterActive: string = 'all';

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
      this.isInitialized = true;
      return;
    }

    await this.loadAllData();
    this.isInitialized = true;
    console.log('✅ AdminModule v6.1.0 инициализирован');
  }

  private async loadAllData(): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');

      const [limitsRes, settingsRes, tiersRes, usersRes, blocksRes, auditRes, questsRes] = await Promise.all([
        apiClient.get('/admin/economy/limits'),
        apiClient.get('/admin/economy/settings'),
        apiClient.get('/admin/economy/subscriptions'),
        apiClient.get('/admin/users'),
        apiClient.get('/admin/economy/blocks'),
        apiClient.get('/economy/audit?limit=50&offset=0'),
        apiClient.get('/admin/quests'),
      ]);

      if (limitsRes.success) this.limits = limitsRes.limits || [];
      if (settingsRes.success) this.settings = settingsRes.settings;
      if (tiersRes.success) this.tiers = tiersRes.tiers || [];
      if (usersRes.success) this.users = usersRes.users || [];
      if (blocksRes.success) this.blocks = blocksRes.blocks || [];
      if (auditRes.success) {
        this.auditLogs = auditRes.logs || [];
        this.auditTotal = auditRes.total || 0;
      }
      if (questsRes.success) this.quests = questsRes.quests || [];
    } catch (err) {
      console.error('[AdminModule] Error loading data:', err);
    }
  }

  private render(): void {
    console.log('🎨 [AdminModule] Рендеринг...');

    this.container.innerHTML = '';

    const tabs = [
      { id: 'dashboard', label: '📊 Дашборд' },
      { id: 'limits', label: '📊 Лимиты' },
      { id: 'quests', label: '🎯 Квесты' },
      { id: 'settings', label: '⚙️ Настройки' },
      { id: 'subscriptions', label: '📦 Подписки' },
      { id: 'audit', label: '📜 Аудит' },
      { id: 'users', label: '👤 Пользователи' },
      { id: 'security', label: '🔐 Безопасность' },
      { id: 'testing', label: '🤖 Тестирование' },
    ];

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      padding: 16px;
      flex: 1;
      overflow-y: auto;
      padding-bottom: 80px;
      display: flex;
      flex-direction: column;
      height: 100%;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 16px;';
    header.innerHTML = `
      <span style="font-size: 24px;">👑</span>
      <h2 style="font-size: 20px; font-weight: 700; margin: 0; color: var(--app-text-primary);">Админ-панель</h2>
    `;
    wrapper.appendChild(header);

    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = `
      display: flex;
      gap: 4px;
      background: var(--app-bg-tertiary);
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 16px;
      flex-shrink: 0;
      overflow-x: auto;
      flex-wrap: wrap;
    `;

    tabs.forEach(tab => {
      const btn = document.createElement('button');
      const isActive = this._activeTab === tab.id;
      btn.textContent = tab.label;
      btn.dataset.tab = tab.id;
      btn.style.cssText = `
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        background: ${isActive ? 'var(--app-accent-primary)' : 'transparent'};
        color: ${isActive ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)'};
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
        font-family: var(--app-font-family);
      `;
      btn.onclick = () => { this.switchTab(tab.id); };
      tabsContainer.appendChild(btn);
    });
    wrapper.appendChild(tabsContainer);

    const content = document.createElement('div');
    content.id = 'admin-tab-content';
    content.style.cssText = 'flex: 1; overflow-y: auto;';
    content.innerHTML = this.renderTabContent(this._activeTab);
    wrapper.appendChild(content);

    this.container.appendChild(wrapper);
    console.log('✅ [AdminModule] Рендеринг завершен');
  }

  private renderTabContent(tabId: string): string {
    switch (tabId) {
      case 'dashboard': return this.renderDashboard();
      case 'limits': return this.renderLimits();
      case 'quests': return this.renderQuests();
      case 'settings': return this.renderSettings();
      case 'subscriptions': return this.renderSubscriptions();
      case 'audit': return this.renderAudit();
      case 'users': return this.renderUsers();
      case 'security': return this.renderSecurity();
      case 'testing': return this.renderTesting();
      default: return '<div style="padding: 20px; text-align: center; color: var(--app-text-tertiary);">Вкладка не найдена</div>';
    }
  }

  // ==========================================
  // DASHBOARD
  // ==========================================
  private renderDashboard(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📊 Дашборд</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 16px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--app-text-primary);">${this.users.length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">Пользователей</div>
          </div>
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 16px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #d4af37;">${this.quests.length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">Квестов</div>
          </div>
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 16px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #27ae60;">${this.quests.filter(q => q.is_active).length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">Активных квестов</div>
          </div>
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 16px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: var(--app-text-primary);">${this.auditTotal}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">Операций в аудите</div>
          </div>
        </div>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('dashboard')" style="padding: 8px 16px; font-size: 13px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // LIMITS
  // ==========================================
  private renderLimits(): string {
    if (!this.limits || this.limits.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📊 Лимиты токенов</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">Нет данных</div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📊 Лимиты токенов (по ролям)</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 8px; color: var(--app-text-tertiary);">Роль</th>
                <th style="text-align: center; padding: 8px; color: var(--app-text-tertiary);">Бонус/день</th>
                <th style="text-align: center; padding: 8px; color: var(--app-text-tertiary);">Постоянные</th>
                <th style="text-align: center; padding: 8px; color: var(--app-text-tertiary);">OpenRouter</th>
              </tr>
            </thead>
            <tbody>
              ${this.limits.map((l: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 8px; font-weight: 600;">${l.role_name || l.role_key}</td>
                  <td style="text-align: center; padding: 8px;">${l.bonus_tokens_per_day ?? '—'}</td>
                  <td style="text-align: center; padding: 8px;">${l.permanent_tokens_on_subscribe ?? '—'}</td>
                  <td style="text-align: center; padding: 8px;">${l.openrouter_limit ?? '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('limits')" style="padding: 8px 16px; font-size: 13px;">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // QUESTS
  // ==========================================
  private renderQuests(): string {
    const filtered = this.quests.filter(q => {
      if (this.questFilterType !== 'all' && q.type !== this.questFilterType) return false;
      if (this.questFilterActive === 'active' && !q.is_active) return false;
      if (this.questFilterActive === 'inactive' && q.is_active) return false;
      return true;
    });

    const activeCount = this.quests.filter(q => q.is_active).length;
    const byType: Record<string, number> = {};
    this.quests.forEach(q => {
      byType[q.type] = (byType[q.type] || 0) + 1;
    });

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <h3 style="margin: 0; color: var(--app-text-primary);">🎯 Квесты (${this.quests.length})</h3>
          <button class="btn btn-primary" onclick="window.adminModule.openCreateQuestModal()" style="padding: 8px 16px; font-size: 13px;">
            + Создать квест
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 16px;">
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: var(--app-text-primary);">${this.quests.length}</div>
            <div style="font-size: 11px; color: var(--app-text-tertiary);">Всего</div>
          </div>
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: #27ae60;">${activeCount}</div>
            <div style="font-size: 11px; color: var(--app-text-tertiary);">Активных</div>
          </div>
          ${Object.entries(byType).map(([type, count]) => `
            <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: var(--app-text-primary);">${count}</div>
              <div style="font-size: 11px; color: var(--app-text-tertiary);">${type}</div>
            </div>
          `).join('')}
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
          <select onchange="window.adminModule.setQuestFilter('type', this.value)"
            style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--app-border-color); background: var(--app-bg-primary); color: var(--app-text-primary); font-size: 13px;">
            <option value="all" ${this.questFilterType === 'all' ? 'selected' : ''}>Все типы</option>
            <option value="daily" ${this.questFilterType === 'daily' ? 'selected' : ''}>daily</option>
            <option value="sponsor" ${this.questFilterType === 'sponsor' ? 'selected' : ''}>sponsor</option>
            <option value="achievement" ${this.questFilterType === 'achievement' ? 'selected' : ''}>achievement</option>
            <option value="event" ${this.questFilterType === 'event' ? 'selected' : ''}>event</option>
          </select>
          <select onchange="window.adminModule.setQuestFilter('active', this.value)"
            style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--app-border-color); background: var(--app-bg-primary); color: var(--app-text-primary); font-size: 13px;">
            <option value="all" ${this.questFilterActive === 'all' ? 'selected' : ''}>Все статусы</option>
            <option value="active" ${this.questFilterActive === 'active' ? 'selected' : ''}>Активные</option>
            <option value="inactive" ${this.questFilterActive === 'inactive' ? 'selected' : ''}>Неактивные</option>
          </select>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Название</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Тип</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Категория</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Цель</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Награда</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Статус</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">Нет квестов</td></tr>
              ` : filtered.map(q => {
                const title = typeof q.title === 'object'
                  ? (q.title?.ru || q.title?.en || q.external_id)
                  : (q.title || q.external_id);
                return `
                  <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                    <td style="padding: 8px; font-weight: 500; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${title}">
                      ${title}
                      <div style="font-size: 10px; color: var(--app-text-tertiary);">${q.external_id}</div>
                    </td>
                    <td style="text-align: center; padding: 6px 8px;">
                      <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: rgba(52,152,219,0.15); color: #3498db;">${q.type}</span>
                    </td>
                    <td style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">${q.category || '—'}</td>
                    <td style="text-align: center; padding: 6px 8px;">${q.target}</td>
                    <td style="text-align: center; padding: 6px 8px; font-weight: 700; color: #d4af37;">${q.reward_coins} 🪙</td>
                    <td style="text-align: center; padding: 6px 8px;">
                      <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; ${q.is_active ? 'background: rgba(39,174,96,0.15); color: #27ae60;' : 'background: rgba(149,165,166,0.15); color: #95a5a6;'}">
                        ${q.is_active ? 'Активен' : 'Выкл'}
                      </span>
                    </td>
                    <td style="text-align: center; padding: 6px 8px; white-space: nowrap;">
                      <button onclick="window.adminModule.editQuest('${q.id}')"
                        style="padding: 4px 8px; font-size: 11px; border: none; border-radius: 6px; background: var(--app-bg-tertiary); color: var(--app-text-primary); cursor: pointer; margin: 0 2px;">✏️</button>
                      <button onclick="window.adminModule.toggleQuestActive('${q.id}', ${!q.is_active})"
                        style="padding: 4px 8px; font-size: 11px; border: none; border-radius: 6px; background: var(--app-bg-tertiary); color: var(--app-text-primary); cursor: pointer; margin: 0 2px;">${q.is_active ? '⏸' : '▶️'}</button>
                      <button onclick="window.adminModule.deleteQuest('${q.id}')"
                        style="padding: 4px 8px; font-size: 11px; border: none; border-radius: 6px; background: rgba(231,76,60,0.15); color: #e74c3c; cursor: pointer; margin: 0 2px;">🗑</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('quests')" style="padding: 8px 16px; font-size: 13px;">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  setQuestFilter(kind: 'type' | 'active', value: string): void {
    if (kind === 'type') this.questFilterType = value;
    else this.questFilterActive = value;
    this.render();
  }

  async toggleQuestActive(questId: string, newState: boolean): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const res = await apiClient.patch(`/admin/quests/${questId}`, { is_active: newState });
      if (res.success) {
        const q = this.quests.find(x => x.id === questId);
        if (q) q.is_active = newState;
        this.render();
      }
    } catch (err) {
      console.error('[AdminModule] toggleQuestActive error:', err);
      alert('Ошибка при изменении статуса');
    }
  }

  async deleteQuest(questId: string): Promise<void> {
    if (!confirm('Удалить квест? Это также удалит весь прогресс пользователей по нему.')) return;
    try {
      const { apiClient } = await import('@/services/api');
      const res = await apiClient.delete(`/admin/quests/${questId}`);
      if (res.success) {
        this.quests = this.quests.filter(q => q.id !== questId);
        this.render();
      }
    } catch (err) {
      console.error('[AdminModule] deleteQuest error:', err);
      alert('Ошибка при удалении');
    }
  }

  openCreateQuestModal(): void {
    const externalId = prompt('external_id (уникальный ключ):');
    if (!externalId) return;
    const type = prompt('type (daily / sponsor / achievement / event):', 'daily') || 'daily';
    const category = prompt('category:', 'general') || 'general';
    const target = parseInt(prompt('target:', '1') || '1', 10);
    const reward = parseInt(prompt('reward_coins:', '10') || '10', 10);
    const titleRu = prompt('Название (RU):', externalId) || externalId;

    this.createQuest({
      external_id: externalId,
      type,
      category,
      target,
      reward_coins: reward,
      title: { ru: titleRu, en: titleRu },
      description: { ru: '', en: '' },
      reset_type: type === 'daily' ? 'daily' : 'none',
      verification_type: type === 'sponsor' ? 'manual' : 'auto',
      is_active: true,
    });
  }

  async createQuest(data: any): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const res = await apiClient.post('/admin/quests', data);
      if (res.success) {
        this.quests.push(res.quest || data);
        this.render();
      } else {
        alert(res.error || 'Ошибка создания');
      }
    } catch (err) {
      console.error('[AdminModule] createQuest error:', err);
      alert('Ошибка создания квеста');
    }
  }

  editQuest(questId: string): void {
    const q = this.quests.find(x => x.id === questId);
    if (!q) return;

    const newReward = prompt('Новая награда (coins):', String(q.reward_coins));
    if (newReward === null) return;
    const newTarget = prompt('Новая цель:', String(q.target));
    if (newTarget === null) return;

    this.updateQuest(questId, {
      reward_coins: parseInt(newReward, 10),
      target: parseInt(newTarget, 10),
    });
  }

  async updateQuest(questId: string, data: any): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const res = await apiClient.patch(`/admin/quests/${questId}`, data);
      if (res.success) {
        const idx = this.quests.findIndex(x => x.id === questId);
        if (idx !== -1) this.quests[idx] = { ...this.quests[idx], ...data };
        this.render();
      }
    } catch (err) {
      console.error('[AdminModule] updateQuest error:', err);
      alert('Ошибка обновления');
    }
  }

  // ==========================================
  // SETTINGS
  // ==========================================
  private renderSettings(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">⚙️ Настройки</h3>
        <div style="color: var(--app-text-tertiary); font-size: 13px;">
          ${this.settings ? JSON.stringify(this.settings, null, 2) : 'Нет данных настроек'}
        </div>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('settings')" style="padding: 8px 16px; font-size: 13px;">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================
  private renderSubscriptions(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📦 Подписки / Тарифы</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 8px; color: var(--app-text-tertiary);">Название</th>
                <th style="text-align: center; padding: 8px; color: var(--app-text-tertiary);">Цена</th>
                <th style="text-align: center; padding: 8px; color: var(--app-text-tertiary);">Токены</th>
              </tr>
            </thead>
            <tbody>
              ${(this.tiers || []).map((t: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 8px;">${t.name || t.id}</td>
                  <td style="text-align: center; padding: 8px;">${t.price_stars || t.price || '—'}</td>
                  <td style="text-align: center; padding: 8px;">${t.tokens || '—'}</td>
                </tr>
              `).join('') || '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--app-text-tertiary);">Нет тарифов</td></tr>'}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('subscriptions')" style="padding: 8px 16px; font-size: 13px;">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // AUDIT
  // ==========================================
  private renderAudit(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📜 Аудит экономических операций</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Всего операций: <strong>${this.auditTotal}</strong>
        </p>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Время</th>
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">User</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Тип</th>
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Источник</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Сумма</th>
              </tr>
            </thead>
            <tbody>
              ${(this.auditLogs || []).map((log: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 6px 8px; font-size: 11px; color: var(--app-text-tertiary);">${new Date(log.created_at).toLocaleString()}</td>
                  <td style="padding: 6px 8px;">${log.user_id}</td>
                  <td style="text-align: center; padding: 6px 8px;">
                    <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; ${log.event_type === 'EARN' ? 'background: rgba(39,174,96,0.15); color: #27ae60;' : log.event_type === 'SPEND' ? 'background: rgba(231,76,60,0.15); color: #e74c3c;' : 'background: rgba(52,152,219,0.15); color: #3498db;'}">
                      ${log.event_type}
                    </span>
                  </td>
                  <td style="padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${log.source || '—'}</td>
                  <td style="text-align: center; padding: 6px 8px; font-weight: 700; ${log.amount > 0 ? 'color: #27ae60;' : 'color: #e74c3c;'}">
                    ${log.amount > 0 ? '+' : ''}${log.amount}
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--app-text-tertiary);">Нет записей</td></tr>'}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.prevAuditPage()" style="padding: 6px 14px; font-size: 12px;">◀ Назад</button>
          <button class="btn btn-secondary" onclick="window.adminModule.nextAuditPage()" style="padding: 6px 14px; font-size: 12px;">Вперед ▶</button>
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('audit')" style="padding: 6px 14px; font-size: 12px;">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // USERS
  // ==========================================
  private renderUsers(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">👤 Пользователи (${this.users.length})</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">ID</th>
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Username</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Роль</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">🪙</th>
              </tr>
            </thead>
            <tbody>
              ${(this.users || []).slice(0, 50).map((u: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 6px 8px;">${u.telegram_id}</td>
                  <td style="padding: 6px 8px;">${u.username ? '@' + u.username : '—'}</td>
                  <td style="text-align: center; padding: 6px 8px;">
                    <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">${u.role}</span>
                  </td>
                  <td style="text-align: center; padding: 6px 8px;">${u.coin_balance ?? 0}</td>
                </tr>
              `).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--app-text-tertiary);">Нет пользователей</td></tr>'}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('users')" style="padding: 8px 16px; font-size: 13px;">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // SECURITY
  // ==========================================
  private renderSecurity(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">🔐 Безопасность</h3>
        <p style="color: var(--app-text-tertiary); font-size: 13px;">Блокировки и whitelist</p>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('security')" style="padding: 8px 16px; font-size: 13px;">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // TESTING
  // ==========================================
  private renderTesting(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">🤖 Тестирование</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button class="btn btn-secondary" onclick="window.adminModule.addCoins()" style="padding: 10px;">+ Добавить монеты (тест)</button>
          <button class="btn btn-secondary" onclick="window.adminModule.addTokens()" style="padding: 10px;">+ Добавить токены (тест)</button>
          <button class="btn btn-secondary" onclick="window.adminModule.setTestUser()" style="padding: 10px;">Установить тестового пользователя</button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // NAVIGATION & LIFECYCLE
  // ==========================================
  async switchTab(tabId: string): Promise<void> {
    this._activeTab = tabId;
    this.render();
  }

  async refreshDashboard(): Promise<void> {
    await this.loadAllData();
    this.render();
  }

  async saveLimits(): Promise<void> {
    console.log('[AdminModule] saveLimits — заглушка');
  }

  async saveSettings(): Promise<void> {
    console.log('[AdminModule] saveSettings — заглушка');
  }

  async blockUser(): Promise<void> {
    console.log('[AdminModule] blockUser — заглушка');
  }

  async unblockUser(userId: string): Promise<void> {
    console.log('[AdminModule] unblockUser', userId);
  }

  async nextAuditPage(): Promise<void> {
    this.auditPage++;
    // можно добавить загрузку следующей страницы
    this.render();
  }

  async prevAuditPage(): Promise<void> {
    if (this.auditPage > 0) this.auditPage--;
    this.render();
  }

  async setTestUser(): Promise<void> {
    console.log('[AdminModule] setTestUser — заглушка');
  }

  async addCoins(): Promise<void> {
    console.log('[AdminModule] addCoins — заглушка');
  }

  async addTokens(): Promise<void> {
    console.log('[AdminModule] addTokens — заглушка');
  }

  async show(): Promise<void> {
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

    this._isVisible = true;
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle('👑 Админ-панель');
    this.headerManager.setActions([]);

    if ((window as any).navigation) {
      (window as any).navigation.hide();
    }

    await this.loadAllData();
    this.render();

    console.log('📱 AdminModule показан');
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.add('hidden');
    this.container.style.display = 'none';

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }

    console.log('📱 AdminModule скрыт');
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

// ==========================================
// ПРИВЯЗКА К WINDOW
// ==========================================

const adminModuleInstance = new AdminModule(document.createElement('div'));

(window as any).AdminModule = AdminModule;

(window as any).adminModule = {
  switchTab: (tabId: string) => {
    console.log(`🔘 [window.adminModule] switchTab вызван с: ${tabId}`);
    adminModuleInstance.switchTab(tabId);
  },
  refreshDashboard: () => adminModuleInstance.refreshDashboard(),
  saveLimits: () => adminModuleInstance.saveLimits(),
  saveSettings: () => adminModuleInstance.saveSettings(),
  blockUser: () => adminModuleInstance.blockUser(),
  unblockUser: (userId: string) => adminModuleInstance.unblockUser(userId),
  nextAuditPage: () => adminModuleInstance.nextAuditPage(),
  prevAuditPage: () => adminModuleInstance.prevAuditPage(),
  setTestUser: () => adminModuleInstance.setTestUser(),
  addCoins: () => adminModuleInstance.addCoins(),
  addTokens: () => adminModuleInstance.addTokens(),
  show: () => adminModuleInstance.show(),
  hide: () => adminModuleInstance.hide(),

  // Quests
  setQuestFilter: (kind: 'type' | 'active', value: string) => adminModuleInstance.setQuestFilter(kind, value),
  toggleQuestActive: (id: string, state: boolean) => adminModuleInstance.toggleQuestActive(id, state),
  deleteQuest: (id: string) => adminModuleInstance.deleteQuest(id),
  openCreateQuestModal: () => adminModuleInstance.openCreateQuestModal(),
  editQuest: (id: string) => adminModuleInstance.editQuest(id),
};

console.log('✅ AdminModule v6.1.0 загружен');
