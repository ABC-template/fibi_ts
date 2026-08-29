// ============================================
// src/modules/admin/tabs/AdminDashboardTab.ts
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminDashboardTab implements IAdminTab {
  id = 'dashboard';
  label = 'Дашборд';
  icon = '📊';
  priority = 10;

  private stats: any = null;
  private loading = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/stats');
      if (res.success) this.stats = res.stats || res;
    } catch (e) {
      console.error('[AdminDashboardTab]', e);
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

  render(): string {
    if (this.loading && !this.stats) {
      return `<div style="padding:40px;text-align:center;color:var(--app-text-tertiary)">⏳ Загрузка...</div>`;
    }

    const s = this.stats || {};

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 16px;color:var(--app-text-primary)">📊 Дашборд</h3>
        
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700">${s.total_users ?? '—'}</div>
            <div style="font-size:12px;color:var(--app-text-tertiary)">Пользователей</div>
          </div>
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#d4af37">${s.total_quests ?? '—'}</div>
            <div style="font-size:12px;color:var(--app-text-tertiary)">Квестов</div>
          </div>
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#27ae60">${s.active_quests ?? '—'}</div>
            <div style="font-size:12px;color:var(--app-text-tertiary)">Активных квестов</div>
          </div>
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700">${s.premium_users ?? '—'}</div>
            <div style="font-size:12px;color:var(--app-text-tertiary)">Premium</div>
          </div>
        </div>

        <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('dashboard')" style="padding:8px 16px;font-size:13px">
          🔄 Обновить
        </button>
      </div>
    `;
  }

  destroy(): void {}
}
