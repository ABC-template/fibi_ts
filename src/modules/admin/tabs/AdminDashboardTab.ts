// ============================================
// src/modules/admin/tabs/AdminDashboardTab.ts
// Дашборд админ-панели (статистика)
// Версия: 1.0.1 — исправлена привязка методов
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminDashboardTab implements IAdminTab {
  id = 'dashboard';
  label = 'Дашборд';
  icon = '📊';
  priority = 0;

  private data: any = null;
  private loading: boolean = false;

  async init(): Promise<void> {
    // Данные загружаются при показе
  }

  render(): string {
    const stats = this.data || {
      total_users: 0,
      premium_users: 0,
      trial_users: 0,
      total_coins: 0,
      total_tokens: 0,
      requests_today: 0,
      unique_users_today: 0,
      top_users: [],
    };

    return `
      <div class="admin-dashboard-tab">
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📊 Дашборд</h3>
          <p style="color: var(--app-text-tertiary); margin-bottom: 16px;">Общая статистика системы</p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
            <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: var(--app-accent-primary);">${stats.total_users || 0}</div>
              <div style="font-size: 12px; color: var(--app-text-tertiary);">👥 Пользователей</div>
            </div>
            <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #27ae60;">${stats.premium_users || 0}</div>
              <div style="font-size: 12px; color: var(--app-text-tertiary);">⭐ PRO</div>
            </div>
            <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #f39c12;">${stats.trial_users || 0}</div>
              <div style="font-size: 12px; color: var(--app-text-tertiary);">🔓 Trial</div>
            </div>
            <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #f1c40f;">${stats.total_coins || 0}</div>
              <div style="font-size: 12px; color: var(--app-text-tertiary);">🪙 Монет</div>
            </div>
            <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #3498db;">${stats.total_tokens || 0}</div>
              <div style="font-size: 12px; color: var(--app-text-tertiary);">⚡ Токенов</div>
            </div>
            <div style="background: var(--app-bg-tertiary); padding: 16px; border-radius: 10px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #8e44ad;">${stats.requests_today || 0}</div>
              <div style="font-size: 12px; color: var(--app-text-tertiary);">📨 Запросов</div>
            </div>
          </div>

          <div style="margin-top: 16px; display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="window.adminModule.switchTab('dashboard')" style="padding: 8px 16px; font-size: 13px;">
              🔄 Обновить
            </button>
          </div>
        </div>
      </div>
    `;
  }

  onShow(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const response = await apiClient.get('/admin/stats');
      if (response.success) {
        this.data = response.stats;
      }
    } catch (err) {
      console.error('[AdminDashboardTab] Error loading data:', err);
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
  }

  destroy(): void {
    // Очистка
  }
}
