// ============================================
// src/modules/referral/ReferralModule.ts
// Модуль реферальной системы
// Версия: 2.0.0 - ИЗМЕНЕНО: экономика через EventBus
// ============================================

import { referralStore, REFERRAL_TIERS, REFERRAL_REWARD_LIMIT } from './ReferralStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';

export class ReferralModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private headerManager = headerManager;
  private eventBus = eventBus;
  private referralStore = referralStore;
  private userStore = userStore;
  private uiRenderer = uiRenderer;
  
  private userId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.userId = this.userStore.userId;
    
    this.headerManager.setTitle('🤝 Рефералы');
    this.headerManager.setActions([]);

    this._render();
    this._subscribeToEvents();
    this._subscribeToBalance();

    this.isInitialized = true;
    console.log('✅ ReferralModule v2.0.0 инициализирован (экономика через EventBus)');
  }

  private _subscribeToBalance(): void {
    const unsub = this.eventBus.on('economy:balance:updated', (data) => {
      if (data.userId === this.userId) {
        this._updateBalanceUI(data.newBalance);
      }
    }, this);
    this._subscriptions.push(unsub);
  }

  private _updateBalanceUI(newBalance: number): void {
    const balanceEl = document.getElementById('referral-balance-display');
    if (balanceEl) {
      balanceEl.textContent = String(newBalance);
    }
  }

  private _subscribeToEvents(): void {
    const unsub = this.eventBus.on('referral:added', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub);

    const unsub2 = this.eventBus.on('referral:status_changed', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub2);

    const unsub3 = this.eventBus.on('referral:rewarded', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub3);

    const unsub4 = this.eventBus.on('referral:synced', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub4);
  }

  private _render(): void {
    const stats = this.referralStore.getStats();
    const referrals = this.referralStore.getReferrals();
    const link = this.referralStore.getReferralLink();
    const rewardForNext = this.referralStore.getRewardForReferral();
    const currentBalance = (window as any).economyStore?.getBalance() || 0;

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
        <!-- Баланс -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 16px 20px;
          border: 1px solid var(--app-border-color-light);
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div>
            <div style="font-size: 12px; color: var(--app-text-tertiary);">Ваш баланс</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--app-accent-primary);" id="referral-balance-display">
              ${currentBalance}
            </div>
          </div>
          <div style="font-size: 14px; color: var(--app-text-secondary);">
            🪙 Fibi Coins
          </div>
        </div>

        <!-- Реферальная ссылка -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 20px;
          border: 1px solid var(--app-border-color-light);
          margin-bottom: 16px;
        ">
          <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 8px;">
            🔗 Ваша реферальная ссылка
          </div>
          <div style="
            display: flex;
            gap: 8px;
            background: var(--app-bg-tertiary);
            border-radius: 10px;
            padding: 10px 14px;
            border: 1px solid var(--app-border-color-light);
          ">
            <input type="text" id="referral-link-input" value="${link || ''}" readonly style="
              flex: 1;
              background: transparent;
              border: none;
              outline: none;
              color: var(--app-text-primary);
              font-size: 13px;
              font-family: var(--app-font-family);
            ">
            <button onclick="window.copyReferralLink()" style="
              background: var(--app-accent-primary);
              border: none;
              border-radius: 8px;
              padding: 6px 14px;
              color: var(--app-text-inverse);
              font-weight: 600;
              font-size: 13px;
              cursor: pointer;
            ">
              📋 Копировать
            </button>
          </div>
          <div style="font-size: 11px; color: var(--app-text-tertiary); margin-top: 6px;">
            💰 Приведи друга и получи ${rewardForNext} монет!
          </div>
        </div>

        <!-- Статистика -->
        <div style="
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        ">
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 12px 8px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 20px; font-weight: 700; color: var(--app-accent-primary);">
              ${stats.total}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">Всего</div>
          </div>
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 12px 8px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 20px; font-weight: 700; color: #f39c12;">
              ${stats.pending}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">Ожидают</div>
          </div>
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 12px 8px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 20px; font-weight: 700; color: #27ae60;">
              ${stats.rewarded}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">Награждены</div>
          </div>
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 12px 8px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 20px; font-weight: 700; color: #8e44ad;">
              ${stats.total_reward}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">🪙 Заработано</div>
          </div>
        </div>

        <!-- Текущий уровень -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 12px;
          padding: 14px;
          border: 1px solid var(--app-border-color-light);
          margin-bottom: 16px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-size: 13px; color: var(--app-text-tertiary);">Ваш уровень</span>
              <div style="font-size: 18px; font-weight: 700; color: var(--app-accent-primary);">
                ${this._getTierEmoji(stats.current_tier)} ${this._getTierName(stats.current_tier)}
              </div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 13px; color: var(--app-text-tertiary);">Награда за реферала</span>
              <div style="font-size: 18px; font-weight: 700; color: #f1c40f;">
                +${rewardForNext} 🪙
              </div>
            </div>
          </div>
          ${stats.current_tier !== 'platinum' ? `
            <div style="margin-top: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--app-text-tertiary);">
                <span>Прогресс до следующего уровня</span>
                <span>${stats.next_tier_progress}%</span>
              </div>
              <div style="width: 100%; height: 4px; background: var(--app-bg-tertiary); border-radius: 4px; overflow: hidden; margin-top: 4px;">
                <div style="width: ${stats.next_tier_progress}%; height: 100%; background: var(--app-gradient-primary); border-radius: 4px;"></div>
              </div>
            </div>
          ` : `
            <div style="margin-top: 8px; font-size: 12px; color: var(--app-accent-primary);">
              👑 Максимальный уровень достигнут!
            </div>
          `}
        </div>

        <!-- Ступени -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 12px;
          padding: 14px;
          border: 1px solid var(--app-border-color-light);
          margin-bottom: 16px;
        ">
          <div style="font-size: 13px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 8px;">
            📊 Ступени реферальной системы
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${REFERRAL_TIERS.map(tier => {
              const isActive = stats.current_tier === tier.name;
              const isCompleted = stats.total > tier.to;
              const isNext = stats.total >= tier.from && stats.total <= tier.to;
              const isLocked = stats.total < tier.from;

              return `
                <div style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 6px 10px;
                  background: ${isActive ? 'var(--app-accent-glow)' : isCompleted ? 'rgba(39, 174, 96, 0.08)' : 'var(--app-bg-tertiary)'};
                  border-radius: 8px;
                  border-left: 3px solid ${isActive ? 'var(--app-accent-primary)' : isCompleted ? '#27ae60' : 'var(--app-border-color)'};
                  opacity: ${isLocked ? 0.5 : 1};
                ">
                  <span style="font-size: 13px; color: var(--app-text-primary);">
                    ${this._getTierEmoji(tier.name)} ${this._getTierName(tier.name)}
                    ${isActive ? '👈' : ''}
                    ${isCompleted ? '✅' : ''}
                  </span>
                  <span style="font-size: 12px; color: var(--app-text-tertiary);">
                    ${tier.from === 0 ? '0' : tier.from + 1}–${tier.to === Infinity ? '∞' : tier.to} → +${tier.reward} 🪙
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Список рефералов -->
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
            👥 Ваши рефералы (${stats.total})
          </div>
          <div id="referral-list" style="
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 300px;
            overflow-y: auto;
          ">
            ${this._renderReferrals(referrals)}
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

  private _renderReferrals(referrals: any[]): string {
    if (referrals.length === 0) {
      return `
        <div style="
          text-align: center;
          padding: 30px 0;
          color: var(--app-text-tertiary);
          font-size: 13px;
        ">
          У вас пока нет рефералов<br>
          <span style="font-size: 11px;">Поделитесь ссылкой и приглашайте друзей!</span>
        </div>
      `;
    }

    return referrals.map(r => {
      const statusMap = {
        pending: { label: '⏳ Ожидает', color: '#f39c12' },
        active: { label: '✅ Активен', color: '#27ae60' },
        rewarded: { label: '💰 Награждён', color: '#3498db' },
      };
      const status = statusMap[r.status] || statusMap.pending;
      const date = new Date(r.created_at);
      const dateStr = date.toLocaleDateString();

      return `
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: var(--app-bg-tertiary);
          border-radius: 10px;
        ">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; color: var(--app-text-primary);">
              ${r.referred_username || 'Пользователь'}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">
              ${dateStr} • ${r.reward_amount ? `+${r.reward_amount} 🪙` : ''}
            </div>
          </div>
          <div style="font-size: 12px; font-weight: 600; color: ${status.color};">
            ${status.label}
          </div>
        </div>
      `;
    }).join('');
  }

  private _getTierEmoji(tier: string): string {
    const map = {
      bronze: '🥉',
      silver: '🥈',
      gold: '🥇',
      platinum: '💎',
    };
    return map[tier as keyof typeof map] || '⭐';
  }

  private _getTierName(tier: string): string {
    const map = {
      bronze: 'Бронзовый',
      silver: 'Серебряный',
      gold: 'Золотой',
      platinum: 'Платиновый',
    };
    return map[tier as keyof typeof map] || tier;
  }

  private _updateUI(): void {
    this._render();
  }

  async rewardReferral(referralId: string): Promise<void> {
    const userId = this.userStore.userId;
    if (!userId) {
      this.uiRenderer?.showToast('⚠️ Ошибка авторизации', 'error', 1500);
      return;
    }

    try {
      const referral = this.referralStore.getReferrals().find(r => r.id === referralId);
      if (!referral) {
        this.uiRenderer?.showToast('⚠️ Реферал не найден', 'error', 1500);
        return;
      }

      if (referral.status === 'rewarded') {
        this.uiRenderer?.showToast('⚠️ Реферал уже награждён', 'info', 1500);
        return;
      }

      const rewardedReferrals = this.referralStore.getReferrals()
        .filter(r => r.referrer_id === userId && r.status === 'rewarded');
      const totalRewarded = rewardedReferrals.length;

      let rewardAmount = this.referralStore.getRewardForReferral();

      const totalEarned = this.referralStore.getStats().total_reward;
      if (totalEarned + rewardAmount > REFERRAL_REWARD_LIMIT) {
        const remaining = REFERRAL_REWARD_LIMIT - totalEarned;
        if (remaining <= 0) {
          this.uiRenderer?.showToast('⚠️ Достигнут лимит реферальных наград', 'warning', 2000);
          return;
        }
        rewardAmount = remaining;
      }

      this.eventBus.emit('economy:earn', {
        userId: userId,
        source: 'referral:reward',
        amount: rewardAmount,
        metadata: {
          referral_id: referralId,
          referred_id: referral.referred_id,
          referred_username: referral.referred_username,
          tier: this._getTierName(this.referralStore.getStats().current_tier)
        }
      });

      this.referralStore.updateReferralStatus(referralId, 'rewarded');
      this.referralStore._data.total_reward += rewardAmount;
      this.referralStore.save();

      this.uiRenderer?.showToast(`💰 +${rewardAmount} монет за реферала!`, 'success', 2000);
      
      this._updateUI();

    } catch (err) {
      console.error('❌ Ошибка начисления реферальной награды:', err);
      this.uiRenderer?.showToast('⚠️ Ошибка начисления награды', 'error', 1500);
    }
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle('🤝 Рефералы');
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
        console.warn('Ошибка отписки ReferralModule:', e);
      }
    }
    this._subscriptions = [];
    this.container.innerHTML = '';
    console.log('🗑️ ReferralModule уничтожен');
  }
}

(window as any).copyReferralLink = function(): void {
  const input = document.getElementById('referral-link-input') as HTMLInputElement;
  if (!input || !input.value) {
    console.warn('⚠️ Нет реферальной ссылки');
    return;
  }

  navigator.clipboard.writeText(input.value).then(() => {
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('📋 Ссылка скопирована!', 'success', 1500);
    }
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('📋 Ссылка скопирована!', 'success', 1500);
    }
  });
};

(window as any).ReferralModule = ReferralModule;
console.log('✅ ReferralModule v2.0.0 загружен (экономика через EventBus)');
