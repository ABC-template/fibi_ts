// ============================================
// src/modules/admin/tabs/AdminQuestsTab.ts
// Вкладка "Квесты" в админ-панели
// Версия: 1.0.0 - портировано из старой версии
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';
import { uiRenderer } from '@/modules/ui/renderer';
import { modalManager } from '@/core/modal-manager';
import type { UUID } from '@types';

interface IQuest {
  id: UUID;
  external_id: string;
  type: 'daily' | 'sponsor' | 'event';
  category: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  target: number;
  reward_coins: number;
  reset_type: 'never' | 'daily' | 'weekly';
  cooldown_hours: number;
  max_completions: number | null;
  verification_type: 'auto' | 'pseudo' | 'manual';
  pseudo_hours: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
  sponsor_name: string | null;
  sponsor_logo: string | null;
  sponsor_target: string | null;
  sponsor_action_required: string | null;
  event_banner: string | null;
  event_color: string | null;
  created_at: string;
  updated_at: string;
  completions_count?: number;
}

export class AdminQuestsTab implements IAdminTab {
  id = 'quests';
  label = 'Квесты';
  icon = '📋';
  priority = 10;

  private quests: IQuest[] = [];
  private loading: boolean = false;
  private saving: boolean = false;
  private editingQuestId: UUID | null = null;
  private uiRenderer = uiRenderer;
  private modalManager = modalManager;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    if (this.loading) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">
            ⏳ Загрузка квестов...
          </div>
        </div>
      `;
    }

    const daily = this.quests.filter(q => q.type === 'daily');
    const sponsor = this.quests.filter(q => q.type === 'sponsor');
    const event = this.quests.filter(q => q.type === 'event');

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <button onclick="window.adminModule.showCreateQuestForm()" style="
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: 2px dashed var(--app-accent-primary);
          background: transparent;
          color: var(--app-accent-primary);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: var(--app-font-family);
        ">
          ➕ Создать новый квест
        </button>

        <div id="admin-quest-form" style="display: none; background: var(--app-bg-secondary); padding: 16px; border-radius: 12px; border: 1px solid var(--app-border-color-light);">
          ${this._renderQuestForm()}
        </div>

        ${this._renderQuestGroup('📅 Ежедневные', daily)}
        ${this._renderQuestGroup('🤝 Спонсорские', sponsor)}
        ${this._renderQuestGroup('🎪 Ивентовые', event)}
      </div>
    `;
  }

  private _renderQuestGroup(title: string, quests: IQuest[]): string {
    if (quests.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
          <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 8px;">${title}</div>
          <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary); font-size: 13px;">
            Нет квестов этого типа
          </div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 16px; border: 1px solid var(--app-border-color-light);">
        <div style="font-size: 14px; font-weight: 600; color: var(--app-text-primary); margin-bottom: 12px;">
          ${title} (${quests.length})
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto;">
          ${quests.map(q => this._renderQuestCard(q)).join('')}
        </div>
      </div>
    `;
  }

  private _renderQuestCard(quest: IQuest): string {
    const title = quest.title?.ru || quest.title?.en || 'Без названия';
    const typeColors: Record<string, string> = {
      daily: '#f1c40f',
      sponsor: '#8e44ad',
      event: '#e74c3c',
    };
    const color = typeColors[quest.type] || '#3498db';

    const statusLabel = quest.is_active ? '🟢 Активен' : '🔴 Неактивен';
    const statusColor = quest.is_active ? '#27ae60' : '#e74c3c';

    return `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        background: var(--app-bg-tertiary);
        border-radius: 10px;
        border-left: 4px solid ${color};
        gap: 10px;
      ">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-weight: 600; font-size: 14px; color: var(--app-text-primary);">
              ${title}
            </span>
            <span style="font-size: 10px; background: ${color}22; color: ${color}; padding: 2px 8px; border-radius: 10px; font-weight: 600;">
              ${quest.type}
            </span>
            <span style="font-size: 10px; color: ${statusColor}; padding: 2px 8px; border-radius: 10px; font-weight: 600;">
              ${statusLabel}
            </span>
            ${quest.completions_count !== undefined ? `
              <span style="font-size: 10px; color: var(--app-text-tertiary); padding: 2px 8px; border-radius: 10px; background: var(--app-bg-secondary);">
                ✅ ${quest.completions_count} выполнений
              </span>
            ` : ''}
          </div>
          <div style="font-size: 12px; color: var(--app-text-tertiary); margin-top: 2px;">
            ${quest.external_id} • +${quest.reward_coins} 🪙 • ${quest.target} цель
            ${quest.expires_at ? ` • до ${new Date(quest.expires_at).toLocaleDateString()}` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0;">
          <button onclick="window.adminModule.editQuest('${quest.id}')" style="
            background: var(--app-bg-secondary);
            border: 1px solid var(--app-border-color);
            border-radius: 6px;
            padding: 4px 10px;
            color: var(--app-text-primary);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: var(--app-font-family);
          ">
            ✏️
          </button>
          <button onclick="window.adminModule.toggleQuestStatus('${quest.id}')" style="
            background: ${quest.is_active ? 'rgba(231, 76, 60, 0.1)' : 'rgba(39, 174, 96, 0.1)'};
            border: 1px solid ${quest.is_active ? 'rgba(231, 76, 60, 0.2)' : 'rgba(39, 174, 96, 0.2)'};
            border-radius: 6px;
            padding: 4px 10px;
            color: ${quest.is_active ? '#e74c3c' : '#27ae60'};
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: var(--app-font-family);
          ">
            ${quest.is_active ? '⏸️' : '▶️'}
          </button>
          <button onclick="window.adminModule.deleteQuest('${quest.id}')" style="
            background: rgba(231, 76, 60, 0.1);
            border: 1px solid rgba(231, 76, 60, 0.2);
            border-radius: 6px;
            padding: 4px 10px;
            color: #e74c3c;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: var(--app-font-family);
          ">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  private _renderQuestForm(quest?: IQuest): string {
    const isEdit = !!quest;
    const q = quest || {} as IQuest;

    return `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Название *</label>
            <input id="admin-quest-title" value="${q.title?.ru || ''}" placeholder="Название квеста" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Тип *</label>
            <select id="admin-quest-type" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            " onchange="window.adminModule.toggleQuestFields(this.value)">
              <option value="daily" ${q.type === 'daily' ? 'selected' : ''}>📅 Ежедневный</option>
              <option value="sponsor" ${q.type === 'sponsor' ? 'selected' : ''}>🤝 Спонсорский</option>
              <option value="event" ${q.type === 'event' ? 'selected' : ''}>🎪 Ивентовый</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Описание</label>
          <textarea id="admin-quest-description" rows="2" placeholder="Описание квеста" style="
            width: 100%;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
            resize: vertical;
            font-family: var(--app-font-family);
          ">${q.description?.ru || ''}</textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Награда 🪙</label>
            <input id="admin-quest-reward" type="number" value="${q.reward_coins || 0}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Цель</label>
            <input id="admin-quest-target" type="number" value="${q.target || 1}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Сброс</label>
            <select id="admin-quest-reset" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
              <option value="never" ${q.reset_type === 'never' ? 'selected' : ''}>Никогда</option>
              <option value="daily" ${q.reset_type === 'daily' ? 'selected' : ''}>Ежедневно</option>
              <option value="weekly" ${q.reset_type === 'weekly' ? 'selected' : ''}>Еженедельно</option>
            </select>
          </div>
        </div>

        <!-- Спонсорские поля -->
        <div id="admin-sponsor-fields" style="display: ${q.type === 'sponsor' ? 'block' : 'none'};">
          <div style="border-top: 1px solid var(--app-border-color-light); padding-top: 10px; margin-top: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--app-text-secondary); margin-bottom: 8px;">🤝 Партнёрские данные</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Название партнёра</label>
                <input id="admin-quest-sponsor" value="${q.sponsor_name || ''}" placeholder="Имя партнёра" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                  font-family: var(--app-font-family);
                ">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Ссылка/Цель</label>
                <input id="admin-quest-target-url" value="${q.sponsor_target || ''}" placeholder="https://..." style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                  font-family: var(--app-font-family);
                ">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Тип действия</label>
                <select id="admin-quest-action" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                  font-family: var(--app-font-family);
                ">
                  <option value="subscribe" ${q.sponsor_action_required === 'subscribe' ? 'selected' : ''}>📢 Подписка</option>
                  <option value="visit" ${q.sponsor_action_required === 'visit' ? 'selected' : ''}>🌐 Переход</option>
                  <option value="action" ${q.sponsor_action_required === 'action' ? 'selected' : ''}>⚡ Действие</option>
                  <option value="survey" ${q.sponsor_action_required === 'survey' ? 'selected' : ''}>📝 Опрос</option>
                </select>
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Верификация</label>
                <select id="admin-quest-verification" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                  font-family: var(--app-font-family);
                ">
                  <option value="auto" ${q.verification_type === 'auto' ? 'selected' : ''}>⚡ Авто</option>
                  <option value="pseudo" ${q.verification_type === 'pseudo' ? 'selected' : ''}>⏳ Псевдо (${q.pseudo_hours || 12}ч)</option>
                  <option value="manual" ${q.verification_type === 'manual' ? 'selected' : ''}>👤 Ручная</option>
                </select>
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Часов проверки</label>
                <input id="admin-quest-pseudo-hours" type="number" value="${q.pseudo_hours || 12}" style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                  font-family: var(--app-font-family);
                ">
              </div>
            </div>
          </div>
        </div>

        <!-- Ивентовые поля -->
        <div id="admin-event-fields" style="display: ${q.type === 'event' ? 'block' : 'none'};">
          <div style="border-top: 1px solid var(--app-border-color-light); padding-top: 10px; margin-top: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--app-text-secondary); margin-bottom: 8px;">🎪 Ивентовые данные</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Баннер (URL)</label>
                <input id="admin-quest-banner" value="${q.event_banner || ''}" placeholder="https://..." style="
                  width: 100%;
                  padding: 10px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  color: var(--app-text-primary);
                  font-size: 13px;
                  outline: none;
                  font-family: var(--app-font-family);
                ">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Цвет ивента</label>
                <input id="admin-quest-color" type="color" value="${q.event_color || '#e74c3c'}" style="
                  width: 100%;
                  padding: 4px;
                  border-radius: 8px;
                  border: 1px solid var(--app-border-color);
                  background: var(--app-bg-tertiary);
                  outline: none;
                  height: 40px;
                  cursor: pointer;
                ">
              </div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Начало</label>
            <input id="admin-quest-starts" type="datetime-local" value="${q.starts_at ? new Date(q.starts_at).toISOString().slice(0, 16) : ''}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Окончание</label>
            <input id="admin-quest-expires" type="datetime-local" value="${q.expires_at ? new Date(q.expires_at).toISOString().slice(0, 16) : ''}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Макс. выполнений</label>
            <input id="admin-quest-max-completions" type="number" value="${q.max_completions || ''}" placeholder="Безлимит" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--app-text-tertiary); display: block; margin-bottom: 2px;">Кулдаун (часы)</label>
            <input id="admin-quest-cooldown" type="number" value="${q.cooldown_hours || 0}" style="
              width: 100%;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 13px;
              outline: none;
              font-family: var(--app-font-family);
            ">
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button onclick="window.adminModule.saveQuest('${q.id || ''}')" style="
            flex: 1;
            padding: 12px;
            border-radius: 8px;
            border: none;
            background: var(--app-gradient-primary);
            color: var(--app-text-inverse);
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            font-family: var(--app-font-family);
          ">
            💾 ${isEdit ? 'Обновить' : 'Создать'}
          </button>
          <button onclick="document.getElementById('admin-quest-form').style.display='none'" style="
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid var(--app-border-color);
            background: transparent;
            color: var(--app-text-secondary);
            cursor: pointer;
            font-family: var(--app-font-family);
          ">
            ✕ Отмена
          </button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // ПУБЛИЧНЫЕ МЕТОДЫ (вызываются из window.adminModule)
  // ==========================================

  showCreateQuestForm(): void {
    const form = document.getElementById('admin-quest-form');
    if (!form) return;

    this.editingQuestId = null;

    const isVisible = form.style.display !== 'none';
    form.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      this._resetQuestForm();
      this.toggleQuestFields('daily');

      const saveBtn = form.querySelector('button[onclick*="saveQuest"]') as HTMLButtonElement;
      if (saveBtn) {
        saveBtn.textContent = '💾 Создать';
        saveBtn.setAttribute('onclick', `window.adminModule.saveQuest('')`);
      }
    }

    form.scrollIntoView({ behavior: 'smooth' });
  }

  async editQuest(questId: UUID): Promise<void> {
    console.log(`✏️ Редактируем квест ${questId}`);

    await this.loadData();

    const quest = this.quests.find(q => q.id === questId);
    if (!quest) {
      this.uiRenderer?.showToast('⚠️ Квест не найден. Обновите страницу.', 'error', 1500);
      return;
    }

    this.editingQuestId = questId;

    const form = document.getElementById('admin-quest-form');
    if (!form) return;

    (document.getElementById('admin-quest-title') as HTMLInputElement).value = quest.title?.ru || '';
    (document.getElementById('admin-quest-description') as HTMLTextAreaElement).value = quest.description?.ru || '';
    (document.getElementById('admin-quest-type') as HTMLSelectElement).value = quest.type;
    (document.getElementById('admin-quest-reward') as HTMLInputElement).value = String(quest.reward_coins);
    (document.getElementById('admin-quest-target') as HTMLInputElement).value = String(quest.target);
    (document.getElementById('admin-quest-reset') as HTMLSelectElement).value = quest.reset_type;
    (document.getElementById('admin-quest-sponsor') as HTMLInputElement).value = quest.sponsor_name || '';
    (document.getElementById('admin-quest-target-url') as HTMLInputElement).value = quest.sponsor_target || '';
    (document.getElementById('admin-quest-action') as HTMLSelectElement).value = quest.sponsor_action_required || 'subscribe';
    (document.getElementById('admin-quest-verification') as HTMLSelectElement).value = quest.verification_type;
    (document.getElementById('admin-quest-pseudo-hours') as HTMLInputElement).value = String(quest.pseudo_hours || 12);
    (document.getElementById('admin-quest-max-completions') as HTMLInputElement).value = quest.max_completions ? String(quest.max_completions) : '';
    (document.getElementById('admin-quest-cooldown') as HTMLInputElement).value = String(quest.cooldown_hours || 0);
    (document.getElementById('admin-quest-banner') as HTMLInputElement).value = quest.event_banner || '';
    (document.getElementById('admin-quest-color') as HTMLInputElement).value = quest.event_color || '#e74c3c';

    if (quest.starts_at) {
      (document.getElementById('admin-quest-starts') as HTMLInputElement).value = 
        new Date(quest.starts_at).toISOString().slice(0, 16);
    }
    if (quest.expires_at) {
      (document.getElementById('admin-quest-expires') as HTMLInputElement).value = 
        new Date(quest.expires_at).toISOString().slice(0, 16);
    }

    this.toggleQuestFields(quest.type);

    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth' });

    const saveBtn = form.querySelector('button[onclick*="saveQuest"]') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.textContent = '💾 Обновить';
      saveBtn.setAttribute('onclick', `window.adminModule.saveQuest('${questId}')`);
    }
  }

  toggleQuestFields(type: string): void {
    const sponsorFields = document.getElementById('admin-sponsor-fields');
    const eventFields = document.getElementById('admin-event-fields');
    
    if (sponsorFields) {
      sponsorFields.style.display = type === 'sponsor' ? 'block' : 'none';
    }
    if (eventFields) {
      eventFields.style.display = type === 'event' ? 'block' : 'none';
    }
  }

  async saveQuest(questId: string): Promise<void> {
    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
    const getNum = (id: string) => parseInt((document.getElementById(id) as HTMLInputElement)?.value || '0', 10) || 0;

    const isEditing = questId && questId.length > 0;
    console.log(`💾 Сохраняем квест: ${isEditing ? 'редактирование' : 'создание'}`, { questId });

    const type = getVal('admin-quest-type') as 'daily' | 'sponsor' | 'event';

    // Для редактирования — получаем текущий статус из формы
    let isActive = true;
    if (isEditing) {
      const quest = this.quests.find(q => q.id === questId);
      if (quest) {
        isActive = quest.is_active;
      }
    }

    const data = {
      title: { ru: getVal('admin-quest-title'), en: getVal('admin-quest-title') },
      description: { ru: getVal('admin-quest-description'), en: getVal('admin-quest-description') },
      type: type,
      category: type,
      reward_coins: getNum('admin-quest-reward'),
      target: getNum('admin-quest-target'),
      reset_type: getVal('admin-quest-reset') as 'never' | 'daily' | 'weekly',
      cooldown_hours: getNum('admin-quest-cooldown'),
      max_completions: parseInt(getVal('admin-quest-max-completions')) || null,
      verification_type: getVal('admin-quest-verification') as 'auto' | 'pseudo' | 'manual',
      pseudo_hours: getNum('admin-quest-pseudo-hours'),
      starts_at: getVal('admin-quest-starts') || new Date().toISOString(),
      expires_at: getVal('admin-quest-expires') || null,
      sponsor_name: getVal('admin-quest-sponsor') || null,
      sponsor_target: getVal('admin-quest-target-url') || null,
      sponsor_action_required: getVal('admin-quest-action') || null,
      event_banner: getVal('admin-quest-banner') || null,
      event_color: getVal('admin-quest-color') || null,
      is_active: isActive,
    };

    try {
      const endpoint = isEditing ? `/api/admin/quests/${questId}` : '/api/admin/quests';
      const method = isEditing ? 'PUT' : 'POST';

      console.log(`📤 ${method} ${endpoint}`, data);

      // Используем apiClient
      let result;
      if (method === 'POST') {
        result = await apiClient.post(endpoint, data);
      } else {
        result = await apiClient.put(endpoint, data);
      }

      if (result.success) {
        this.uiRenderer?.showToast(
          isEditing ? '✅ Квест обновлён' : '✅ Квест создан',
          'success',
          1500
        );
        document.getElementById('admin-quest-form')!.style.display = 'none';
        await this.loadData();
      } else {
        // Пробуем PATCH если PUT не сработал
        if (isEditing) {
          console.warn('⚠️ PUT вернул ошибку, пробуем PATCH...');
          const patchResult = await apiClient.patch(endpoint, data);
          if (patchResult.success) {
            this.uiRenderer?.showToast('✅ Квест обновлён (через PATCH)', 'success', 1500);
            document.getElementById('admin-quest-form')!.style.display = 'none';
            await this.loadData();
            return;
          }
        }
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка сохранения квеста:', err);
      this.uiRenderer?.showToast(`⚠️ ${(err as Error).message}`, 'error', 1500);
    }
  }

  async toggleQuestStatus(questId: UUID): Promise<void> {
    console.log(`⏸️ Переключаем статус квеста ${questId}`);

    await this.loadData();

    const quest = this.quests.find(q => q.id === questId);
    if (!quest) {
      this.uiRenderer?.showToast('⚠️ Квест не найден', 'error', 1500);
      return;
    }

    try {
      const endpoint = `/api/admin/quests/${questId}`;
      const result = await apiClient.patch(endpoint, { is_active: !quest.is_active });

      if (result.success) {
        this.uiRenderer?.showToast(
          quest.is_active ? '⏸️ Квест приостановлен' : '▶️ Квест активирован',
          'info',
          1500
        );
        await this.loadData();
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка изменения статуса:', err);
      this.uiRenderer?.showToast(`⚠️ ${(err as Error).message}`, 'error', 1500);
    }
  }

  async deleteQuest(questId: UUID): Promise<void> {
    if (!confirm('Удалить этот квест навсегда? Все данные прогресса будут потеряны!')) return;

    console.log(`🗑️ Удаляем квест ${questId}`);

    try {
      const result = await apiClient.delete(`/api/admin/quests/${questId}`);

      if (result.success) {
        this.uiRenderer?.showToast('🗑️ Квест удалён', 'info', 1500);
        await this.loadData();
      } else {
        this.uiRenderer?.showToast(`⚠️ ${result.error || 'Ошибка'}`, 'error', 1500);
      }
    } catch (err) {
      console.error('❌ Ошибка удаления квеста:', err);
      this.uiRenderer?.showToast(`⚠️ ${(err as Error).message}`, 'error', 1500);
    }
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const result = await apiClient.get('/admin/quests');
      if (result.success) {
        this.quests = result.quests || [];
        console.log(`📋 Загружено ${this.quests.length} квестов`);
      }
    } catch (err) {
      console.error('❌ Ошибка загрузки квестов:', err);
      this.quests = [];
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
  }

  onShow(): void {
    this.loadData();
  }

  destroy(): void {
    // Очистка
  }

  // ==========================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================

  private _resetQuestForm(): void {
    (document.getElementById('admin-quest-title') as HTMLInputElement).value = '';
    (document.getElementById('admin-quest-description') as HTMLTextAreaElement).value = '';
    (document.getElementById('admin-quest-reward') as HTMLInputElement).value = '0';
    (document.getElementById('admin-quest-target') as HTMLInputElement).value = '1';
    (document.getElementById('admin-quest-type') as HTMLSelectElement).value = 'daily';
    (document.getElementById('admin-quest-reset') as HTMLSelectElement).value = 'never';
    (document.getElementById('admin-quest-sponsor') as HTMLInputElement).value = '';
    (document.getElementById('admin-quest-target-url') as HTMLInputElement).value = '';
    (document.getElementById('admin-quest-action') as HTMLSelectElement).value = 'subscribe';
    (document.getElementById('admin-quest-verification') as HTMLSelectElement).value = 'auto';
    (document.getElementById('admin-quest-pseudo-hours') as HTMLInputElement).value = '12';
    (document.getElementById('admin-quest-max-completions') as HTMLInputElement).value = '';
    (document.getElementById('admin-quest-cooldown') as HTMLInputElement).value = '0';
    (document.getElementById('admin-quest-banner') as HTMLInputElement).value = '';
    (document.getElementById('admin-quest-color') as HTMLInputElement).value = '#e74c3c';

    const now = new Date();
    const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    (document.getElementById('admin-quest-starts') as HTMLInputElement).value = 
      startDate.toISOString().slice(0, 16);

    const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    (document.getElementById('admin-quest-expires') as HTMLInputElement).value = 
      expiresDate.toISOString().slice(0, 16);
  }
}
