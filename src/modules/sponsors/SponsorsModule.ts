// ============================================
// src/modules/sponsors/SponsorsModule.ts
// Модуль заданий от спонсоров
// Версия: 1.1.0
// ============================================

import { sponsorsStore, type ISponsorTask, type IUserTaskCompletion } from './SponsorsStore';
import { coinsStore } from '@/modules/coins/CoinsStore';
import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';
import type { UUID } from '@types';

export class SponsorsModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private headerManager = headerManager;
  private eventBus = eventBus;
  private sponsorsStore = sponsorsStore;
  private coinsStore = coinsStore;
  private userStore = userStore;
  private uiRenderer = uiRenderer;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.headerManager.setTitle('📋 Задания');
    this.headerManager.setActions([]);

    this._render();
    this._subscribeToEvents();

    this.isInitialized = true;
    console.log('✅ SponsorsModule v1.1.0 инициализирован');
  }

  private _subscribeToEvents(): void {
    const unsub = this.eventBus.on('sponsors:task_added', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub);

    const unsub2 = this.eventBus.on('sponsors:completion_submitted', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub2);

    const unsub3 = this.eventBus.on('sponsors:completion_status_changed', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub3);

    const unsub4 = this.eventBus.on('sponsors:reward_claimed', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub4);

    const unsub5 = this.eventBus.on('coins:added', () => {
      this._updateUI();
    }, this);
    this._subscriptions.push(unsub5);
  }

  private _render(): void {
    const userId = this.userStore.userId || 0;
    const availableTasks = this.sponsorsStore.getAvailableTasks(userId);
    const completions = this.sponsorsStore.getUserCompletions(userId);
    const stats = this.sponsorsStore.getUserStats(userId);
    const isCreator = this.userStore.role === 'creator';

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
            <div style="font-size: 18px; font-weight: 700; color: var(--app-accent-primary);">
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
            <div style="font-size: 18px; font-weight: 700; color: #f39c12;">
              ${stats.pending + stats.submitted}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">В процессе</div>
          </div>
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 12px 8px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 18px; font-weight: 700; color: #27ae60;">
              ${stats.approved}
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">Выполнено</div>
          </div>
          <div style="
            background: var(--app-bg-secondary);
            border-radius: 12px;
            padding: 12px 8px;
            text-align: center;
            border: 1px solid var(--app-border-color-light);
          ">
            <div style="font-size: 18px; font-weight: 700; color: #f1c40f;">
              ${stats.total_reward} 🪙
            </div>
            <div style="font-size: 10px; color: var(--app-text-tertiary);">Заработано</div>
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
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          ">
            <span style="font-size: 14px; font-weight: 600; color: var(--app-text-primary);">
              📋 Доступные задания (${availableTasks.length})
            </span>
            ${isCreator ? `
              <button onclick="window.sponsorsModule.openAdminPanel()" style="
                background: var(--app-accent-primary);
                border: none;
                border-radius: 8px;
                padding: 4px 12px;
                color: var(--app-text-inverse);
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
              ">
                👑 Управление
              </button>
            ` : ''}
          </div>
          <div id="sponsors-tasks-list" style="
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 500px;
            overflow-y: auto;
          ">
            ${this._renderTasks(availableTasks, completions)}
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

  private _renderTasks(tasks: ISponsorTask[], completions: IUserTaskCompletion[]): string {
    if (tasks.length === 0) {
      return `
        <div style="
          text-align: center;
          padding: 40px 0;
          color: var(--app-text-tertiary);
          font-size: 13px;
        ">
          🎉 Пока нет доступных заданий<br>
          <span style="font-size: 11px;">Загляните позже — появятся новые!</span>
        </div>
      `;
    }

    return tasks.map(task => {
      const completion = completions.find(c => c.task_id === task.id);
      const isPending = completion && (completion.status === 'pending' || completion.status === 'submitted');
      const isApproved = completion && completion.status === 'approved' && completion.reward_claimed;
      const isRejected = completion && completion.status === 'rejected';
      const canSubmit = !completion || isRejected;

      let statusBadge = '';
      let statusColor = '';
      let actionButton = '';

      if (isApproved) {
        statusBadge = '✅ Выполнено';
        statusColor = '#27ae60';
        actionButton = `
          <div style="font-size: 12px; color: #27ae60; font-weight: 600;">
            ✅ Награда получена
          </div>
        `;
      } else if (isPending) {
        const expiresAt = completion.expires_at ? new Date(completion.expires_at) : null;
        const timeLeft = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60))) : 0;

        statusBadge = timeLeft > 0 ? `⏳ Проверка (${timeLeft}ч)` : '⏳ Проверка...';
        statusColor = '#f39c12';
        actionButton = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 12px; color: #f39c12; font-weight: 600;">${statusBadge}</span>
            <button onclick="window.sponsorsModule.resubmitTask('${task.id}')" style="
              background: var(--app-bg-tertiary);
              border: 1px solid var(--app-border-color);
              border-radius: 6px;
              padding: 4px 10px;
              color: var(--app-text-primary);
              font-size: 11px;
              cursor: pointer;
            ">
              🔄 Повторить
            </button>
          </div>
        `;
      } else if (isRejected) {
        statusBadge = '❌ Отклонено';
        statusColor = '#e74c3c';
        actionButton = `
          <button onclick="window.sponsorsModule.submitTask('${task.id}')" style="
            background: var(--app-accent-primary);
            border: none;
            border-radius: 6px;
            padding: 6px 14px;
            color: var(--app-text-inverse);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">
            🔄 Попробовать снова
          </button>
        `;
      } else if (canSubmit) {
        actionButton = `
          <button onclick="window.sponsorsModule.submitTask('${task.id}')" style="
            background: var(--app-gradient-primary);
            border: none;
            border-radius: 6px;
            padding: 6px 14px;
            color: var(--app-text-inverse);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          ">
            ✅ Выполнил
          </button>
        `;
      }

      const typeEmoji = {
        subscribe: '📢',
        visit: '🌐',
        action: '⚡',
        survey: '📝',
      }[task.type] || '📋';

      const verificationLabel = {
        auto: '🔍 Авто',
        pseudo: `⏳ ${task.pseudo_hours || 12}ч`,
        manual: '👤 Ручная',
      }[task.verification_type] || '';

      return `
        <div style="
          background: var(--app-bg-tertiary);
          border-radius: 12px;
          padding: 14px;
          border: 1px solid ${isApproved ? 'rgba(39, 174, 96, 0.3)' : isPending ? 'rgba(243, 156, 18, 0.3)' : 'var(--app-border-color-light)'};
          opacity: ${isApproved ? 0.7 : 1};
        ">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 16px;">${typeEmoji}</span>
                <span style="font-size: 14px; font-weight: 600; color: var(--app-text-primary);">
                  ${task.title}
                </span>
              </div>
              <div style="font-size: 12px; color: var(--app-text-tertiary); margin-top: 4px;">
                ${task.description}
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 6px;">
                <span style="font-size: 10px; color: var(--app-text-tertiary); background: var(--app-bg-secondary); padding: 2px 8px; border-radius: 10px;">
                  🏢 ${task.sponsor_name}
                </span>
                <span style="font-size: 10px; color: var(--app-text-tertiary); background: var(--app-bg-secondary); padding: 2px 8px; border-radius: 10px;">
                  ${verificationLabel}
                </span>
                <span style="font-size: 10px; color: #f1c40f; background: rgba(241, 196, 15, 0.1); padding: 2px 8px; border-radius: 10px;">
                  +${task.reward} 🪙
                </span>
              </div>
              <div style="font-size: 11px; color: var(--app-text-tertiary); margin-top: 4px;">
                📌 ${task.action_required}
              </div>
            </div>
            <div style="flex-shrink: 0; margin-left: 12px;">
              ${actionButton || `<div style="font-size: 12px; color: ${statusColor}; font-weight: 600;">${statusBadge}</div>`}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  private _updateUI(): void {
    const listEl = document.getElementById('sponsors-tasks-list');
    const userId = this.userStore.userId || 0;
    const availableTasks = this.sponsorsStore.getAvailableTasks(userId);
    const completions = this.sponsorsStore.getUserCompletions(userId);

    if (listEl) {
      listEl.innerHTML = this._renderTasks(availableTasks, completions);
    }
  }

  async submitTask(taskId: string): Promise<void> {
    const userId = this.userStore.userId;
    if (!userId) {
      this.uiRenderer?.showToast('⚠️ Ошибка авторизации', 'error', 1500);
      return;
    }

    const task = this.sponsorsStore.getTask(taskId as UUID);
    if (!task) {
      this.uiRenderer?.showToast('⚠️ Задание не найдено', 'error', 1500);
      return;
    }

    if (task.verification_type === 'pseudo') {
      const completion = this.sponsorsStore.submitCompletion(taskId as UUID, userId);
      if (completion) {
        this.uiRenderer?.showToast(
          `✅ Заявка отправлена! Проверка займёт ${task.pseudo_hours || 12} часов.`,
          'success',
          2500
        );
        this._updateUI();
      } else {
        this.uiRenderer?.showToast('⚠️ Не удалось отправить заявку', 'error', 1500);
      }
      return;
    }

    if (task.verification_type === 'auto') {
      this.uiRenderer?.showToast('🔍 Проверяем выполнение...', 'info', 1500);
      setTimeout(() => {
        const completion = this.sponsorsStore.submitCompletion(taskId as UUID, userId);
        if (completion) {
          const approved = this.sponsorsStore.updateCompletionStatus(completion.id, 'approved');
          if (approved) {
            this.coinsStore.addCoins(task.reward, `task_${taskId}`, `Задание: ${task.title}`);
            this.sponsorsStore.claimReward(completion.id);
            this.uiRenderer?.showToast(`🎉 +${task.reward} монет за выполнение!`, 'success', 2000);
            this._updateUI();
          }
        }
      }, 1000);
      return;
    }

    const completion = this.sponsorsStore.submitCompletion(taskId as UUID, userId);
    if (completion) {
      this.uiRenderer?.showToast(
        '📤 Заявка отправлена на проверку. Ожидайте подтверждения.',
        'success',
        2000
      );
      this._updateUI();
    }
  }

  resubmitTask(taskId: string): void {
    this.submitTask(taskId);
  }

  openAdminPanel(): void {
    if (this.userStore.role !== 'creator') {
      this.uiRenderer?.showToast('⛔ Доступ только для создателя', 'error', 1500);
      return;
    }

    if ((window as any).moduleLoader) {
      (window as any).moduleLoader.load('admin', { tab: 'sponsors' });
    }
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle('📋 Задания');
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
        console.warn('Ошибка отписки SponsorsModule:', e);
      }
    }
    this._subscriptions = [];
    this.container.innerHTML = '';
    console.log('🗑️ SponsorsModule уничтожен');
  }
}

(window as any).SponsorsModule = SponsorsModule;
(window as any).sponsorsModule = new SponsorsModule(document.createElement('div'));

console.log('✅ SponsorsModule v1.1.0 загружен');
