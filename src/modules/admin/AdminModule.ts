// ============================================
// src/modules/admin/AdminModule.ts
// Контейнер админ-панели (модульная архитектура)
// Версия: 6.0.1 — исправлена инициализация вкладок
// ============================================

import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';
import type { IAdminTab } from './core/admin-tab.interface';

// ✅ ЯВНЫЙ ИМПОРТ ВСЕХ ВКЛАДОК
import { AdminDashboardTab } from './tabs/AdminDashboardTab';
import { AdminLimitsTab } from './tabs/AdminLimitsTab';
import { AdminSettingsTab } from './tabs/AdminSettingsTab';
import { AdminSubscriptionsTab } from './tabs/AdminSubscriptionsTab';
import { AdminAuditTab } from './tabs/AdminAuditTab';
import { AdminUsersTab } from './tabs/AdminUsersTab';
import { AdminSecurityTab } from './tabs/AdminSecurityTab';
import { AdminTestingTab } from './tabs/AdminTestingTab';

export class AdminModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _tabs: IAdminTab[] = [];
  private _activeTabId: string | null = null;
  private _isVisible: boolean = false;
  private _isReady: boolean = false;
  private headerManager = headerManager;
  private eventBus = eventBus;
  private userStore = userStore;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // ✅ СРАЗУ СОЗДАЕМ ВКЛАДКИ (не ждем init)
    this._tabs = [
      new AdminDashboardTab(),
      new AdminLimitsTab(),
      new AdminSettingsTab(),
      new AdminSubscriptionsTab(),
      new AdminAuditTab(),
      new AdminUsersTab(),
      new AdminSecurityTab(),
      new AdminTestingTab(),
    ];
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    // Проверяем права доступа
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

    console.log(`📋 Загружено ${this._tabs.length} вкладок админ-панели`);
    console.log('📋 ID вкладок:', this._tabs.map(t => t.id).join(', '));

    // Инициализируем каждую вкладку
    for (const tab of this._tabs) {
      try {
        await tab.init();
      } catch (err) {
        console.error(`❌ Ошибка инициализации вкладки ${tab.id}:`, err);
      }
    }

    // Устанавливаем активную вкладку (первую)
    if (this._tabs.length > 0) {
      this._activeTabId = this._tabs[0].id;
    }

    this._isReady = true;
    this._render();
    this._subscribeToEvents();

    this.isInitialized = true;
    console.log('✅ AdminModule v6.0.1 инициализирован');
  }

  private _subscribeToEvents(): void {
    const unsub = this.eventBus.on('admin:refresh', () => {
      this._refreshCurrentTab();
    }, this);
    this._subscriptions.push(unsub);

    console.log('📡 AdminModule подписан на события');
  }

  private async _refreshCurrentTab(): Promise<void> {
    if (!this._isReady) return;
    const tab = this._tabs.find(t => t.id === this._activeTabId);
    if (tab && tab.refresh) {
      await tab.refresh();
      const contentEl = document.getElementById('admin-tab-content');
      if (contentEl) {
        contentEl.innerHTML = tab.render();
      }
    }
  }

  private _render(): void {
    if (this._tabs.length === 0) {
      this.container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--app-text-tertiary);">
          <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
          <div style="font-size: 16px; font-weight: 600;">Нет доступных вкладок</div>
        </div>
      `;
      return;
    }

    const activeTab = this._tabs.find(t => t.id === this._activeTabId) || this._tabs[0];

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
        <!-- Заголовок -->
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
          <span style="font-size: 24px;">👑</span>
          <h2 style="font-size: 20px; font-weight: 700; margin: 0; color: var(--app-text-primary);">
            Админ-панель
          </h2>
        </div>

        <!-- Табы -->
        <div style="
          display: flex;
          gap: 4px;
          background: var(--app-bg-tertiary);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 16px;
          flex-shrink: 0;
          overflow-x: auto;
          flex-wrap: wrap;
        ">
          ${this._tabs.map(tab => `
            <button 
              class="admin-tab-btn"
              data-tab="${tab.id}"
              style="
                padding: 8px 14px;
                border: none;
                border-radius: 8px;
                background: ${this._activeTabId === tab.id ? 'var(--app-accent-primary)' : 'transparent'};
                color: ${this._activeTabId === tab.id ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)'};
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
                font-family: var(--app-font-family);
              "
              onclick="window.adminModule.switchTab('${tab.id}')"
            >
              ${tab.icon} ${tab.label}
            </button>
          `).join('')}
        </div>

        <!-- Контент -->
        <div id="admin-tab-content" style="flex: 1; overflow-y: auto; animation: fadeIn 0.2s ease;">
          ${activeTab.render()}
        </div>
      </div>
    `;

    // Уведомляем о показе вкладки
    if (activeTab.onShow) {
      activeTab.onShow();
    }

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);
  }

  // ==========================================
  // ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
  // ==========================================

  switchTab(tabId: string): void {
    console.log(`🔄 [AdminModule] Переключение на: ${tabId}`);
    console.log(`📋 Доступные вкладки:`, this._tabs.map(t => t.id).join(', '));

    if (!this._isReady) {
      console.warn(`⚠️ [AdminModule] Модуль еще не готов, табы не загружены`);
      return;
    }

    if (this._tabs.length === 0) {
      console.error(`❌ [AdminModule] Нет загруженных вкладок`);
      return;
    }

    const tab = this._tabs.find(t => t.id === tabId);
    if (!tab) {
      console.error(`❌ [AdminModule] Вкладка ${tabId} не найдена`);
      return;
    }

    if (this._activeTabId === tabId) {
      // Уже на этой вкладке — просто обновляем
      const contentEl = document.getElementById('admin-tab-content');
      if (contentEl) {
        contentEl.innerHTML = tab.render();
        if (tab.onShow) tab.onShow();
        setTimeout(() => {
          if (typeof (window as any).lucide !== 'undefined') {
            (window as any).lucide.createIcons();
          }
        }, 100);
      }
      return;
    }

    // Скрываем старую вкладку
    const oldTab = this._tabs.find(t => t.id === this._activeTabId);
    if (oldTab && oldTab.onHide) {
      oldTab.onHide();
    }

    // Переключаем
    this._activeTabId = tabId;

    // Обновляем контент
    const contentEl = document.getElementById('admin-tab-content');
    if (contentEl) {
      contentEl.innerHTML = tab.render();
      contentEl.style.animation = 'fadeIn 0.2s ease';
    }

    // Показываем новую вкладку
    if (tab.onShow) {
      tab.onShow();
    }

    // Обновляем кнопки табов
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      const element = btn as HTMLElement;
      const isActive = element.dataset.tab === tabId;
      element.style.background = isActive ? 'var(--app-accent-primary)' : 'transparent';
      element.style.color = isActive ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)';
    });

    // Обновляем Lucide иконки
    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);

    console.log(`✅ [AdminModule] Переключено на: ${tabId}`);
  }

  getActiveTab(): string | null {
    return this._activeTabId;
  }

  getTabs(): IAdminTab[] {
    return [...this._tabs];
  }

  isReady(): boolean {
    return this._isReady;
  }

  // ==========================================
  // ПОКАЗ / СКРЫТИЕ
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

    // ✅ Убеждаемся, что вкладки загружены
    if (!this._isReady) {
      console.warn('⚠️ [AdminModule] show() вызван до init(), инициализируем...');
      this.init();
      return;
    }

    // Обновляем содержимое при показе
    const activeTab = this._tabs.find(t => t.id === this._activeTabId);
    if (activeTab) {
      const contentEl = document.getElementById('admin-tab-content');
      if (contentEl) {
        contentEl.innerHTML = activeTab.render();
        if (activeTab.onShow) {
          activeTab.onShow();
        }
      }
    }

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
    // Уничтожаем все вкладки
    for (const tab of this._tabs) {
      try {
        tab.destroy();
      } catch (err) {
        console.warn(`⚠️ Ошибка уничтожения вкладки ${tab.id}:`, err);
      }
    }

    // Очищаем подписки
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки AdminModule:', e);
      }
    }
    this._subscriptions = [];

    this.container.innerHTML = '';
    this._tabs = [];
    this._activeTabId = null;
    this._isReady = false;
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
  getActiveTab: () => adminModuleInstance.getActiveTab(),
  getTabs: () => adminModuleInstance.getTabs(),
  isReady: () => adminModuleInstance.isReady(),
  show: () => adminModuleInstance.show(),
  hide: () => adminModuleInstance.hide(),
  destroy: () => adminModuleInstance.destroy(),
};

console.log('✅ AdminModule v6.0.1 загружен');
