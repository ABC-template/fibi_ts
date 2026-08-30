// ============================================
// src/modules/admin/AdminModule.ts
// Тонкий контейнер админ-панели
// Версия: 7.2.0 — добавлена вкладка Агенты
// ============================================

import { headerManager } from '@/core/header-manager';
import { userStore } from '@/store/UserStore';
import { IAdminTab } from './core/admin-tab.interface';

import { AdminDashboardTab } from './tabs/AdminDashboardTab';
import { AdminLimitsTab } from './tabs/AdminLimitsTab';
import { AdminQuestsTab } from './tabs/AdminQuestsTab';
import { AdminSettingsTab } from './tabs/AdminSettingsTab';
import { AdminSubscriptionsTab } from './tabs/AdminSubscriptionsTab';
import { AdminUsersTab } from './tabs/AdminUsersTab';
import { AdminAuditTab } from './tabs/AdminAuditTab';
import { AdminSecurityTab } from './tabs/AdminSecurityTab';
import { AdminTestingTab } from './tabs/AdminTestingTab';
import { AdminAgentsTab } from './tabs/AdminAgentsTab';

export class AdminModule {
  private container: HTMLElement;
  private tabs = new Map<string, IAdminTab>();
  private activeTabId = 'dashboard';
  private isInitialized = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    if (userStore.role !== 'creator') {
      this.container.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--app-text-tertiary)">
          <div style="font-size:48px;margin-bottom:12px">⛔</div>
          <div style="font-size:16px;font-weight:600">Доступ запрещён</div>
          <div style="font-size:13px;margin-top:4px">Только для создателя</div>
        </div>`;
      this.isInitialized = true;
      return;
    }

    // Регистрируем все вкладки
    this.register(new AdminDashboardTab());
    this.register(new AdminLimitsTab());
    this.register(new AdminQuestsTab());
    this.register(new AdminSettingsTab());
    this.register(new AdminSubscriptionsTab());
    this.register(new AdminUsersTab());
    this.register(new AdminAuditTab());
    this.register(new AdminSecurityTab());
    this.register(new AdminTestingTab());
    this.register(new AdminAgentsTab());

    await this.tabs.get(this.activeTabId)?.init();
    this.isInitialized = true;
    console.log('✅ AdminModule v7.2.0 готов');
  }

  private register(tab: IAdminTab): void {
    this.tabs.set(tab.id, tab);
  }

  /** Универсальный вызов метода вкладки */
  async proxy(tabId: string, method: string, ...args: any[]): Promise<void> {
    const tab = this.tabs.get(tabId) as any;
    if (tab && typeof tab[method] === 'function') {
      await tab[method](...args);
      this.render();
    } else {
      console.warn(`[AdminModule] Метод ${method} не найден во вкладке ${tabId}`);
    }
  }

  async switchTab(id: string): Promise<void> {
    if (!this.tabs.has(id)) return;

    this.tabs.get(this.activeTabId)?.onHide?.();
    this.activeTabId = id;

    const tab = this.tabs.get(id)!;
    await tab.init();
    tab.onShow?.();
    this.render();
  }

  async refreshTab(id?: string): Promise<void> {
    const tabId = id || this.activeTabId;
    const tab = this.tabs.get(tabId);
    if (tab?.refresh) {
      await tab.refresh();
      this.render();
    }
  }

  renderCurrentTab(): void {
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';

    const sortedTabs = Array.from(this.tabs.values()).sort((a, b) => a.priority - b.priority);

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

    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px';
    header.innerHTML = `
      <span style="font-size:24px">👑</span>
      <h2 style="font-size:20px;font-weight:700;margin:0;color:var(--app-text-primary)">Админ-панель</h2>
    `;
    wrapper.appendChild(header);

    // Переключатель вкладок
    const tabsBar = document.createElement('div');
    tabsBar.style.cssText = `
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

    sortedTabs.forEach(tab => {
      const btn = document.createElement('button');
      const isActive = tab.id === this.activeTabId;
      btn.textContent = `${tab.icon} ${tab.label}`;
      btn.style.cssText = `
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        background: ${isActive ? 'var(--app-accent-primary)' : 'transparent'};
        color: ${isActive ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)'};
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        font-family: var(--app-font-family);
        transition: all 0.2s ease;
      `;
      btn.onclick = () => this.switchTab(tab.id);
      tabsBar.appendChild(btn);
    });
    wrapper.appendChild(tabsBar);

    // Контент активной вкладки
    const content = document.createElement('div');
    content.id = 'admin-tab-content';
    content.style.cssText = 'flex:1;overflow-y:auto';
    content.innerHTML = this.tabs.get(this.activeTabId)?.render() || '';
    wrapper.appendChild(content);

    this.container.appendChild(wrapper);
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async show(): Promise<void> {
    if (userStore.role !== 'creator') {
      this.container.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--app-text-tertiary)">
          <div style="font-size:48px;margin-bottom:12px">⛔</div>
          <div style="font-size:16px;font-weight:600">Доступ запрещён</div>
        </div>`;
      return;
    }

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    headerManager.setTitle('👑 Админ-панель');
    headerManager.setActions([]);

    if ((window as any).navigation) {
      (window as any).navigation.hide();
    }

    await this.init();
    this.render();
  }

  hide(): void {
    this.container.classList.add('hidden');
    this.container.style.display = 'none';

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }
  }

  destroy(): void {
    this.tabs.forEach(tab => tab.destroy());
    this.tabs.clear();
    this.container.innerHTML = '';
    this.isInitialized = false;
  }
}

// ==========================================
// Привязка к window
// ==========================================

const adminModuleInstance = new AdminModule(document.createElement('div'));

(window as any).AdminModule = AdminModule;

(window as any).adminModule = {
  // Навигация
  switchTab: (id: string) => adminModuleInstance.switchTab(id),
  refreshTab: (id?: string) => adminModuleInstance.refreshTab(id),
  renderCurrentTab: () => adminModuleInstance.renderCurrentTab(),
  show: () => adminModuleInstance.show(),
  hide: () => adminModuleInstance.hide(),

  // Limits
  saveLimits: () => adminModuleInstance.proxy('limits', 'save'),

  // Settings
  saveSettings: () => adminModuleInstance.proxy('settings', 'save'),

  // Quests
  setQuestFilter: (kind: 'type' | 'active', value: string) =>
    adminModuleInstance.proxy('quests', 'setFilter', kind, value),
  createQuest: () => adminModuleInstance.proxy('quests', 'create'),
  editQuest: (id: string) => adminModuleInstance.proxy('quests', 'edit', id),
  toggleQuest: (id: string, state: boolean) =>
    adminModuleInstance.proxy('quests', 'toggleActive', id, state),
  deleteQuest: (id: string) => adminModuleInstance.proxy('quests', 'remove', id),

  // Subscriptions
  createTier: () => adminModuleInstance.proxy('subscriptions', 'create'),
  editTier: (id: string) => adminModuleInstance.proxy('subscriptions', 'edit', id),
  toggleTier: (id: string, state: boolean) =>
    adminModuleInstance.proxy('subscriptions', 'toggle', id, state),
  deleteTier: (id: string) => adminModuleInstance.proxy('subscriptions', 'remove', id),

  // Users
  searchUsers: (query: string) => adminModuleInstance.proxy('users', 'loadData', query),
  changeRole: (userId: number, role: string) =>
    adminModuleInstance.proxy('users', 'changeRole', userId, role),
  addCoinsToUser: (userId: number) =>
    adminModuleInstance.proxy('users', 'addCoins', userId),
  addTokensToUser: (userId: number) =>
    adminModuleInstance.proxy('users', 'addTokens', userId),

  // Audit
  nextAuditPage: () => adminModuleInstance.proxy('audit', 'nextPage'),
  prevAuditPage: () => adminModuleInstance.proxy('audit', 'prevPage'),

  // Security
  unblockUser: (userId: number) =>
    adminModuleInstance.proxy('security', 'unblock', userId),
  addToWhitelist: () => adminModuleInstance.proxy('security', 'addWhitelist'),
  removeFromWhitelist: (userId: number) =>
    adminModuleInstance.proxy('security', 'removeWhitelist', userId),

  // Agents
  setAgentFilter: (kind: 'modality' | 'active', value: string) =>
    adminModuleInstance.proxy('agents', 'setFilter', kind, value),
  createAgent: () => adminModuleInstance.proxy('agents', 'create'),
  editAgent: (id: string) => adminModuleInstance.proxy('agents', 'edit', id),
  toggleAgent: (id: string, state: boolean) =>
    adminModuleInstance.proxy('agents', 'toggleActive', id, state),

  // Testing
  testAddCoins: async () => {
    try {
      const { apiClient } = await import('@/services/api');
      await apiClient.post('/admin/coins', {
        user_id: userStore.userId,
        amount: 100,
        reason: 'Тестовое начисление',
      });
      alert('Начислено 100 монет');
    } catch (e) {
      alert('Ошибка начисления монет');
    }
  },
  testAddTokens: async () => {
    try {
      const { apiClient } = await import('@/services/api');
      await apiClient.post('/admin/coins', {
        user_id: userStore.userId,
        amount: 50,
        currency: 'tokens',
        reason: 'Тестовое начисление токенов',
      });
      alert('Начислено 50 токенов');
    } catch (e) {
      alert('Ошибка начисления токенов');
    }
  },
  testResetDaily: async () => {
    try {
      const { apiClient } = await import('@/services/api');
      await apiClient.post('/quests/reset-daily', { user_id: userStore.userId });
      alert('Daily-квесты сброшены');
    } catch (e) {
      alert('Ошибка сброса');
    }
  },
};

console.log('✅ AdminModule v7.2.0 загружен');
