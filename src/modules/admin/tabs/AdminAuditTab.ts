// ============================================
// src/modules/admin/tabs/AdminAuditTab.ts
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminAuditTab implements IAdminTab {
  id = 'audit';
  label = 'Аудит';
  icon = '📜';
  priority = 70;

  private logs: any[] = [];
  private total = 0;
  private page = 0;
  private pageSize = 50;
  private loading = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get(`/economy/audit?limit=${this.pageSize}&offset=${this.page * this.pageSize}`);
      if (res.success) {
        this.logs = res.logs || [];
        this.total = res.total || 0;
      }
    } catch (e) {
      console.error('[AdminAuditTab]', e);
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

  nextPage(): void {
    this.page++;
    this.loadData().then(() => (window as any).adminModule.renderCurrentTab());
  }

  prevPage(): void {
    if (this.page > 0) {
      this.page--;
      this.loadData().then(() => (window as any).adminModule.renderCurrentTab());
    }
  }

  render(): string {
    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 8px;color:var(--app-text-primary)">📜 Аудит операций</h3>
        <p style="color:var(--app-text-tertiary);font-size:13px;margin-bottom:16px">Всего: <strong>${this.total}</strong></p>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">Время</th>
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">User</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Тип</th>
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">Источник</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Сумма</th>
              </tr>
            </thead>
            <tbody>
              ${this.logs.length === 0 ? `
                <tr><td colspan="5" style="text-align:center;padding:30px;color:var(--app-text-tertiary)">Нет записей</td></tr>
              ` : this.logs.map(log => `
                <tr style="border-bottom:1px solid var(--app-border-color-light)">
                  <td style="padding:6px 8px;font-size:11px;color:var(--app-text-tertiary)">${new Date(log.created_at).toLocaleString()}</td>
                  <td style="padding:6px 8px">${log.user_id}</td>
                  <td style="text-align:center;padding:6px 8px">
                    <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${
                      log.event_type === 'EARN' ? 'background:rgba(39,174,96,0.15);color:#27ae60' :
                      log.event_type === 'SPEND' ? 'background:rgba(231,76,60,0.15);color:#e74c3c' :
                      'background:rgba(52,152,219,0.15);color:#3498db'
                    }">${log.event_type}</span>
                  </td>
                  <td style="padding:6px 8px;font-size:12px;color:var(--app-text-tertiary)">${log.source || '—'}</td>
                  <td style="text-align:center;padding:6px 8px;font-weight:700;${log.amount > 0 ? 'color:#27ae60' : 'color:#e74c3c'}">
                    ${log.amount > 0 ? '+' : ''}${log.amount}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-secondary" onclick="window.adminModule.prevAuditPage()" style="padding:6px 14px;font-size:12px" ${this.page === 0 ? 'disabled' : ''}>◀ Назад</button>
          <span style="font-size:13px;color:var(--app-text-tertiary)">Стр. ${this.page + 1}</span>
          <button class="btn btn-secondary" onclick="window.adminModule.nextAuditPage()" style="padding:6px 14px;font-size:12px">Вперед ▶</button>
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('audit')" style="padding:6px 14px;font-size:12px;margin-left:auto">🔄</button>
        </div>
      </div>
    `;
  }

  destroy(): void {}
}
