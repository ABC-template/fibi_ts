// ============================================
// src/modules/admin/tabs/AdminUsersTab.ts
// Управление пользователями
// Версия: 1.0.1 — исправлена привязка методов
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface IUser {
  telegram_id: number;
  username: string | null;
  role: string;
  subscription_tier: string | null;
  premium_until: string | null;
  coin_balance: number;
  token_balance_bonus: number;
  token_balance_permanent: number;
  trial_used: boolean;
  created_at: string;
  updated_at: string;
}

export class AdminUsersTab implements IAdminTab {
  id = 'users';
  label = 'Пользователи';
  icon = '👤';
  priority = 80;

  private users: IUser[] = [];
  private loading: boolean = false;
  private searchQuery: string = '';

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    if (this.users.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">👤 Пользователи</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">⏳ Загрузка данных...</div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">👤 Пользователи (${this.users.length})</h3>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">ID</th>
                <th style="text-align: left; padding: 6px 8px; color: var(--app-text-tertiary);">Username</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Роль</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">Подписка</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">🪙</th>
                <th style="text-align: center; padding: 6px 8px; color: var(--app-text-tertiary);">⚡</th>
              </tr>
            </thead>
            <tbody>
              ${this.users.slice(0, 50).map((user: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 6px 8px; font-size: 12px;">${user.telegram_id}</td>
                  <td style="padding: 6px 8px;">${user.username ? '@' + user.username : '—'}</td>
                  <td style="text-align: center; padding: 6px 8px;">
                    <span style="padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; ${user.role === 'premium' ? 'background: rgba(212,175,55,0.15); color: #d4af37;' : user.role === 'admin' ? 'background: rgba(231,76,60,0.15); color: #e74c3c;' : 'background: rgba(149,165,166,0.15); color: #95a5a6;'}">
                      ${user.role}
                    </span>
                  </td>
                  <td style="text-align: center; padding: 6px 8px; font-size: 12px; color: var(--app-text-tertiary);">${user.subscription_tier || '—'}</td>
                  <td style="text-align: center; padding: 6px 8px;">${user.coin_balance}</td>
                  <td style="text-align: center; padding: 6px 8px;">${user.token_balance_bonus + user.token_balance_permanent}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${this.users.length > 50 ? `<div style="text-align: center; padding: 10px; color: var(--app-text-tertiary); font-size: 12px;">Показано 50 из ${this.users.length} пользователей</div>` : ''}

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('users')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  async loadData(query?: string): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const url = query 
        ? `/admin/users?search=${encodeURIComponent(query)}` 
        : '/admin/users';
      const response = await apiClient.get(url);
      if (response.success) {
        this.users = response.users || [];
      }
    } catch (err) {
      console.error('[AdminUsersTab] Error loading users:', err);
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    await this.loadData(this.searchQuery);
  }

  onShow(): void {
    this.loadData();
  }

  destroy(): void {
    // Очистка
  }
}
