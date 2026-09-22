// ============================================
// src/modules/admin/AdminModule.ts
// Тонкий контейнер админ-панели
// Версия: 7.4.0 — window.adminModule теперь проксирует к реальному
//                  экземпляру (AdminModule._instance), а не к отдельному
//                  «призрачному» инстансу, у которого никогда не вызывался init()
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
  // Экземпляр, который реально создал и проинициализировал module-loader.
  // module-loader.ts после `new AdminModule(container)` и `await instance.init()`
  // сохраняет его в `ModuleClass._instance` — это и есть единственный
  // "живой" AdminModule на странице. window.adminModule ниже всегда
  // обращается именно к нему, а не к отдельной копии.
  static _instance: AdminModule | null = null;

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
    console.log('✅ AdminModule v7.4.0 готов');
  }

  private register(tab: IAdminTab): void {
    this.tabs.set(tab.id, tab);
  }

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

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px';
    header.innerHTML = `
      <span style="font-size:24px">👑</span>
      <h2 style="font-size:20px;font-weight:700;margin:0;color:var(--app-text-primary)">Админ-панель</h2>
    `;
    wrapper.appendChild(header);

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

    const content = document.createElement('div');
    content.id = 'admin-tab-content';
    content.style.cssText = 'flex:1;overflow-y:auto';
    content.innerHTML = this.tabs.get(this.activeTabId)?.render() || '';
    wrapper.appendChild(content);

    this.container.appendChild(wrapper);
  }

  // Lifecycle

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
//
// ВАЖНО: раньше здесь создавался отдельный `new AdminModule(...)` с
// отсоединённым от DOM контейнером, чей init() никогда не вызывался —
// его `tabs` оставался пустым навсегда, и любая кнопка в админке,
// использующая window.adminModule.*, тихо проваливалась в ветку
// "Метод ... не найден". Реальный, проинициализированный экземпляр
// создаёт module-loader.ts через `new AdminModule(container)` и
// `await instance.init()`, сохраняя его в `AdminModule._instance`.
// Поэтому теперь window.adminModule на каждый вызов берёт именно этот
// актуальный экземпляр, а не фиксированную ссылку, созданную заранее.

(window as any).AdminModule = AdminModule;

function getInstance(): AdminModule | null {
  const instance = AdminModule._instance;
  if (!instance) {
    console.warn('[AdminModule] Экземпляр ещё не создан (админ-панель не была открыта)');
  }
  return instance;
}

(window as any).adminModule = {
  // Навигация
  switchTab: (id: string) => getInstance()?.switchTab(id),
  refreshTab: (id?: string) => getInstance()?.refreshTab(id),
  renderCurrentTab: () => getInstance()?.renderCurrentTab(),
  show: () => getInstance()?.show(),
  hide: () => getInstance()?.hide(),

  // Limits
  saveLimits: () => getInstance()?.proxy('limits', 'save'),

  // Settings
  saveSettings: () => getInstance()?.proxy('settings', 'save'),

  // Quests
  setQuestFilter: (kind: 'type' | 'active', value: string) =>
    getInstance()?.proxy('quests', 'setFilter', kind, value),
  createQuest: () => getInstance()?.proxy('quests', 'create'),
  editQuest: (id: string) => getInstance()?.proxy('quests', 'edit', id),
  toggleQuest: (id: string, state: boolean) =>
    getInstance()?.proxy('quests', 'toggleActive', id, state),
  deleteQuest: (id: string) => getInstance()?.proxy('quests', 'remove', id),

  // Subscriptions
  createTier: () => getInstance()?.proxy('subscriptions', 'create'),
  editTier: (id: string) => getInstance()?.proxy('subscriptions', 'edit', id),
  toggleTier: (id: string, state: boolean) =>
    getInstance()?.proxy('subscriptions', 'toggle', id, state),
  deleteTier: (id: string) => getInstance()?.proxy('subscriptions', 'remove', id),

  // Users
  searchUsers: (query: string) => getInstance()?.proxy('users', 'loadData', query),
  changeRole: (userId: number, role: string) =>
    getInstance()?.proxy('users', 'changeRole', userId, role),
  addCoinsToUser: (userId: number) =>
    getInstance()?.proxy('users', 'addCoins', userId),
  addTokensToUser: (userId: number) =>
    getInstance()?.proxy('users', 'addTokens', userId),

  // Audit
  nextAuditPage: () => getInstance()?.proxy('audit', 'nextPage'),
  prevAuditPage: () => getInstance()?.proxy('audit', 'prevPage'),

  // Security
  unblockUser: (userId: number) =>
    getInstance()?.proxy('security', 'unblock', userId),
  addToWhitelist: () => getInstance()?.proxy('security', 'addWhitelist'),
  removeFromWhitelist: (userId: number) =>
    getInstance()?.proxy('security', 'removeWhitelist', userId),

  // Agents
  setAgentFilter: (kind: 'modality' | 'active', value: string) =>
    getInstance()?.proxy('agents', 'setFilter', kind, value),
  createAgent: () => getInstance()?.proxy('agents', 'create'),
  editAgent: (id: string) => getInstance()?.proxy('agents', 'edit', id),
  toggleAgent: (id: string, state: boolean) =>
    getInstance()?.proxy('agents', 'toggleActive', id, state),

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

console.log('✅ AdminModule v7.4.0 загружен');
