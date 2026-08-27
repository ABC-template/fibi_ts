// ============================================
// src/modules/coins/CoinsModule.ts
// Модуль для отображения кошелька и транзакций
// Версия: 2.0.0 - ПЕРЕКЛЮЧЕНО НА EconomyStore
// ============================================

import { coinsStore } from './CoinsStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';

export class CoinsModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private headerManager = headerManager;
  private eventBus = eventBus;
  private coinsStore = coinsStore;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.headerManager.setTitle('💰 Кошелёк');
    this.headerManager.setActions([]);

    this._render();
    this._subscribeToEvents();

    this.isInitialized = true;
    console.log('✅ CoinsModule v2.0.0 инициализирован (переключен на EconomyStore)');
  }

  private _subscribeToEvents(): void {
    const unsub = this.eventBus.on('coins:synced', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub);

    const unsub2 = this.eventBus.on('economy:balance:updated', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub2);
  }

  private _render(): void {
    const balance = this.coinsStore.getBalance();
    const stats = this.coinsStore.getStats();
    const transactions = this.coinsStore.getRecentTransactions(50);

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
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid var(--app-border-color-light);
          text-align: center;
          margin-bottom: 16px;
        ">
          <div style="font-size: 14px; color: var(--app-text-tertiary);">Ваш баланс</div>
          <div id="coins-balance-display" style="
            font-size: 48px;
            font-weight: 700;
            color: var(--app-accent-primary);
            margin: 4px 0;
          ">
            ${balance}
          </div>
          <div style="font-size: 13px; color: var(--app-text-secondary);">
            🪙 Fibi Coins
          </div>
        </div>

        <div style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        ">
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 14px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 20px; font-weight: 700; color: #27ae60;">
              ${stats.total_earned}
            </div>
            <div style="font-size: 11px; color: var(--app-text-tertiary);">Всего заработано</div>
          </div>
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 14px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 20px; font-weight: 700; color: #e74c3c;">
              ${stats.total_spent}
            </div>
            <div style="font-size: 11px; color: var(--app-text-tertiary);">Всего потрачено</div>
          </div>
        </div>

        <div style="
          flex: 1;
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 16px;
          border: 1px solid var(--app-border-color-light);
        ">
          <div style="
            font-size: 14px;
            font-weight: 600;
            color: var(--app-text-primary);
            margin-bottom: 12px;
          ">
            📜 История операций
          </div>
          <div id="coins-transactions-list" style="
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 400px;
            overflow-y: auto;
          ">
            ${this._renderTransactions(transactions)}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);
  }

  private _renderTransactions(transactions: any[]): string {
    if (transactions.length === 0) {
      return `
        <div style="
          text-align: center;
          padding: 30px 0;
          color: var(--app-text-tertiary);
          font-size: 13px;
        ">
          Пока нет транзакций
        </div>
      `;
    }

    return transactions.map(t => {
      const isEarn = t.amount > 0;
      const sign = isEarn ? '+' : '';
      const color = isEarn ? '#27ae60' : '#e74c3c';
      const date = new Date(t.created_at);
      const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: var(--app-bg-tertiary);
          border-radius: 10px;
          border-left: 3px solid ${color};
        ">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; color: var(--app-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${t.description}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">
              ${t.source} • ${timeStr}
            </div>
          </div>
          <div style="font-weight: 700; color: ${color}; margin-left: 12px; flex-shrink: 0;">
            ${sign}${t.amount}
          </div>
        </div>
      `;
    }).join('');
  }

  private _updateUI(): void {
    const balanceEl = document.getElementById('coins-balance-display');
    const listEl = document.getElementById('coins-transactions-list');

    if (balanceEl) {
      balanceEl.textContent = String(this.coinsStore.getBalance());
    }

    if (listEl) {
      const transactions = this.coinsStore.getRecentTransactions(50);
      listEl.innerHTML = this._renderTransactions(transactions);
    }
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle('💰 Кошелёк');
    this.headerManager.setActions([]);
    this._updateUI();

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
        console.warn('Ошибка отписки CoinsModule:', e);
      }
    }
    this._subscriptions = [];
    this.container.innerHTML = '';
    console.log('🗑️ CoinsModule уничтожен');
  }
}

(window as any).CoinsModule = CoinsModule;
console.log('✅ CoinsModule v2.0.0 загружен (переключен на EconomyStore)');
