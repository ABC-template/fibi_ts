// ============================================
// src/modules/admin/AdminModule.ts
// Контейнер админ-панели (максимально простой)
// Версия: 6.0.4 — исправлены типы для checked
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
    console.log('✅ AdminModule v6.0.4 инициализирован');
  }

  private async loadAllData(): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      
      const [limitsRes, settingsRes, tiersRes, usersRes, blocksRes, auditRes] = await Promise.all([
        apiClient.get('/admin/economy/limits'),
        apiClient.get('/admin/economy/settings'),
        apiClient.get('/admin/economy/subscriptions'),
        apiClient.get('/admin/users'),
        apiClient.get('/admin/economy/blocks'),
        apiClient.get('/economy/audit?limit=50&offset=0'),
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
      case 'settings': return this.renderSettings();
      case 'subscriptions': return this.renderSubscriptions();
      case 'audit': return this.renderAudit();
      case 'users': return this.renderUsers();
      case 'security': return this.renderSecurity();
      case 'testing': return this.renderTesting();
      default: return '<div style="padding: 20px; text-align: center; color: var(--app-text-tertiary);">Вкладка не найдена</div>';
    }
  }

  private renderDashboard(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📊 Дашборд</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px;">Общая статистика системы</p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
          <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: var(--app-accent-primary);">${this.users.length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">👥 Пользователей</div>
          </div>
          <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #27ae60;">${this.users.filter((u: any) => u.role === 'premium').length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">⭐ PRO</div>
          </div>
          <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #f39c12;">${this.limits.length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">📊 Лимитов</div>
          </div>
          <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #3498db;">${this.tiers.length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">📦 Тарифов</div>
          </div>
          <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #e74c3c;">${this.blocks.length}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">🔒 Блокировок</div>
          </div>
          <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #8e44ad;">${this.auditTotal}</div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">📜 Операций</div>
          </div>
        </div>
        
        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.refreshDashboard()" style="padding: 8px 16px; font-size: 13px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderLimits(): string {
    if (this.limits.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📊 Лимиты токенов</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">⏳ Загрузка данных...</div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📊 Лимиты токенов (по ролям)</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          🎁 Бонусные токены — получаются при входе, сгорают в конце дня.<br>
          💎 Постоянные токены — получаются за подписку или обмен.
        </p>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 8px 10px; color: var(--app-text-tertiary);">Роль</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">🎁 Бонусных в день</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">💎 Постоянных</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">📊 OpenRouter</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Активен</th>
              </tr>
            </thead>
            <tbody>
              ${this.limits.map((limit: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 8px 10px; font-weight: 600; color: var(--app-text-primary);">
                    ${limit.role_name}
                    <span style="font-size: 11px; color: var(--app-text-tertiary); font-weight: 400;">${limit.role_key}</span>
                  </td>
                  <td style="text-align: center; padding: 8px 10px;">
                    <input type="number" class="limit-input" data-id="${limit.id}" data-field="bonus_tokens_per_day" 
                           value="${limit.bonus_tokens_per_day}" min="0"
                           style="width: 70px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary); font-size: 13px; text-align: center;">
                  </td>
                  <td style="text-align: center; padding: 8px 10px;">
                    <input type="number" class="limit-input" data-id="${limit.id}" data-field="permanent_tokens_on_subscribe" 
                           value="${limit.permanent_tokens_on_subscribe}" min="0"
                           style="width: 70px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary); font-size: 13px; text-align: center;">
                  </td>
                  <td style="text-align: center; padding: 8px 10px;">
                    <input type="number" class="limit-input" data-id="${limit.id}" data-field="openrouter_limit" 
                           value="${limit.openrouter_limit}" min="0"
                           style="width: 80px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary); font-size: 13px; text-align: center;">
                  </td>
                  <td style="text-align: center; padding: 8px 10px;">
                    <input type="checkbox" class="limit-active" data-id="${limit.id}" ${limit.is_active ? 'checked' : ''}
                           style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--app-accent-primary);">
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="window.adminModule.saveLimits()" style="padding: 10px 20px;">
            💾 Сохранить лимиты
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('limits')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderSettings(): string {
    const s = this.settings || {
      exchange_enabled: true,
      exchange_rate: 1,
      max_exchange_percent: 80,
      min_exchange_amount: 1,
      bonus_coins_per_day: 5,
      bonus_tokens_per_day: 5,
      whitelist_enabled: false,
      daily_reset_time: '00:00',
      token_expiry_days: 1,
      min_tokens_for_request: 1,
      low_balance_threshold: 10,
      low_tokens_threshold: 5,
      log_retention_days: 90,
      audit_log_retention_days: 180,
    };

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">⚙️ Глобальные настройки</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Настройки применяются ко всем пользователям системы.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">💱 Обмен</div>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--app-text-secondary); margin-bottom: 6px;">
              <input type="checkbox" id="exchange_enabled" ${s.exchange_enabled ? 'checked' : ''} />
              Включить обмен
            </label>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                1 🪙 =
                <input type="number" id="exchange_rate" value="${s.exchange_rate}" min="1" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                ⚡
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Макс %:
                <input type="number" id="max_exchange_percent" value="${s.max_exchange_percent}" min="1" max="100" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                %
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Мин:
                <input type="number" id="min_exchange_amount" value="${s.min_exchange_amount}" min="1" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                🪙
              </label>
            </div>
          </div>

          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🎁 Ежедневные бонусы</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                🪙 Коинов:
                <input type="number" id="bonus_coins_per_day" value="${s.bonus_coins_per_day}" min="0" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                ⚡ Токенов:
                <input type="number" id="bonus_tokens_per_day" value="${s.bonus_tokens_per_day}" min="0" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              </label>
            </div>
          </div>

          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🔒 Белый список</div>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--app-text-secondary);">
              <input type="checkbox" id="whitelist_enabled" ${s.whitelist_enabled ? 'checked' : ''} />
              Включить белый список (только избранные могут обменивать)
            </label>
          </div>

          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">⚙️ Системные</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Время сброса:
                <input type="time" id="daily_reset_time" value="${s.daily_reset_time}" style="width: 90px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Срок токенов:
                <input type="number" id="token_expiry_days" value="${s.token_expiry_days}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                дней
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Мин токенов:
                <input type="number" id="min_tokens_for_request" value="${s.min_tokens_for_request}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                ⚡
              </label>
            </div>
          </div>

          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">📋 Хранение логов</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Системные:
                <input type="number" id="log_retention_days" value="${s.log_retention_days}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                дней
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Аудит:
                <input type="number" id="audit_log_retention_days" value="${s.audit_log_retention_days}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                дней
              </label>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="window.adminModule.saveSettings()" style="padding: 10px 20px;">
            💾 Сохранить настройки
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('settings')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderSubscriptions(): string {
    if (this.tiers.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📦 Тарифы подписки</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">⏳ Загрузка данных...</div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📦 Тарифы подписки</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">Цены указываются в ⭐ Stars.</p>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 8px 10px; color: var(--app-text-tertiary);">Название</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Дней</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Цена ⭐</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">⚡ Токенов</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Активен</th>
              </tr>
            </thead>
            <tbody>
              ${this.tiers.map((tier: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 8px 10px; font-weight: 600; color: var(--app-text-primary);">${tier.name}</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.days}</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.price_stars} ⭐</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.permanent_tokens}</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.is_active ? '✅' : '❌'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('subscriptions')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderAudit(): string {
    if (this.auditLogs.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📜 Аудит</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">📭 Нет операций</div>
        </div>
      `;
    }

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
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Пользователь</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Тип</th>
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Источник</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Сумма</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Баланс</th>
              </tr>
            </thead>
            <tbody>
              ${this.auditLogs.map((log: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 6px 8px; font-size: 11px; color: var(--app-text-tertiary);">${new Date(log.created_at).toLocaleString()}</td>
                  <td style="padding: 6px 8px; font-weight: 500;">${log.user_id}</td>
                  <td style="text-align: center; padding: 6px 8px;">
                    <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; ${log.event_type === 'EARN' ? 'background: rgba(39,174,96,0.15); color: #27ae60;' : log.event_type === 'SPEND' ? 'background: rgba(231,76,60,0.15); color: #e74c3c;' : 'background: rgba(52,152,219,0.15); color: #3498db;'}">
                      ${log.event_type}
                    </span>
                  </td>
                  <td style="padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${log.source || '—'}</td>
                  <td style="text-align: center; padding: 6px 8px; font-weight: 700; ${log.amount > 0 ? 'color: #27ae60;' : 'color: #e74c3c;'}">
                    ${log.amount > 0 ? '+' : ''}${log.amount}
                  </td>
                  <td style="text-align: center; padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${log.balance_before} → ${log.balance_after}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="window.adminModule.prevAuditPage()" style="padding: 6px 14px; font-size: 12px;" ${this.auditPage === 0 ? 'disabled' : ''}>
              ◀ Назад
            </button>
            <span style="font-size: 13px; color: var(--app-text-tertiary); display: flex; align-items: center;">
              Страница ${this.auditPage + 1}
            </span>
            <button class="btn btn-secondary" onclick="window.adminModule.nextAuditPage()" style="padding: 6px 14px; font-size: 12px;" ${this.auditLogs.length < 50 ? 'disabled' : ''}>
              Вперед ▶
            </button>
          </div>
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('audit')" style="padding: 6px 14px; font-size: 12px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderUsers(): string {
    if (this.users.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">👤 Пользователи</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">⏳ Загрузка данных...</div>
        </div>
      `;
    }

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
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Подписка</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">🪙</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">⚡</th>
              </tr>
            </thead>
            <tbody>
              ${this.users.slice(0, 50).map((user: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 6px 8px; font-size: 12px;">${user.telegram_id}</td>
                  <td style="padding: 6px 8px;">${user.username ? '@' + user.username : '—'}</td>
                  <td style="text-align: center; padding: 6px 8px;">
                    <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; ${user.role === 'premium' ? 'background: rgba(212,175,55,0.15); color: #d4af37;' : user.role === 'admin' ? 'background: rgba(231,76,60,0.15); color: #e74c3c;' : 'background: rgba(149,165,166,0.15); color: #95a5a6;'}">
                      ${user.role}
                    </span>
                  </td>
                  <td style="text-align: center; padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${user.subscription_tier || '—'}</td>
                  <td style="text-align: center; padding: 6px 8px;">${user.coin_balance}</td>
                  <td style="text-align: center; padding: 6px 8px;">${user.token_balance_bonus + user.token_balance_permanent}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${this.users.length > 50 ? `<div style="text-align: center; padding: 10px; color: var(--app-text-tertiary); font-size: 12px;">Показано 50 из ${this.users.length} пользователей</div>` : ''}

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('users')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderSecurity(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">🔐 Безопасность</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Управление блокировками пользователей.
        </p>

        <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; margin-bottom: 16px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🚫 Заблокировать пользователя</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <input type="number" id="block-user-id" placeholder="Telegram ID"
                   style="flex: 1; min-width: 120px; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
            <input type="text" id="block-reason" placeholder="Причина"
                   style="flex: 1; min-width: 120px; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
            <button class="btn btn-danger" onclick="window.adminModule.blockUser()" style="padding: 8px 16px;">
              🔒 Заблокировать
            </button>
          </div>
        </div>

        <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🚫 Активные блокировки</div>
          ${this.blocks.length === 0 ? `
            <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary);">🔓 Нет активных блокировок</div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${this.blocks.map((block: any) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--app-bg-secondary); border-radius: 8px;">
                  <div>
                    <span style="font-weight: 500;">${block.username || '👤 ' + block.user_id}</span>
                    <span style="font-size: 12px; color: var(--app-text-tertiary); margin-left: 8px;">${block.reason || 'Причина не указана'}</span>
                  </div>
                  <button class="btn btn-sm btn-success" onclick="window.adminModule.unblockUser('${block.user_id}')" style="padding: 4px 12px; font-size: 12px;">
                    🔓 Разблокировать
                  </button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('security')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderTesting(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">🤖 Тестирование</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Инструменты для тестирования системы.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">👤 Тестовый пользователь</div>
            <div style="display: flex; gap: 6px;">
              <input type="number" id="test-user-id" placeholder="Telegram ID" value="${(window as any).userStore?.userId || ''}"
                     style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              <button class="btn btn-secondary" onclick="window.adminModule.setTestUser()" style="padding: 6px 14px; font-size: 12px;">
                Установить
              </button>
            </div>
          </div>

          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">💰 Управление балансом</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <input type="number" id="test-amount" placeholder="Сумма" value="100"
                     style="flex: 1; min-width: 80px; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              <button class="btn btn-success" onclick="window.adminModule.addCoins()" style="padding: 6px 14px; font-size: 12px;">
                ➕ 🪙
              </button>
              <button class="btn btn-success" onclick="window.adminModule.addTokens()" style="padding: 6px 14px; font-size: 12px;">
                ➕ ⚡
              </button>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('testing')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // ПУБЛИЧНЫЕ МЕТОДЫ
  // ==========================================

  async switchTab(tabId: string): Promise<void> {
    console.log(`🔄 [AdminModule] Переключение на: ${tabId}`);
    this._activeTab = tabId;
    this.render();
  }

  async refreshDashboard(): Promise<void> {
    await this.loadAllData();
    this.render();
  }

  async saveLimits(): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const inputs = document.querySelectorAll('.limit-input');
      const checkboxes = document.querySelectorAll('.limit-active');
      const limits: any[] = [];

      inputs.forEach((input: any) => {
        const id = (input as HTMLInputElement).dataset.id;
        const field = (input as HTMLInputElement).dataset.field;
        const value = parseInt((input as HTMLInputElement).value) || 0;
        let limit = limits.find((l: any) => l.id === id);
        if (!limit) {
          const checkbox = Array.from(checkboxes).find((cb: any) => (cb as HTMLInputElement).dataset.id === id);
          limit = { id, is_active: checkbox ? (checkbox as HTMLInputElement).checked : false };
          limits.push(limit);
        }
        limit[field] = value;
      });

      const response = await apiClient.post('/admin/economy/limits', { limits });
      if (response.success) {
        const { uiRenderer } = await import('@/modules/ui/renderer');
        uiRenderer.showToast('✅ Лимиты сохранены', 'success', 2000);
        await this.loadAllData();
        this.render();
      }
    } catch (err) {
      console.error('[AdminModule] Error saving limits:', err);
    }
  }

  async saveSettings(): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const data = {
        exchange_enabled: (document.getElementById('exchange_enabled') as HTMLInputElement)?.checked ?? true,
        exchange_rate: parseInt((document.getElementById('exchange_rate') as HTMLInputElement)?.value || '1'),
        max_exchange_percent: parseInt((document.getElementById('max_exchange_percent') as HTMLInputElement)?.value || '80'),
        min_exchange_amount: parseInt((document.getElementById('min_exchange_amount') as HTMLInputElement)?.value || '1'),
        bonus_coins_per_day: parseInt((document.getElementById('bonus_coins_per_day') as HTMLInputElement)?.value || '5'),
        bonus_tokens_per_day: parseInt((document.getElementById('bonus_tokens_per_day') as HTMLInputElement)?.value || '5'),
        whitelist_enabled: (document.getElementById('whitelist_enabled') as HTMLInputElement)?.checked ?? false,
        daily_reset_time: (document.getElementById('daily_reset_time') as HTMLInputElement)?.value || '00:00',
        token_expiry_days: parseInt((document.getElementById('token_expiry_days') as HTMLInputElement)?.value || '1'),
        min_tokens_for_request: parseInt((document.getElementById('min_tokens_for_request') as HTMLInputElement)?.value || '1'),
        log_retention_days: parseInt((document.getElementById('log_retention_days') as HTMLInputElement)?.value || '90'),
        audit_log_retention_days: parseInt((document.getElementById('audit_log_retention_days') as HTMLInputElement)?.value || '180'),
      };

      const response = await apiClient.post('/admin/economy/settings', data);
      if (response.success) {
        const { uiRenderer } = await import('@/modules/ui/renderer');
        uiRenderer.showToast('✅ Настройки сохранены', 'success', 2000);
        await this.loadAllData();
        this.render();
      }
    } catch (err) {
      console.error('[AdminModule] Error saving settings:', err);
    }
  }

  async blockUser(): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const userId = parseInt((document.getElementById('block-user-id') as HTMLInputElement)?.value || '0');
      const reason = (document.getElementById('block-reason') as HTMLInputElement)?.value || null;

      if (!userId) {
        const { uiRenderer } = await import('@/modules/ui/renderer');
        uiRenderer.showToast('⚠️ Введите ID пользователя', 'error', 2000);
        return;
      }

      const response = await apiClient.post('/admin/economy/blocks', { user_id: userId, reason });
      if (response.success) {
        const { uiRenderer } = await import('@/modules/ui/renderer');
        uiRenderer.showToast(`🔒 Пользователь ${userId} заблокирован`, 'success', 2000);
        await this.loadAllData();
        this.render();
      }
    } catch (err) {
      console.error('[AdminModule] Error blocking user:', err);
    }
  }

  async unblockUser(userId: string): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const response = await apiClient.delete(`/admin/economy/blocks?user_id=${userId}`);
      if (response.success) {
        const { uiRenderer } = await import('@/modules/ui/renderer');
        uiRenderer.showToast(`🔓 Пользователь ${userId} разблокирован`, 'success', 2000);
        await this.loadAllData();
        this.render();
      }
    } catch (err) {
      console.error('[AdminModule] Error unblocking user:', err);
    }
  }

  async nextAuditPage(): Promise<void> {
    this.auditPage++;
    await this.loadAllData();
    this.render();
  }

  async prevAuditPage(): Promise<void> {
    if (this.auditPage > 0) {
      this.auditPage--;
      await this.loadAllData();
      this.render();
    }
  }

  async setTestUser(): Promise<void> {
    const userId = parseInt((document.getElementById('test-user-id') as HTMLInputElement)?.value || '0');
    if (!userId) {
      const { uiRenderer } = await import('@/modules/ui/renderer');
      uiRenderer.showToast('⚠️ Введите ID пользователя', 'error', 2000);
      return;
    }
    if ((window as any).userStore) {
      (window as any).userStore.userId = userId;
      (window as any).userStore.save();
      const { uiRenderer } = await import('@/modules/ui/renderer');
      uiRenderer.showToast(`👤 Тестовый пользователь: ${userId}`, 'success', 2000);
    }
  }

  async addCoins(): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const userId = parseInt((document.getElementById('test-user-id') as HTMLInputElement)?.value || '0');
      const amount = parseInt((document.getElementById('test-amount') as HTMLInputElement)?.value || '0');
      if (!userId || !amount) return;
      const response = await apiClient.post('/admin/coins', { user_id: userId, amount, reason: 'Тестирование', action: 'add' });
      if (response.success) {
        const { uiRenderer } = await import('@/modules/ui/renderer');
        uiRenderer.showToast(`✅ Начислено ${amount} 🪙 пользователю ${userId}`, 'success', 2000);
      }
    } catch (err) {
      console.error('[AdminModule] Error adding coins:', err);
    }
  }

  async addTokens(): Promise<void> {
    try {
      const { apiClient } = await import('@/services/api');
      const userId = parseInt((document.getElementById('test-user-id') as HTMLInputElement)?.value || '0');
      const amount = parseInt((document.getElementById('test-amount') as HTMLInputElement)?.value || '0');
      if (!userId || !amount) return;
      const response = await apiClient.post('/admin/tokens', { user_id: userId, amount, reason: 'Тестирование' });
      if (response.success) {
        const { uiRenderer } = await import('@/modules/ui/renderer');
        uiRenderer.showToast(`✅ Начислено ${amount} ⚡ пользователю ${userId}`, 'success', 2000);
      }
    } catch (err) {
      console.error('[AdminModule] Error adding tokens:', err);
    }
  }

  // ==========================================
  // ПОКАЗ / СКРЫТИЕ
  // ==========================================

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
};

console.log('✅ AdminModule v6.0.4 загружен');
