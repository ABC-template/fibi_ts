// ============================================
// src/modules/admin/AdminModule.ts
// Админ-панель (только для creator)
// Версия: 2.1.0 - ИСПРАВЛЕН: setUserLocked → toggleUserLock
// ============================================

import { adminStore } from './AdminStore';
import { userStore } from '@/store/UserStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { uiRenderer } from '@/modules/ui/renderer';
import type { UUID } from '@types';

type AdminTab = 'dashboard' | 'tasks' | 'coins' | 'referrals' | 'users' | 'economy' | 'audit';

export class AdminModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _activeTab: AdminTab = 'dashboard';
  private headerManager = headerManager;
  private eventBus = eventBus;
  private userStore = userStore;
  private adminStore = adminStore;
  private uiRenderer = uiRenderer;

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

    this._render();
    this._subscribeToEvents();

    this.isInitialized = true;
    console.log('✅ AdminModule v2.1.0 инициализирован (с управлением экономикой)');
  }

  private _subscribeToEvents(): void {
    const unsub = this.eventBus.on('admin:stats_updated', () => {
      if (this._activeTab === 'dashboard') this._renderDashboard();
    }, this);
    this._subscriptions.push(unsub);

    const unsub2 = this.eventBus.on('sponsors:task_added', () => {
      if (this._activeTab === 'tasks') this._renderTasksTab();
    }, this);
    this._subscriptions.push(unsub2);

    const unsub3 = this.eventBus.on('sponsors:task_updated', () => {
      if (this._activeTab === 'tasks') this._renderTasksTab();
    }, this);
    this._subscriptions.push(unsub3);

    const unsub4 = this.eventBus.on('sponsors:task_deleted', () => {
      if (this._activeTab === 'tasks') this._renderTasksTab();
    }, this);
    this._subscriptions.push(unsub4);
  }

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
      { id: 'dashboard', label: '📊 Обзор', icon: 'layout-dashboard' },
      { id: 'tasks', label: '📋 Задания', icon: 'clipboard-list' },
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
      case 'dashboard': return this._renderDashboard();
      case 'tasks': return this._renderTasksTab();
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
    this._render();
  }

  private _renderDashboard(): string {
    const stats = this.adminStore.getStats();

    if (!stats) {
      return `
        <div style="text-align: center; padding: 40px; color: var(--app-text-tertiary);">
          <div style="font-size: 36px; margin-bottom: 8px;">📊</div>
          <div>Загрузка статистики...</div>
          <button onclick="window.adminModule.loadStats()" style="
            margin-top: 12px;
            padding: 8px 20px;
            border-radius: 8px;
            border: none;
            background: var(--app-accent-primary);
            color: var(--app-text-inverse);
            cursor: pointer;
            font-weight: 600;
          ">
            🔄 Обновить
          </button>
        </div>
      `;
    }

    return `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div style="background: var(--app-bg-secondary); padding: 14px; border-radius: 12px; border: 1px solid var(--app-border-color-light); text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: var(--app-accent-primary);">${stats.total_users}</div>
          <div style="font-size: 11px; color: var(--app-text-tertiary);">👤 Всего пользователей</div>
        </div>
        <div style="background: var(--app-bg-secondary); padding: 14px; border-radius: 12px; border: 1px solid var(--app-border-color-light); text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #27ae60;">${stats.active_users}</div>
          <div style="font-size: 11px; color: var(--app-text-tertiary);">🟢 Активных (7 дней)</div>
        </div>
        <div style="background: var(--app-bg-secondary); padding: 14px; border-radius: 12px; border: 1px solid var(--app-border-color-light); text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #f1c40f;">${stats.total_coins_earned}</div>
          <div style="font-size: 11px; color: var(--app-text-tertiary);">🪙 Всего заработано</div>
        </div>
        <div style="background: var(--app-bg-secondary); padding: 14px; border-radius: 12px; border: 1px solid var(--app-border-color-light); text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #8e44ad;">${stats.total_referrals}</div>
          <div style="font-size: 11px; color: var(--app-text-tertiary);">🤝 Всего рефералов</div>
        </div>
        <div style="background: var(--app-bg-secondary); padding: 14px; border-radius: 12px; border: 1px solid var(--app-border-color-light); text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #3498db;">${stats.premium_users}</div>
          <div style="font-size: 11px; color: var(--app-text-tertiary);">⭐ PRO-пользователей</div>
        </div>
        <div style="background: var(--app-bg-secondary); padding: 14px; border-radius: 12px; border: 1px solid var(--app-border-color-light); text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: var(--app-text-secondary);">${stats.trial_users}</div>
          <div style="font-size: 11px; color: var(--app-text-tertiary);">🔓 Бесплатных</div>
        </div>
      </div>
      <div style="margin-top: 12px; font-size: 11px; color: var(--app-text-tertiary); text-align: right;">
        Обновлено: ${new Date().toLocaleString()}
      </div>
    `;
  }

  async loadStats(): Promise<void> {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: {
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
        },
      });
      const data = await response.json();
      if (data.success) {
        this.adminStore.setStats(data.stats);
        this._renderDashboard();
        this.uiRenderer?.showToast('📊 Статистика обновлена', 'success', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки статистики:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка загрузки статистики', 'error', 1500);
    }
  }

  private _renderTasksTab(): string {
    const tasks = this.adminStore.getTasks ? this.adminStore.getTasks() : [];

    return `
      <div style="margin-bottom: 12px;">
        <button onclick="window.adminModule.showCreateTaskForm()" style="
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 2px dashed var(--app-accent-primary);
          background: transparent;
          color: var(--app-accent-primary);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        ">
          ➕ Создать новое задание
        </button>
      </div>

      <div id="admin-task-form" style="display: none; background: var(--app-bg-secondary); padding: 16px; border-radius: 12px; border: 1px solid var(--app-border-color-light); margin-bottom: 12px;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <input id="admin-task-title" placeholder="Название задания" style="
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
          <textarea id="admin-task-description" rows="2" placeholder="Описание" style="
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
            resize: vertical;
            font-family: var(--app-font-family);
          "></textarea>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <input id="admin-task-sponsor" placeholder="Спонсор" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
            <input id="admin-task-reward" type="number" placeholder="Награда (монеты)" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <select id="admin-task-type" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
              <option value="subscribe">📢 Подписка</option>
              <option value="visit">🌐 Переход</option>
              <option value="action">⚡ Действие</option>
              <option value="survey">📝 Опрос</option>
            </select>
            <input id="admin-task-target" placeholder="Цель (канал/сайт)" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
            <input id="admin-task-action" placeholder="Что сделать" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <select id="admin-task-verification" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
              <option value="auto">🔍 Авто</option>
              <option value="pseudo" selected>⏳ Псевдо (12ч)</option>
              <option value="manual">👤 Ручная</option>
            </select>
            <input id="admin-task-pseudo-hours" type="number" value="12" placeholder="Часов проверки" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
            <input id="admin-task-max-completions" type="number" placeholder="Лимит выполнений" style="
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div style="display: flex; gap: 8px;">
            <input id="admin-task-expires" type="datetime-local" style="
              flex: 1;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
            <button onclick="window.adminModule.saveTask('')" style="
              padding: 10px 24px;
              border-radius: 8px;
              border: none;
              background: var(--app-gradient-primary);
              color: var(--app-text-inverse);
              font-weight: 600;
              cursor: pointer;
            ">
              💾 Сохранить
            </button>
            <button onclick="document.getElementById('admin-task-form').style.display='none'" style="
              padding: 10px 16px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: transparent;
              color: var(--app-text-secondary);
              cursor: pointer;
            ">
              ✕
            </button>
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${tasks.length === 0 ? `
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">
            Нет заданий. Создайте первое!
          </div>
        ` : tasks.map((task: any) => `
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 14px;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary);">
                  ${task.title}
                </div>
                <div style="font-size: 12px; color: var(--app-text-tertiary); margin-top: 2px;">
                  ${task.description}
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 6px;">
                  <span style="font-size: 10px; color: var(--app-text-tertiary); background: var(--app-bg-tertiary); padding: 2px 8px; border-radius: 10px;">
                    🏢 ${task.sponsor_name}
                  </span>
                  <span style="font-size: 10px; color: #f1c40f; background: rgba(241, 196, 15, 0.1); padding: 2px 8px; border-radius: 10px;">
                    +${task.reward} 🪙
                  </span>
                  <span style="font-size: 10px; color: var(--app-text-tertiary); background: var(--app-bg-tertiary); padding: 2px 8px; border-radius: 10px;">
                    📊 ${task.completions_count || 0} выполнений
                  </span>
                  <span style="font-size: 10px; color: ${task.is_active ? '#27ae60' : '#e74c3c'}; background: ${task.is_active ? 'rgba(39, 174, 96, 0.1)' : 'rgba(231, 76, 60, 0.1)'}; padding: 2px 8px; border-radius: 10px;">
                    ${task.is_active ? '🟢 Активно' : '🔴 Неактивно'}
                  </span>
                </div>
              </div>
              <div style="display: flex; gap: 4px; flex-shrink: 0; margin-left: 12px;">
                <button onclick="window.adminModule.editTask('${task.id}')" style="
                  background: var(--app-bg-tertiary);
                  border: 1px solid var(--app-border-color);
                  border-radius: 6px;
                  padding: 4px 10px;
                  color: var(--app-text-primary);
                  font-size: 11px;
                  cursor: pointer;
                ">
                  ✏️
                </button>
                <button onclick="window.adminModule.toggleTaskStatus('${task.id}')" style="
                  background: ${task.is_active ? 'rgba(231, 76, 60, 0.1)' : 'rgba(39, 174, 96, 0.1)'};
                  border: 1px solid ${task.is_active ? 'rgba(231, 76, 60, 0.2)' : 'rgba(39, 174, 96, 0.2)'};
                  border-radius: 6px;
                  padding: 4px 10px;
                  color: ${task.is_active ? '#e74c3c' : '#27ae60'};
                  font-size: 11px;
                  cursor: pointer;
                ">
                  ${task.is_active ? '⏸️' : '▶️'}
                </button>
                <button onclick="window.adminModule.deleteTask('${task.id}')" style="
                  background: rgba(231, 76, 60, 0.1);
                  border: 1px solid rgba(231, 76, 60, 0.2);
                  border-radius: 6px;
                  padding: 4px 10px;
                  color: #e74c3c;
                  font-size: 11px;
                  cursor: pointer;
                ">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
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
          <div style="font-size: 11px; color: var(--app-text-tertiary); margin-top: 6px;">
            ⚠️ Заблокированный пользователь не сможет получать или тратить монеты
          </div>
        </div>
      </div>
    `;
  }

  private _renderEconomyTab(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">⚙️ Правила начисления монет</div>
        
        <div style="font-size: 12px; color: var(--app-text-tertiary); margin-bottom: 12px;">
          Изменения вступают в силу мгновенно. Правила с суммой 0 используют сумму из события.
        </div>

        <div id="economy-rules-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 500px; overflow-y: auto;">
          <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary); font-size: 13px;">
            ⏳ Загрузка правил...
          </div>
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

  private _renderAuditTab(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">📜 Аудит экономических операций</div>
        
        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
          <input id="audit-user-filter" type="number" placeholder="ID пользователя" style="
            flex: 1;
            min-width: 100px;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 12px;
            outline: none;
          ">
          <select id="audit-type-filter" style="
            padding: 8px;
            border-radius: 6px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 12px;
            outline: none;
          ">
            <option value="">Все типы</option>
            <option value="EARN">Начисления</option>
            <option value="SPEND">Списания</option>
            <option value="REFUND">Возвраты</option>
            <option value="ADJUST">Корректировки</option>
          </select>
          <button onclick="window.adminModule.loadAudit()" style="
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

        <div id="audit-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 400px; overflow-y: auto;">
          <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary); font-size: 13px;">
            ⏳ Загрузка...
          </div>
        </div>
      </div>
    `;
  }

  async loadRules(): Promise<void> {
    try {
      const { economyService } = await import('@/economy/EconomyService');
      const result = await economyService.getRules();

      if (result.success) {
        this._renderRulesListWithData(result.rules || []);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки правил:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка загрузки правил', 'error', 1500);
    }
  }

  private _renderRulesListWithData(rules: any[]): void {
    const container = document.getElementById('economy-rules-list');
    if (!container) return;

    if (rules.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary); font-size: 13px;">
          Нет правил. Добавьте первое правило.
        </div>
      `;
      return;
    }

    container.innerHTML = rules.map((rule: any) => `
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

  async editRule(ruleId: string): Promise<void> {
    try {
      const { economyService } = await import('@/economy/EconomyService');
      const result = await economyService.getRules(100, 0);

      if (!result.success) {
        this.uiRenderer?.showToast('⚠️ Не удалось загрузить правило', 'error', 1500);
        return;
      }

      const rule = result.rules?.find((r: any) => r.id === ruleId);
      if (!rule) {
        this.uiRenderer?.showToast('⚠️ Правило не найдено', 'error', 1500);
        return;
      }

      const content = `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div>
            <label style="font-size: 12px; color: var(--app-text-tertiary);">Источник</label>
            <input id="edit-rule-source" value="${rule.source}" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 12px; color: var(--app-text-tertiary);">Сумма награды</label>
            <input id="edit-rule-amount" type="number" value="${rule.amount}" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 12px; color: var(--app-text-tertiary);">Кулдаун (часы)</label>
            <input id="edit-rule-cooldown" type="number" value="${rule.cooldown_hours}" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 12px; color: var(--app-text-tertiary);">Максимум на пользователя (0 = без лимита)</label>
            <input id="edit-rule-max" type="number" value="${rule.max_per_user || 0}" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
          <div>
            <label style="font-size: 12px; color: var(--app-text-tertiary);">Описание</label>
            <input id="edit-rule-description" value="${rule.description || ''}" style="
              width: 100%;
              padding: 8px;
              border-radius: 6px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
            ">
          </div>
        </div>
      `;

      const footer = `
        <button id="modal-save-btn" class="btn" style="width:100%;" onclick="window.adminModule.saveRule('${ruleId}')">
          💾 Сохранить
        </button>
      `;

      (window as any).showModal({
        title: '✏️ Редактировать правило',
        content: content,
        footer: footer,
        showFooter: true,
        modalId: 'edit-rule'
      });
    } catch (err) {
      console.error('❌ Ошибка загрузки правила для редактирования:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка загрузки правила', 'error', 1500);
    }
  }

  async saveRule(ruleId: string): Promise<void> {
    const source = (document.getElementById('edit-rule-source') as HTMLInputElement)?.value;
    const amount = parseInt((document.getElementById('edit-rule-amount') as HTMLInputElement)?.value || '0', 10);
    const cooldown = parseInt((document.getElementById('edit-rule-cooldown') as HTMLInputElement)?.value || '0', 10);
    const maxPerUser = parseInt((document.getElementById('edit-rule-max') as HTMLInputElement)?.value || '0', 10);
    const description = (document.getElementById('edit-rule-description') as HTMLInputElement)?.value || '';

    if (!source) {
      this.uiRenderer?.showToast('⚠️ Источник обязателен', 'error', 1500);
      return;
    }

    try {
      const { supabaseFetch, getSupabaseConfig } = await import('@api/_lib/supabase-client');
      const config = getSupabaseConfig('service');

      await supabaseFetch(
        `economy_rules?id=eq.${ruleId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            source: source,
            amount: amount,
            cooldown_hours: cooldown,
            max_per_user: maxPerUser > 0 ? maxPerUser : null,
            description: description,
            updated_at: new Date().toISOString()
          })
        },
        config
      );

      (window as any).closeModal();
      this.uiRenderer?.showToast('✅ Правило обновлено', 'success', 1500);
      
      await this.reloadRules();
    } catch (err) {
      console.error('❌ Ошибка сохранения правила:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сохранения', 'error', 1500);
    }
  }

  async toggleRule(ruleId: string): Promise<void> {
    try {
      const { supabaseFetch, getSupabaseConfig } = await import('@api/_lib/supabase-client');
      const config = getSupabaseConfig('service');

      const result = await supabaseFetch(
        `economy_rules?id=eq.${ruleId}&select=is_active`,
        { method: 'GET' },
        config
      );

      if (!result || !Array.isArray(result) || result.length === 0) {
        this.uiRenderer?.showToast('⚠️ Правило не найдено', 'error', 1500);
        return;
      }

      const newStatus = !result[0].is_active;

      await supabaseFetch(
        `economy_rules?id=eq.${ruleId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            is_active: newStatus,
            updated_at: new Date().toISOString()
          })
        },
        config
      );

      this.uiRenderer?.showToast(
        newStatus ? '▶️ Правило активировано' : '⏸️ Правило отключено',
        'info',
        1500
      );

      await this.reloadRules();
    } catch (err) {
      console.error('❌ Ошибка переключения правила:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка', 'error', 1500);
    }
  }

  async reloadRules(): Promise<void> {
    await this.loadRules();
    if ((window as any).economyManager) {
      await (window as any).economyManager.reloadRules();
    }
  }

  async loadAudit(): Promise<void> {
    try {
      const { economyService } = await import('@/economy/EconomyService');

      const userId = (document.getElementById('audit-user-filter') as HTMLInputElement)?.value;
      const type = (document.getElementById('audit-type-filter') as HTMLSelectElement)?.value;

      const result = await economyService.getAudit(
        userId ? parseInt(userId, 10) : null,
        type || null
      );

      const container = document.getElementById('audit-list');
      if (!container) return;

      if (!result.success || !result.logs || result.logs.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary); font-size: 13px;">
            📭 Нет записей
          </div>
        `;
        return;
      }

      container.innerHTML = result.logs.map((log: any) => {
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
              </div>
            </div>
            <div style="font-weight: 600; color: ${color};">
              ${sign}${log.amount} 🪙
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('❌ Ошибка загрузки аудита:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка загрузки', 'error', 1500);
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
      const response = await fetch('/api/admin/users/role', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
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
      const response = await fetch(`/api/admin/coins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
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
        
        // Обновляем баланс в UI
        if ((window as any).economyStore) {
          await (window as any).economyStore.loadBalance();
        }
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
      const response = await fetch('/api/admin/referrals/reset-limit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
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

  async saveTask(taskId: string): Promise<void> {
    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
    const getNum = (id: string) => parseInt((document.getElementById(id) as HTMLInputElement)?.value || '0', 10) || 0;

    const data = {
      title: getVal('admin-task-title'),
      description: getVal('admin-task-description'),
      sponsor_name: getVal('admin-task-sponsor'),
      reward: getNum('admin-task-reward'),
      type: getVal('admin-task-type') as any,
      target: getVal('admin-task-target'),
      action_required: getVal('admin-task-action'),
      verification_type: getVal('admin-task-verification') as any,
      pseudo_hours: getNum('admin-task-pseudo-hours') || 12,
      max_completions: getNum('admin-task-max-completions') || undefined,
      expires_at: getVal('admin-task-expires') || undefined,
    };

    try {
      const endpoint = taskId ? `/api/admin/tasks/${taskId}` : '/api/admin/tasks';
      const method = taskId ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        this.uiRenderer?.showToast(
          taskId ? '✅ Задание обновлено' : '✅ Задание создано',
          'success',
          1500
        );
        document.getElementById('admin-task-form')!.style.display = 'none';
        this._renderTasksTab();
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка сохранения задания:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

  showCreateTaskForm(): void {
    const form = document.getElementById('admin-task-form');
    if (form) {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
  }

  async editTask(taskId: string): Promise<void> {
    const task = this.adminStore.getTask ? this.adminStore.getTask(taskId as UUID) : null;
    if (!task) {
      this.uiRenderer?.showToast('⚠️ Задание не найдено', 'error', 1500);
      return;
    }

    const form = document.getElementById('admin-task-form');
    if (!form) return;

    (document.getElementById('admin-task-title') as HTMLInputElement).value = task.title;
    (document.getElementById('admin-task-description') as HTMLTextAreaElement).value = task.description;
    (document.getElementById('admin-task-sponsor') as HTMLInputElement).value = task.sponsor_name;
    (document.getElementById('admin-task-reward') as HTMLInputElement).value = String(task.reward);
    (document.getElementById('admin-task-type') as HTMLSelectElement).value = task.type;
    (document.getElementById('admin-task-target') as HTMLInputElement).value = task.target;
    (document.getElementById('admin-task-action') as HTMLInputElement).value = task.action_required;
    (document.getElementById('admin-task-verification') as HTMLSelectElement).value = task.verification_type;
    (document.getElementById('admin-task-pseudo-hours') as HTMLInputElement).value = String(task.pseudo_hours || 12);
    (document.getElementById('admin-task-max-completions') as HTMLInputElement).value = String(task.max_completions || '');
    if (task.expires_at) {
      (document.getElementById('admin-task-expires') as HTMLInputElement).value =
        new Date(task.expires_at).toISOString().slice(0, 16);
    }

    const saveBtn = form.querySelector('button[onclick*="saveTask"]') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.setAttribute('onclick', `window.adminModule.saveTask('${taskId}')`);
    }

    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth' });
  }

  async toggleTaskStatus(taskId: string): Promise<void> {
    const task = this.adminStore.getTask ? this.adminStore.getTask(taskId as UUID) : null;
    if (!task) return;

    try {
      const response = await fetch(`/api/admin/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
        },
        body: JSON.stringify({ is_active: !task.is_active }),
      });

      const result = await response.json();
      if (result.success) {
        this.uiRenderer?.showToast(
          task.is_active ? '⏸️ Задание приостановлено' : '▶️ Задание активировано',
          'info',
          1500
        );
        this._renderTasksTab();
      }
    } catch (err) {
      console.error('❌ Ошибка изменения статуса:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    if (!confirm('Удалить это задание навсегда?')) return;

    try {
      const response = await fetch(`/api/admin/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || '',
        },
      });

      const result = await response.json();
      if (result.success) {
        this.uiRenderer?.showToast('🗑️ Задание удалено', 'info', 1500);
        this._renderTasksTab();
      }
    } catch (err) {
      console.error('❌ Ошибка удаления задания:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

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

    if (this._activeTab === 'economy') {
      this.loadRules();
    }
    if (this._activeTab === 'audit') {
      this.loadAudit();
    }

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

(window as any).AdminModule = AdminModule;
(window as any).adminModule = new AdminModule(document.createElement('div'));

console.log('✅ AdminModule v2.1.0 загружен (с управлением экономикой)');
