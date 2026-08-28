// ============================================
// src/modules/admin/tabs/AdminLimitsTab.ts
// Управление лимитами по ролям
// Версия: 1.0.1 — исправлена привязка методов
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface ILimit {
  id: string;
  role_key: string;
  role_name: string;
  bonus_tokens_per_day: number;
  permanent_tokens_on_subscribe: number;
  openrouter_limit: number;
  is_active: boolean;
  sort_order: number;
}

export class AdminLimitsTab implements IAdminTab {
  id = 'limits';
  label = 'Лимиты токенов';
  icon = '📊';
  priority = 20;

  private limits: ILimit[] = [];
  private loading: boolean = false;
  private saving: boolean = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
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

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const response = await apiClient.get('/admin/economy/limits');
      if (response.success) {
        this.limits = response.limits || [];
      }
    } catch (err) {
      console.error('[AdminLimitsTab] Error loading limits:', err);
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
