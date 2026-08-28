// ============================================
// src/modules/economy/EconomyModule.ts
// Модуль экономики (коины + токены)
// Версия: 2.0.1 — исправлен subscription_tier
// ============================================

import './economy.css';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';
import { economyStore } from '@/economy/EconomyStore';
import { economyService } from '@/economy/EconomyService';
import { subscriptionService } from '@/services/subscription';
import { subscriptionStore } from '@/store/SubscriptionStore';
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
  private subscriptionService = subscriptionService;
  private subscriptionStore = subscriptionStore;
  private uiRenderer = uiRenderer;
  private modalManager = modalManager;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.headerManager.setTitle('💰 Экономика');
    this.headerManager.setActions([]);

    await this.economyStore.loadBalances();
    await this.economyStore.loadConfig();
    await this.subscriptionStore.loadTiers();

    this._render();
    this._subscribeToEvents();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ EconomyModule v2.0.1 инициализирован');
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

    const unsubSubscription = this.eventBus.on('subscription:updated', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsubSubscription);

    console.log('📡 EconomyModule подписан на события');
  }

  private _render(): void {
    const isPremium = this.userStore.isPro();
    const premiumUntil = this.userStore.premiumUntil;
    const trialUsed = this.userStore.trialUsed;

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

    document.querySelectorAll('.economy-tab').forEach(btn => {
      const element = btn as HTMLElement;
      const isActive = element.dataset.tab === tab;
      element.classList.toggle('active', isActive);
    });

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
      const confirmResult = await new Promise<boolean>((resolve) => {
        if ((window as any).tg?.showConfirm) {
          (window as any).tg.showConfirm(
            `⚠️ Вы обмениваете более ${maxPercent}% всех монет (${coins} 🪙). Продолжить?`,
            (ok: boolean) => resolve(ok)
          );
        } else {
          resolve(window.confirm(`⚠️ Вы обмениваете более ${maxPercent}% всех монет. Продолжить?`));
        }
      });

      if (!confirmResult) return;
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

        this._updateUI();

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

  // ==========================================
  // ПОДПИСКА (ПОКУПКА ЗА ⭐ STARS)
  // ==========================================

  async openSubscriptionModal(): Promise<void> {
    const isPremium = this.userStore.isPro();
    const trialUsed = this.userStore.trialUsed;
    const tiers = this.subscriptionStore.getActiveTiers();

    if (tiers.length === 0) {
      this.uiRenderer?.showToast('⚠️ Тарифы временно недоступны', 'error', 2000);
      return;
    }

    // ✅ ИСПРАВЛЕНО: используем (this.userStore as any)
    const currentTier = (this.userStore as any)._data?.subscription_tier || null;

    const content = `
      <div style="padding: 4px 0;">
        ${isPremium ? `
          <div style="background: rgba(39, 174, 96, 0.08); border-radius: 12px; padding: 12px; margin-bottom: 16px; border: 1px solid rgba(39, 174, 96, 0.2);">
            <div style="font-weight: 600; color: #27ae60;">⭐ У вас активна подписка</div>
            <div style="font-size: 13px; color: var(--app-text-secondary); margin-top: 4px;">
              Действует до: ${this.userStore.premiumUntil ? new Date(this.userStore.premiumUntil).toLocaleDateString() : 'навсегда'}
            </div>
          </div>
        ` : ''}
        
        <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
          ${tiers.map((tier: any) => {
            const isTrial = tier.is_trial;
            const isDisabled = isTrial && trialUsed;
            // ✅ ИСПРАВЛЕНО
            const isCurrent = isPremium && currentTier === tier.tier_key;
            
            return `
              <div style="
                background: var(--app-bg-tertiary); 
                border-radius: 12px; 
                padding: 16px; 
                border: 2px solid ${isCurrent ? 'var(--app-accent-primary)' : isTrial && !trialUsed ? 'var(--app-accent-primary)' : 'var(--app-border-color)'};
                opacity: ${isDisabled ? '0.5' : '1'};
              ">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <div style="font-weight: 600; font-size: 16px; color: var(--app-text-primary);">
                      ${tier.name}
                    </div>
                    <div style="font-size: 13px; color: var(--app-text-secondary);">
                      ${tier.days} дней • ${tier.price_stars === 0 ? 'Бесплатно' : tier.price_stars + ' ⭐'}
                    </div>
                    ${tier.description ? `
                      <div style="font-size: 12px; color: var(--app-text-tertiary); margin-top: 4px;">
                        ${tier.description}
                      </div>
                    ` : ''}
                    ${tier.permanent_tokens > 0 ? `
                      <div style="font-size: 12px; color: #f1c40f; margin-top: 4px;">
                        🎁 +${tier.permanent_tokens} постоянных токенов
                      </div>
                    ` : ''}
                    ${isTrial && trialUsed ? `
                      <div style="font-size: 11px; color: #e74c3c; margin-top: 4px;">
                        ✓ Пробный период уже использован
                      </div>
                    ` : ''}
                  </div>
                  <div>
                    ${isCurrent ? `
                      <span style="font-size: 13px; color: var(--app-accent-primary); font-weight: 600;">
                        ✓ Активен
                      </span>
                    ` : `
                      <button 
                        class="btn" 
                        style="padding: 8px 16px; font-size: 13px; ${isTrial ? 'background: var(--app-gradient-primary);' : ''}"
                        onclick="window.economyModule.purchaseSubscription('${tier.tier_key}')"
                        ${isDisabled ? 'disabled' : ''}
                      >
                        ${isTrial ? '🎁 Активировать' : '💎 Купить'}
                      </button>
                    `}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
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

  async purchaseSubscription(tierKey: string): Promise<void> {
    if (this.userStore.isPro()) {
      this.uiRenderer?.showToast('⚠️ У вас уже активна подписка', 'info', 2000);
      return;
    }

    const tier = this.subscriptionStore.getTierByKey(tierKey);
    if (!tier) {
      this.uiRenderer?.showToast('⚠️ Тариф не найден', 'error', 2000);
      return;
    }

    // Проверяем, не одноразовый ли тариф
    if (tier.is_one_time) {
      const used = await this.subscriptionService.getUserSubscription();
      if (used && used.tier_key === tierKey && used.is_active) {
        this.uiRenderer?.showToast('⚠️ Этот тариф можно купить только 1 раз', 'error', 2000);
        return;
      }
    }

    try {
      let result;
      
      if (tier.is_trial) {
        result = await this.subscriptionService.activateTrial();
      } else {
        result = await this.subscriptionService.purchaseSubscription(tierKey);
      }

      if (result.success) {
        // Обновляем локальные данные
        if (tier.is_trial) {
          this.userStore.markTrialUsed();
        }
        
        this.userStore.setRole('premium', 100, true);
        
        // Обновляем токены
        if (result.tokens && result.tokens > 0) {
          const currentTokens = this.economyStore.getTokenBalances();
          this.economyStore.updateTokenBalances(
            currentTokens.bonus,
            currentTokens.permanent + result.tokens
          );
        }

        this.uiRenderer?.showToast(
          tier.is_trial 
            ? `🎉 Пробный период активирован на ${result.days} дней! +${result.tokens} ⚡`
            : `✅ Куплен ${tier.name} на ${result.days} дней! +${result.tokens} ⚡`,
          'success',
          3000
        );

        this.modalManager.close();
        this._render();

        // Обновляем UI
        this.eventBus.emit('user:role_changed', {
          oldRole: 'trial',
          newRole: 'premium',
          dailyLimit: 100,
          syncEnabled: true,
        });
        this.eventBus.emit('subscription:updated', { tier: tierKey });
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка покупки'}`, 'error', 2000);
      }
    } catch (err) {
      console.error('[purchaseSubscription] Error:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка сервера', 'error', 2000);
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
    this.subscriptionStore.loadTiers();

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

// Метод для вызова из HTML
(window as any).economyModule.purchaseSubscription = (window as any).economyModule.purchaseSubscription.bind(
  (window as any).economyModule
);

console.log('✅ EconomyModule v2.0.1 загружен');
