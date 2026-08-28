// ============================================
// src/modules/admin/tabs/AdminAuditTab.ts
// Аудит экономических операций
// Версия: 1.0.1 — исправлена привязка методов
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface IAuditLog {
  id: string;
  user_id: number;
  username?: string;
  event_type: string;
  source: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  metadata: any;
  currency: string;
  created_at: string;
}

export class AdminAuditTab implements IAdminTab {
  id = 'audit';
  label = 'Аудит';
  icon = '📜';
  priority = 70;

  private logs: IAuditLog[] = [];
  private total: number = 0;
  private loading: boolean = false;
  private page: number = 0;
  private pageSize: number = 50;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    if (this.logs.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📜 Аудит</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">📭 Нет операций</div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📜 Аудит экономических операций</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Всего операций: <strong>${this.total}</strong>
        </p>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Время</th>
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Пользователь</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Тип</th>
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Источник</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Сумма</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Баланс</th>
              </tr>
            </thead>
            <tbody>
              ${this.logs.map((log: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 6px 8px; font-size: 11px; color: var(--app-text-tertiary);">${new Date(log.created_at).toLocaleString()}</td>
                  <td style="padding: 6px 8px; font-weight: 500;">${log.user_id}</td>
                  <td style="text-align: center; padding: 6px 8px;">
                    <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; ${log.event_type === 'EARN' ? 'background: rgba(39,174,96,0.15); color: #27ae60;' : log.event_type === 'SPEND' ? 'background: rgba(231,76,60,0.15); color: #e74c3c;' : 'background: rgba(52,152,219,0.15); color: #3498db;'}">
                      ${log.event_type}
                    </span>
                  </td>
                  <td style="padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${log.source || '—'}</td>
                  <td style="text-align: center; padding: 6px 8px; font-weight: 700; ${log.amount > 0 ? 'color: #27ae60;' : 'color: #e74c3c;'}">
                    ${log.amount > 0 ? '+' : ''}${log.amount}
                  </td>
                  <td style="text-align: center; padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${log.balance_before} → ${log.balance_after}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="window.adminModule.prevAuditPage()" style="padding: 6px 14px; font-size: 12px;" ${this.page === 0 ? 'disabled' : ''}>
              ◀ Назад
            </button>
            <span style="font-size: 13px; color: var(--app-text-tertiary); display: flex; align-items: center;">
              Страница ${this.page + 1}
            </span>
            <button class="btn btn-secondary" onclick="window.adminModule.nextAuditPage()" style="padding: 6px 14px; font-size: 12px;" ${this.logs.length < this.pageSize ? 'disabled' : ''}>
              Вперед ▶
            </button>
          </div>
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('audit')" style="padding: 6px 14px; font-size: 12px;">
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
      const url = `/economy/audit?limit=${this.pageSize}&offset=${this.page * this.pageSize}`;
      const response = await apiClient.get(url);
      if (response.success) {
        this.logs = response.logs || [];
        this.total = response.total || 0;
      }
    } catch (err) {
      console.error('[AdminAuditTab] Error loading audit:', err);
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
