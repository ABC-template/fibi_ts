// ============================================
// src/modules/economy/EconomyModule.ts
// Модуль экономики (коины + токены)
// Версия: 1.0.0
// ============================================

import './economy.css';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';
import { economyStore } from '@/economy/EconomyStore';
import { economyService } from '@/economy/EconomyService';
import { uiRenderer } from '@/modules/ui/renderer';
import { modalManager } from '@/core/modal-manager';

type TabType = 'coins' | 'tokens';

export class EconomyModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _activeTab: TabType = 'coins';
  private headerManager = headerManager;
  private eventBus = eventBus;
  private userStore = userStore;
  private economyStore = economyStore;
  private economyService = economyService;
  private uiRenderer = uiRenderer;
  private modalManager = modalManager;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.headerManager.setTitle('💰 Экономика');
    this.headerManager.setActions([]);

    // Загружаем данные
    await this.economyStore.loadBalances();
    await this.economyStore.loadConfig();

    this._render();
    this._subscribeToEvents();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ EconomyModule v1.0.0 инициализирован');
  }

  private _subscribeToEvents(): void {
    const unsubCoins = this.eventBus.on('economy:coins:updated', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsubCoins);

    const unsubTokens = this.eventBus.on('economy:tokens:updated', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsubTokens);

    const unsubConfig = this.eventBus.on('economy:config:loaded', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsubConfig);
  }

  private _render(): void {
    const user = this.userStore;
    const isPremium = user.isPro();
    const premiumUntil = user._data.premium_until || null;
    const trialUsed = user._data.trialUsed || false;

    this.container.innerHTML = `
      <div class="economy-container">
        <!-- Панель подписки -->
        <div class="subscription-panel">
          <div class="tier-info">
            <span class="tier-name ${isPremium ? 'premium' : ''}">
              ${isPremium ? '⭐ PRO' : '🔓 Бесплатный'}
            </span>
            ${premiumUntil ? `
              <span class="tier-expiry">до ${new Date(premiumUntil).toLocaleDateString()}</span>
            ` : ''}
          </div>
          <button class="tier-btn" onclick="window.economyModule.openSubscriptionModal()">
            ${isPremium ? '📋 Управление' : '🔒 Получить PRO'}
          </button>
        </div>

        <!-- Вкладки -->
        <div class="economy-tabs">
          <button class="economy-tab ${this._activeTab === 'coins' ? 'active' : ''}" 
                  data-tab="coins" 
                  onclick="window.economyModule.switchTab('coins')">
            🪙 Коины
          </button>
          <button class="economy-tab ${this._activeTab === 'tokens' ? 'active' : ''}" 
                  data-tab="tokens" 
                  onclick="window.economyModule.switchTab('tokens')">
            ⚡ Токены
          </button>
        </div>

        <!-- Контент -->
        <div class="economy-tab-content" id="economy-tab-content">
          ${this._renderTabContent()}
        </div>
      </div>
    `;

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);
  }

  private _renderTabContent(): string {
    switch (this._activeTab) {
      case 'coins':
        return this._renderCoinsTab();
      case 'tokens':
        return this._renderTokensTab();
      default:
        return '';
    }
  }

  private _renderCoinsTab(): string {
    const balance = this.economyStore.getCoinBalance();
    const stats = this.economyStore.getCoinStats();
    const config = this.economyStore.getConfig();
    const transactions = this.economyStore.getTransactions('coins');

    const isExchangeEnabled = config?.exchange_enabled !== false;
    const exchangeRate = config?.exchange_rate || 1;
    const maxPercent = config?.max_exchange_percent || 80;

    return `
      <!-- Баланс -->
      <div class="economy-balance-card">
        <div class="label">Ваш баланс</div>
        <div class="balance">${balance} 🪙</div>
        <div class="sub">Всего заработано: ${stats.total_earned} • Потрачено: ${stats.total_spent}</div>
      </div>

      <!-- Обмен -->
      ${isExchangeEnabled ? `
        <div class="exchange-widget">
          <div class="rate">
            Курс: 1 🪙 = <strong>${exchangeRate}</strong> ⚡
          </div>
          <div class="input-group">
            <input 
              type="number" 
              id="exchange-coins-input"
              min="1"
              max="${balance}"
              placeholder="Количество коинов"
              oninput="window.economyModule.updateExchangePreview(this.value)"
            />
            <button class="max-btn" onclick="window.economyModule.setMaxCoins()">Макс</button>
          </div>
          <div class="preview">
            <span class="hint">Вы получите:</span>
            <span class="tokens" id="exchange-tokens-preview">0 ⚡</span>
          </div>
          <div class="warning" id="exchange-warning">
            ⚠️ Вы обмениваете более ${maxPercent}% всех монет
          </div>
          <button class="exchange-btn" id="exchange-btn" onclick="window.economyModule.performExchange()">
            Обменять
          </button>
        </div>
      ` : `
        <div class="exchange-widget">
          <div class="exchange-disabled">
            <span class="icon">⛔</span>
            Обмен временно недоступен
          </div>
        </div>
      `}

      <!-- История -->
      <div class="economy-history">
        <div class="title">
          📜 История транзакций
          <span class="count">${transactions.length} из 50</span>
        </div>
        <div class="list">
          ${this._renderTransactions(transactions, 'coins')}
        </div>
      </div>
    `;
  }

  private _renderTokensTab(): string {
    const tokens = this.economyStore.getTokenBalances();
    const transactions = this.economyStore.getTransactions('tokens');

    return `
      <!-- Баланс -->
      <div class="economy-balance-card">
        <div class="label">Ваши токены</div>
        <div class="balance">${tokens.total} ⚡</div>
      </div>

      <!-- Детализация -->
      <div class="token-breakdown">
        <div class="token-item">
          <div class="value bonus">${tokens.bonus}</div>
          <div class="label">🎁 Бонусные</div>
          ${tokens.bonus > 0 ? '<div class="hint">сгорят завтра</div>' : '<div class="hint">бонусных токенов нет</div>'}
        </div>
        <div class="token-item">
          <div class="value permanent">${tokens.permanent}</div>
          <div class="label">💎 Постоянные</div>
          <div class="hint">не сгорают</div>
        </div>
      </div>

      <!-- История -->
      <div class="economy-history">
        <div class="title">
          📜 История транзакций
          <span class="count">${transactions.length} из 50</span>
        </div>
        <div class="list">
          ${this._renderTransactions(transactions, 'tokens')}
        </div>
      </div>
    `;
  }

  private _renderTransactions(transactions: any[], type: 'coins' | 'tokens'): string {
    if (!transactions || transactions.length === 0) {
      return `<div class="empty">Нет транзакций</div>`;
    }

    const isTokens = type === 'tokens';

    return transactions.slice(0, 50).map((t: any) => {
      const isPositive = t.amount > 0;
      const sign = isPositive ? '+' : '';
      
      let amountClass = 'amount';
      if (isPositive) {
        amountClass += ' positive';
      } else {
        amountClass += ' negative';
      }

      // Для токенов определяем тип
      if (isTokens) {
        if (t.type === 'bonus') amountClass += ' bonus';
        if (t.type === 'exchange_in' || t.type === 'permanent') amountClass += ' permanent';
      }

      const date = new Date(t.created_at);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      return `
        <div class="transaction">
          <div class="info">
            <div class="desc">${t.description || t.source || 'Транзакция'}</div>
            <div class="meta">${dateStr} ${timeStr} • ${t.source || ''}</div>
          </div>
          <div class="${amountClass}">${sign}${t.amount}</div>
        </div>
      `;
    }).join('');
  }

  private _updateUI(): void {
    const content = document.getElementById('economy-tab-content');
    if (content) {
      content.innerHTML = this._renderTabContent();
      
      setTimeout(() => {
        if (typeof (window as any).lucide !== 'undefined') {
          (window as any).lucide.createIcons();
        }
      }, 50);
    }
  }

  // ==========================================
  // ПУБЛИЧНЫЕ МЕТОДЫ
  // ==========================================

  switchTab(tab: TabType): void {
    if (this._activeTab === tab) return;
    this._activeTab = tab;

    // Обновляем кнопки
    document.querySelectorAll('.economy-tab').forEach(btn => {
      const element = btn as HTMLElement;
      const isActive = element.dataset.tab === tab;
      element.classList.toggle('active', isActive);
    });

    // Обновляем контент
    this._updateUI();
  }

  updateExchangePreview(value: string): void {
    const coins = parseInt(value) || 0;
    const config = this.economyStore.getConfig();
    const rate = config?.exchange_rate || 1;
    const tokens = coins * rate;
    const balance = this.economyStore.getCoinBalance();
    const maxPercent = config?.max_exchange_percent || 80;

    const previewEl = document.getElementById('exchange-tokens-preview');
    if (previewEl) {
      previewEl.textContent = `${tokens} ⚡`;
    }

    const warningEl = document.getElementById('exchange-warning');
    if (warningEl) {
      if (balance > 0 && coins > (balance * maxPercent / 100)) {
        warningEl.classList.add('visible');
      } else {
        warningEl.classList.remove('visible');
      }
    }

    const btn = document.getElementById('exchange-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = coins <= 0 || coins > balance;
    }
  }

  setMaxCoins(): void {
    const balance = this.economyStore.getCoinBalance();
    const config = this.economyStore.getConfig();
    const maxPercent = config?.max_exchange_percent || 80;
    const maxCoins = Math.floor(balance * maxPercent / 100);

    const input = document.getElementById('exchange-coins-input') as HTMLInputElement;
    if (input) {
      input.value = String(maxCoins);
      this.updateExchangePreview(String(maxCoins));
    }
  }

  async performExchange(): Promise<void> {
    const input = document.getElementById('exchange-coins-input') as HTMLInputElement;
    const coins = parseInt(input?.value || '0');

    if (coins <= 0) {
      this.uiRenderer?.showToast('⚠️ Введите количество коинов', 'error', 1500);
      return;
    }

    const balance = this.economyStore.getCoinBalance();
    if (coins > balance) {
      this.uiRenderer?.showToast('⚠️ Недостаточно коинов', 'error', 1500);
      return;
    }

    const config = this.economyStore.getConfig();
    const maxPercent = config?.max_exchange_percent || 80;
    const maxCoins = Math.floor(balance * maxPercent / 100);

    if (coins > maxCoins) {
      const confirm = await new Promise<boolean>((resolve) => {
        if ((window as any).tg?.showConfirm) {
          (window as any).tg.showConfirm(
            `⚠️ Вы обмениваете более ${maxPercent}% всех монет (${coins} 🪙). Продолжить?`,
            (ok: boolean) => resolve(ok)
          );
        } else {
          resolve(confirm(`⚠️ Вы обмениваете более ${maxPercent}% всех монет. Продолжить?`));
        }
      });

      if (!confirm) return;
    }

    try {
      const result = await this.economyService.exchangeCoinsToTokens(
        this.userStore.userId!,
        coins
      );

      if (result.success) {
        this.economyStore.updateCoinBalance(result.new_coin_balance);
        this.economyStore.updateTokenBalances(
          result.token_balance_bonus,
          result.token_balance_permanent
        );
        
        this.uiRenderer?.showToast(
          `✅ Обмен успешен! +${result.tokens_received} ⚡`,
          'success',
          2000
        );

        // Обновляем UI
        this._updateUI();

        // Событие для обновления других частей приложения
        this.eventBus.emit('economy:tokens:updated', {
          bonus: result.token_balance_bonus,
          permanent: result.token_balance_permanent,
        });
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка обмена'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('[performExchange] Error:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 1500);
    }
  }

  async openSubscriptionModal(): Promise<void> {
    const user = this.userStore;
    const isPremium = user.isPro();
    const trialUsed = user._data.trialUsed || false;

    const content = `
      <div style="padding: 4px 0;">
        ${isPremium ? `
          <div style="background: rgba(39, 174, 96, 0.08); border-radius: 12px; padding: 12px; margin-bottom: 16px; border: 1px solid rgba(39, 174, 96, 0.2);">
            <div style="font-weight: 600; color: #27ae60;">⭐ У вас активна PRO-подписка</div>
            <div style="font-size: 13px; color: var(--app-text-secondary); margin-top: 4px;">
              Действует до: ${user._data.premium_until ? new Date(user._data.premium_until).toLocaleDateString() : 'навсегда'}
            </div>
          </div>
        ` : ''}
        
        <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
          <!-- Пробный тариф -->
          <div style="background: var(--app-bg-tertiary); border-radius: 12px; padding: 16px; border: 2px solid ${trialUsed ? 'var(--app-border-color)' : 'var(--app-accent-primary)'}; opacity: ${trialUsed ? '0.6' : '1'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 16px; color: var(--app-text-primary);">🔓 Пробный</div>
                <div style="font-size: 13px; color: var(--app-text-secondary);">3 дня • Бесплатно</div>
              </div>
              <div style="text-align: right;">
                ${trialUsed ? `
                  <div style="font-size: 12px; color: #e74c3c;">✓ Использован</div>
                ` : `
                  <button class="btn" style="padding: 8px 16px; font-size: 13px;" onclick="window.economyModule.activateTrial()">
                    Активировать
                  </button>
                `}
              </div>
            </div>
            <div style="font-size: 11px; color: var(--app-text-tertiary); margin-top: 8px;">
              🎁 Получите 3 дня бесплатного доступа к PRO-функциям
            </div>
          </div>

          <!-- Базовый тариф -->
          <div style="background: var(--app-bg-tertiary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 16px; color: var(--app-text-primary);">📦 Базовый</div>
                <div style="font-size: 13px; color: var(--app-text-secondary);">30 дней • 5 🪙</div>
              </div>
              <div>
                <button class="btn" style="padding: 8px 16px; font-size: 13px;" onclick="window.economyModule.buySubscription('basic')">
                  Купить
                </button>
              </div>
            </div>
          </div>

          <!-- PRO тариф -->
          <div style="background: var(--app-bg-tertiary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-accent-primary);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 16px; color: var(--app-accent-primary);">⭐ PRO</div>
                <div style="font-size: 13px; color: var(--app-text-secondary);">90 дней • 12 🪙</div>
              </div>
              <div>
                <button class="btn" style="padding: 8px 16px; font-size: 13px; background: var(--app-gradient-primary);" onclick="window.economyModule.buySubscription('pro')">
                  Купить
                </button>
              </div>
            </div>
            <div style="font-size: 11px; color: var(--app-text-tertiary); margin-top: 8px;">
              🌟 Лучшая цена • 50 000 токенов в день • Синхронизация чатов
            </div>
          </div>

          <!-- ULTIMATE тариф -->
          <div style="background: var(--app-bg-tertiary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 16px; color: var(--app-text-primary);">💎 ULTIMATE</div>
                <div style="font-size: 13px; color: var(--app-text-secondary);">365 дней • 40 🪙</div>
              </div>
              <div>
                <button class="btn" style="padding: 8px 16px; font-size: 13px;" onclick="window.economyModule.buySubscription('ultimate')">
                  Купить
                </button>
              </div>
            </div>
            <div style="font-size: 11px; color: var(--app-text-tertiary); margin-top: 8px;">
              👑 Всё включено • Экономия 70%
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalManager.open({
      title: isPremium ? '📋 Управление подпиской' : '🔒 Стать PRO',
      content: content,
      modalId: 'subscription',
      showFooter: false,
    });
  }

  async activateTrial(): Promise<void> {
    if (this.userStore._data.trialUsed) {
      this.uiRenderer?.showToast('⚠️ Пробный период уже был использован', 'error', 1500);
      return;
    }

    try {
      // Здесь будет API вызов для активации пробного периода
      // Пока эмулируем
      this.userStore._data.trialUsed = true;
      this.userStore._data.role = 'premium';
      this.userStore._data.premium_until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      this.userStore.save();

      this.uiRenderer?.showToast('🎉 Пробный период активирован! 3 дня PRO', 'success', 3000);
      this.modalManager.close();
      this._render();

      // Обновляем другие части приложения
      this.eventBus.emit('user:role_changed', {
        oldRole: 'trial',
        newRole: 'premium',
        dailyLimit: 100,
        syncEnabled: true,
      });
    } catch (err) {
      console.error('[activateTrial] Error:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка активации', 'error', 1500);
    }
  }

  async buySubscription(tier: string): Promise<void> {
    const prices: Record<string, number> = {
      basic: 5,
      pro: 12,
      ultimate: 40,
    };

    const price = prices[tier] || 0;
    const balance = this.economyStore.getCoinBalance();

    if (balance < price) {
      this.uiRenderer?.showToast(
        `⚠️ Недостаточно коинов. Нужно: ${price} 🪙, у вас: ${balance} 🪙`,
        'error',
        3000
      );
      return;
    }

    const confirm = await new Promise<boolean>((resolve) => {
      if ((window as any).tg?.showConfirm) {
        (window as any).tg.showConfirm(
          `Купить ${tier} за ${price} 🪙?`,
          (ok: boolean) => resolve(ok)
        );
      } else {
        resolve(confirm(`Купить ${tier} за ${price} 🪙?`));
      }
    });

    if (!confirm) return;

    try {
      // Здесь будет API вызов для покупки
      // Пока эмулируем
      this.economyStore.updateCoinBalance(balance - price);
      
      // Добавляем постоянные токены за подписку
      const tokenBonus: Record<string, number> = {
        basic: 100,
        pro: 500,
        ultimate: 2000,
      };
      
      const tokens = tokenBonus[tier] || 0;
      const currentTokens = this.economyStore.getTokenBalances();
      this.economyStore.updateTokenBalances(
        currentTokens.bonus,
        currentTokens.permanent + tokens
      );

      // Обновляем подписку
      const days: Record<string, number> = {
        basic: 30,
        pro: 90,
        ultimate: 365,
      };

      this.userStore._data.role = 'premium';
      this.userStore._data.premium_until = new Date(Date.now() + days[tier] * 24 * 60 * 60 * 1000).toISOString();
      this.userStore.save();

      this.uiRenderer?.showToast(
        `✅ Куплен ${tier} на ${days[tier]} дней! +${tokens} ⚡ постоянных токенов`,
        'success',
        3000
      );
      this.modalManager.close();
      this._render();

      // Обновляем другие части приложения
      this.eventBus.emit('user:role_changed', {
        oldRole: 'trial',
        newRole: 'premium',
        dailyLimit: 100,
        syncEnabled: true,
      });
    } catch (err) {
      console.error('[buySubscription] Error:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка покупки', 'error', 1500);
    }
  }

  // ==========================================
  // УПРАВЛЕНИЕ МОДУЛЕМ
  // ==========================================

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle('💰 Экономика');
    this.headerManager.setActions([]);

    this.economyStore.loadBalances();
    this.economyStore.loadConfig();

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
        console.warn('Ошибка отписки EconomyModule:', e);
      }
    }
    this._subscriptions = [];
    this.container.innerHTML = '';
    console.log('🗑️ EconomyModule уничтожен');
  }
}

// Привязываем к window
(window as any).EconomyModule = EconomyModule;
(window as any).economyModule = new EconomyModule(document.createElement('div'));

console.log('✅ EconomyModule v1.0.0 загружен');
