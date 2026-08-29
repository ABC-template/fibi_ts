// ============================================
// src/modules/admin/tabs/AdminQuestsTab.ts
// Управление квестами
// Версия: 1.0.0
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface IQuest {
  id: string;
  external_id: string;
  type: string;
  category: string;
  title: any;
  description: any;
  target: number;
  reward_coins: number;
  cooldown_hours: number | null;
  max_completions: number | null;
  pseudo_hours: number | null;
  is_active: boolean;
  reset_type: string;
  verification_type: string;
  sponsor_name: string | null;
  sponsor_logo: string | null;
  sponsor_target: string | null;
  sponsor_action_required: string | null;
  event_banner: string | null;
  event_color: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class AdminQuestsTab implements IAdminTab {
  id = 'quests';
  label = 'Квесты';
  icon = '🎯';
  priority = 40;

  private quests: IQuest[] = [];
  private loading: boolean = false;
  private filterType: string = 'all';
  private filterActive: string = 'all';

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    if (this.loading && this.quests.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">🎯 Квесты</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">⏳ Загрузка данных...</div>
        </div>
      `;
    }

    const filtered = this.getFilteredQuests();
    const activeCount = this.quests.filter(q => q.is_active).length;
    const byType: Record<string, number> = {};
    this.quests.forEach(q => {
      byType[q.type] = (byType[q.type] || 0) + 1;
    });

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <h3 style="margin: 0; color: var(--app-text-primary);">🎯 Квесты (${this.quests.length})</h3>
          <button class="btn btn-primary" onclick="window.adminModule.openCreateQuestModal()" style="padding: 8px 16px; font-size: 13px;">
            + Создать квест
          </button>
        </div>

        <!-- Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px;">
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: var(--app-text-primary);">${this.quests.length}</div>
            <div style="font-size: 11px; color: var(--app-text-tertiary);">Всего</div>
          </div>
          <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: #27ae60;">${activeCount}</div>
            <div style="font-size: 11px; color: var(--app-text-tertiary);">Активных</div>
          </div>
          ${Object.entries(byType).map(([type, count]) => `
            <div style="background: var(--app-bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: var(--app-text-primary);">${count}</div>
              <div style="font-size: 11px; color: var(--app-text-tertiary);">${type}</div>
            </div>
          `).join('')}
        </div>

        <!-- Filters -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
          <select id="quest-filter-type" onchange="window.adminModule.setQuestFilter('type', this.value)" 
            style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--app-border-color); background: var(--app-bg-primary); color: var(--app-text-primary); font-size: 13px;">
            <option value="all" ${this.filterType === 'all' ? 'selected' : ''}>Все типы</option>
            <option value="daily" ${this.filterType === 'daily' ? 'selected' : ''}>daily</option>
            <option value="sponsor" ${this.filterType === 'sponsor' ? 'selected' : ''}>sponsor</option>
            <option value="achievement" ${this.filterType === 'achievement' ? 'selected' : ''}>achievement</option>
            <option value="event" ${this.filterType === 'event' ? 'selected' : ''}>event</option>
          </select>
          <select id="quest-filter-active" onchange="window.adminModule.setQuestFilter('active', this.value)" 
            style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--app-border-color); background: var(--app-bg-primary); color: var(--app-text-primary); font-size: 13px;">
            <option value="all" ${this.filterActive === 'all' ? 'selected' : ''}>Все статусы</option>
            <option value="active" ${this.filterActive === 'active' ? 'selected' : ''}>Активные</option>
            <option value="inactive" ${this.filterActive === 'inactive' ? 'selected' : ''}>Неактивные</option>
          </select>
        </div>

        <!-- Table -->
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Название</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Тип</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Категория</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Цель</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Награда</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Статус</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">
                    Нет квестов по выбранным фильтрам
                  </td>
                </tr>
              ` : filtered.map(q => {
                const title = typeof q.title === 'object' ? (q.title?.ru || q.title?.en || q.external_id) : (q.title || q.external_id);
                return `
                  <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                    <td style="padding: 8px; font-weight: 500; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${title}">
                      ${title}
                      <div style="font-size: 10px; color: var(--app-text-tertiary);">${q.external_id}</div>
                    </td>
                    <td style="text-align: center; padding: 6px 8px;">
                      <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: rgba(52,152,219,0.15); color: #3498db;">
                        ${q.type}
                      </span>
                    </td>
                    <td style="text-align: center; padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${q.category || '—'}</td>
                    <td style="text-align: center; padding: 6px 8px;">${q.target}</td>
                    <td style="text-align: center; padding: 6px 8px; font-weight: 700; color: #d4af37;">${q.reward_coins} 🪙</td>
                    <td style="text-align: center; padding: 6px 8px;">
                      <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; ${q.is_active ? 'background: rgba(39,174,96,0.15); color: #27ae60;' : 'background: rgba(149,165,166,0.15); color: #95a5a6;'}">
                        ${q.is_active ? 'Активен' : 'Выкл'}
                      </span>
                    </td>
                    <td style="text-align: center; padding: 6px 8px; white-space: nowrap;">
                      <button onclick="window.adminModule.editQuest('${q.id}')" 
                        style="padding: 4px 8px; font-size: 11px; border: none; border-radius: 6px; background: var(--app-bg-tertiary); color: var(--app-text-primary); cursor: pointer; margin: 0 2px;" title="Редактировать">
                        ✏️
                      </button>
                      <button onclick="window.adminModule.toggleQuestActive('${q.id}', ${!q.is_active})" 
                        style="padding: 4px 8px; font-size: 11px; border: none; border-radius: 6px; background: var(--app-bg-tertiary); color: var(--app-text-primary); cursor: pointer; margin: 0 2px;" title="${q.is_active ? 'Выключить' : 'Включить'}">
                        ${q.is_active ? '⏸' : '▶️'}
                      </button>
                      <button onclick="window.adminModule.deleteQuest('${q.id}')" 
                        style="padding: 4px 8px; font-size: 11px; border: none; border-radius: 6px; background: rgba(231,76,60,0.15); color: #e74c3c; cursor: pointer; margin: 0 2px;" title="Удалить">
                        🗑
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('quests')" style="padding: 8px 16px; font-size: 13px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private getFilteredQuests(): IQuest[] {
    return this.quests.filter(q => {
      if (this.filterType !== 'all' && q.type !== this.filterType) return false;
      if (this.filterActive === 'active' && !q.is_active) return false;
      if (this.filterActive === 'inactive' && q.is_active) return false;
      return true;
    });
  }

  setFilter(kind: 'type' | 'active', value: string): void {
    if (kind === 'type') this.filterType = value;
    else this.filterActive = value;
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const response = await apiClient.get('/admin/quests');
      if (response.success) {
        this.quests = response.quests || [];
      }
    } catch (err) {
      console.error('[AdminQuestsTab] Error loading quests:', err);
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
}
