// ============================================
// src/modules/tasks/TasksModule.ts
// Модуль заданий (геймификация)
// Версия: 3.0.1 - FIXED TYPES
// ============================================

import { headerManager } from '@/core/header-manager';
import { tasksStore } from '@/store/TasksStore';
import { eventBus } from '@/core/event-bus';
import { uiRenderer } from '@/modules/ui/renderer';
import type { IDailyQuest, IAchievement } from '@types';

export class TasksModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _isVisible: boolean = false;
  private headerManager = headerManager;
  private tasksStore = tasksStore;
  private eventBus = eventBus;
  private uiRenderer = uiRenderer;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).tasksModule = this;

    this.container.innerHTML = `
      <div style="padding: 16px; flex:1; overflow-y:auto; padding-bottom: 80px;">
        <h2 style="font-size:18px; font-weight:700; margin:0 0 8px 0; color:var(--app-text-primary); display:flex; align-items:center; gap:8px;">
          <i data-lucide="trophy" style="width:24px;height:24px;"></i>
          Задания
        </h2>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
          <div style="background:var(--app-bg-secondary); padding:14px; border-radius:12px; text-align:center; border:1px solid var(--app-border-color-light);">
            <div style="font-size:24px; font-weight:700; color:#f1c40f;" id="tasks-balance">0</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">🪙 Fibi Coins</div>
          </div>
          <div style="background:var(--app-bg-secondary); padding:14px; border-radius:12px; text-align:center; border:1px solid var(--app-border-color-light);">
            <div style="font-size:24px; font-weight:700; color:var(--app-accent-primary);" id="tasks-tokens">0</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">🔑 Токены (запросы)</div>
          </div>
        </div>

        <div id="daily-bonus-container" style="background:var(--app-bg-secondary); padding:14px; border-radius:12px; border:1px solid var(--app-border-color-light); margin-bottom:16px; text-align:center;">
          <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">📆 Ежедневный бонус</div>
          <div style="font-size:12px; color:var(--app-text-tertiary); margin:4px 0 8px 0;">Стрик: <span id="tasks-streak" style="font-weight:700; color:#e74c3c;">0</span> дней</div>
          <button class="btn" id="claim-daily-btn" style="padding:8px 20px; font-size:13px; border-radius:10px;" onclick="window.tasksModule.claimDailyBonus()">🎁 Забрать бонус</button>
        </div>

        <div style="background:var(--app-bg-secondary); padding:14px; border-radius:12px; border:1px solid var(--app-border-color-light); margin-bottom:16px;">
          <div style="font-size:14px; font-weight:600; color:var(--app-text-primary); margin-bottom:10px;">📅 Ежедневные задания</div>
          <div id="daily-quests-list" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>

        <div style="background:var(--app-bg-secondary); padding:14px; border-radius:12px; border:1px solid var(--app-border-color-light); margin-bottom:16px;">
          <div style="font-size:14px; font-weight:600; color:var(--app-text-primary); margin-bottom:10px;">🏆 Достижения</div>
          <div id="achievements-list" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>

        <div style="background:var(--app-bg-secondary); padding:14px; border-radius:12px; border:1px solid var(--app-border-color-light);">
          <div style="font-size:14px; font-weight:600; color:var(--app-text-primary); margin-bottom:10px;">🔄 Обменять валюту</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button class="btn" style="padding:8px 14px; font-size:12px; border-radius:8px; flex:1; min-width:80px;" onclick="window.tasksModule.exchange(10, 1)">10🪙 → 1🔑</button>
            <button class="btn" style="padding:8px 14px; font-size:12px; border-radius:8px; flex:1; min-width:80px;" onclick="window.tasksModule.exchange(50, 5)">50🪙 → 5🔑</button>
            <button class="btn" style="padding:8px 14px; font-size:12px; border-radius:8px; flex:1; min-width:80px;" onclick="window.tasksModule.exchange(100, 10)">100🪙 → 10🔑</button>
          </div>
        </div>
      </div>
    `;

    this.render();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ TasksModule v3.0.1 инициализирован');
  }

  render(): void {
    this.renderBalance();
    this.renderDailyQuests();
    this.renderAchievements();
    this.renderDailyBonus();
  }

  renderBalance(): void {
    const balanceEl = document.getElementById('tasks-balance');
    const tokensEl = document.getElementById('tasks-tokens');
    const streakEl = document.getElementById('tasks-streak');

    if (balanceEl) balanceEl.textContent = String(this.tasksStore.getBalance());
    if (tokensEl) tokensEl.textContent = String(this.tasksStore.getTokens());
    if (streakEl) streakEl.textContent = String(this.tasksStore.streakDays || 0);
  }

  renderDailyBonus(): void {
    const btn = document.getElementById('claim-daily-btn') as HTMLButtonElement;
    if (!btn) return;

    if (this.tasksStore.canClaimDailyBonus()) {
      btn.textContent = '🎁 Забрать бонус';
      btn.disabled = false;
      btn.style.opacity = '1';
    } else {
      btn.textContent = '✅ Бонус получен';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
  }

  renderDailyQuests(): void {
    const list = document.getElementById('daily-quests-list');
    if (!list) return;

    const quests = this.tasksStore.dailyQuests || [];

    if (quests.length === 0) {
      list.innerHTML = `<p style="font-size:12px; color:var(--app-text-tertiary); text-align:center; margin:10px 0;">Нет заданий</p>`;
      return;
    }

    list.innerHTML = '';
    for (const quest of quests) {
      const progress = Math.min(quest.progress / quest.target * 100, 100);
      const isCompleted = quest.completed && quest.claimed;

      const item = document.createElement('div');
      item.style.cssText = `
        background: var(--app-bg-tertiary);
        padding: 10px 12px;
        border-radius: 10px;
        opacity: ${isCompleted ? '0.6' : '1'};
      `;

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:500; color:var(--app-text-primary);">
              ${quest.title}
              ${isCompleted ? ' ✅' : ''}
              ${quest.completed && !quest.claimed ? ' ⬜ Забрать!' : ''}
            </div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">${quest.description}</div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
              <div style="flex:1; height:4px; background:var(--app-bg-secondary); border-radius:2px; overflow:hidden;">
                <div style="width:${progress}%; height:100%; background:var(--app-gradient-primary); border-radius:2px;"></div>
              </div>
              <span style="font-size:10px; color:var(--app-text-tertiary);">${quest.progress}/${quest.target}</span>
            </div>
          </div>
          <div style="font-size:12px; font-weight:600; color:#f1c40f; margin-left:10px;">
            +${quest.reward} 🪙
          </div>
        </div>
        ${quest.completed && !quest.claimed ? `
          <button class="btn" style="padding:4px 12px; font-size:11px; border-radius:6px; margin-top:6px; width:100%;" onclick="window.tasksModule.claimQuest('${quest.id}')">
            Забрать награду
          </button>
        ` : ''}
      `;

      list.appendChild(item);
    }
  }

  renderAchievements(): void {
    const list = document.getElementById('achievements-list');
    if (!list) return;

    const achievements = this.tasksStore.achievements || [];

    if (achievements.length === 0) {
      list.innerHTML = `<p style="font-size:12px; color:var(--app-text-tertiary); text-align:center; margin:10px 0;">Нет достижений</p>`;
      return;
    }

    list.innerHTML = '';
    for (const ach of achievements) {
      const isUnlocked = ach.unlocked && ach.claimed;
      const progress = Math.min(ach.progress / ach.target * 100, 100);

      const item = document.createElement('div');
      item.style.cssText = `
        background: var(--app-bg-tertiary);
        padding: 10px 12px;
        border-radius: 10px;
        opacity: ${isUnlocked ? '0.6' : '1'};
        ${ach.unlocked && !ach.claimed ? 'border: 2px solid #f1c40f;' : ''}
      `;

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:500; color:var(--app-text-primary);">
              ${ach.unlocked ? '🏆' : '⬜'} ${ach.title}
              ${isUnlocked ? ' ✅' : ''}
              ${ach.unlocked && !ach.claimed ? ' ⬜ Забрать!' : ''}
            </div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">${ach.description}</div>
            ${!ach.unlocked ? `
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <div style="flex:1; height:4px; background:var(--app-bg-secondary); border-radius:2px; overflow:hidden;">
                  <div style="width:${progress}%; height:100%; background:var(--app-accent-primary); border-radius:2px;"></div>
                </div>
                <span style="font-size:10px; color:var(--app-text-tertiary);">${ach.progress}/${ach.target}</span>
              </div>
            ` : ''}
          </div>
          <div style="font-size:12px; font-weight:600; color:#f1c40f; margin-left:10px;">
            +${ach.reward} 🪙
          </div>
        </div>
        ${ach.unlocked && !ach.claimed ? `
          <button class="btn" style="padding:4px 12px; font-size:11px; border-radius:6px; margin-top:6px; width:100%;" onclick="window.tasksModule.claimAchievement('${ach.id}')">
            Забрать награду
          </button>
        ` : ''}
      `;

      list.appendChild(item);
    }
  }

  claimQuest(questId: string): void {
    const quest = this.tasksStore.dailyQuests.find(q => q.id === questId);
    if (!quest || !quest.completed || quest.claimed) return;

    this.tasksStore.addBalance(quest.reward, `Задание: ${quest.title}`);
    quest.claimed = true;
    this.tasksStore.save();

    this.render();

    this.uiRenderer.showToast(`🎉 +${quest.reward} монет!`, 'success', 1500);
  }

  claimAchievement(achievementId: string): void {
    const ach = this.tasksStore.achievements.find(a => a.id === achievementId);
    if (!ach || !ach.unlocked || ach.claimed) return;

    ach.claimed = true;
    this.tasksStore.save();

    this.render();

    this.uiRenderer.showToast(`🏆 Достижение получено!`, 'success', 1500);
  }

  claimDailyBonus(): void {
    const bonus = this.tasksStore.claimDailyBonus();
    if (bonus) {
      this.render();
      this.uiRenderer.showToast(`🎁 Ежедневный бонус: +${bonus.bonus} монет!`, 'success', 1500);
    } else {
      this.uiRenderer.showToast('⏳ Бонус уже получен сегодня', 'info', 1500);
    }
  }

  exchange(coins: number, tokens: number): void {
    const result = this.tasksStore.exchangeCoinsForTokens(coins);
    if (result.success) {
      this.render();
      this.uiRenderer.showToast(`🔄 Обмен: +${result.tokens} токенов`, 'success', 1500);
    } else {
      this.uiRenderer.showToast(`❌ ${result.message}`, 'error', 1500);
    }
  }

  // ==========================================
  // УПРАВЛЕНИЕ МОДУЛЕМ
  // ==========================================

  show(): void {
    console.log('📱 TasksModule.show() вызван');

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this._isVisible = true;

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this.render();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);

    console.log('✅ TasksModule показан и обновлён');
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки TasksModule:', e);
      }
    }
    this._subscriptions = [];
    this._isVisible = false;
    console.log('📡 TasksModule отписан от событий');
  }
}

// Экспортируем класс в глобальный объект
(window as any).TasksModule = TasksModule;
console.log('✅ TasksModule v3.0.1 загружен');
