// ============================================
// src/modules/admin/tabs/AdminUsersTab.ts
// Управление пользователями
// Версия: 1.0.0
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
  label = '👤 Пользователи';
  icon = '👤';
  priority = 80;

  private users: IUser[] = [];
  private loading: boolean = false;
  private searchQuery: string = '';

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    return `
      <div class="admin-users-tab">
        <div class="admin-section">
          <h3>👤 Управление пользователями</h3>
          <p class="hint">Поиск и управление пользователями системы.</p>

          <div class="user-search">
            <input 
              type="text" 
              id="user-search-input" 
              placeholder="🔍 Поиск по ID или username..."
              value="${this.searchQuery}"
              oninput="AdminUsersTab.search(this.value)"
            />
          </div>

          <div class="users-table-wrapper">
            <table class="users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Роль</th>
                  <th>Подписка</th>
                  <th>🪙</th>
                  <th>⚡ (бонус)</th>
                  <th>⚡ (пост)</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                ${this.users.map(user => `
                  <tr>
                    <td>${user.telegram_id}</td>
                    <td>${user.username ? '@' + user.username : '—'}</td>
                    <td><span class="role-badge ${user.role}">${user.role}</span></td>
                    <td>${user.subscription_tier || '—'}</td>
                    <td>${user.coin_balance}</td>
                    <td>${user.token_balance_bonus}</td>
                    <td>${user.token_balance_permanent}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="AdminUsersTab.editUser('${user.telegram_id}')">
                        ✏️
                      </button>
                      <button class="btn btn-sm btn-secondary" onclick="AdminUsersTab.viewUser('${user.telegram_id}')">
                        👁️
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          ${this.users.length === 0 ? `<div class="empty-state">👤 Пользователи не найдены</div>` : ''}

          <div class="admin-actions">
            <button class="btn btn-secondary" onclick="AdminUsersTab.refresh()">
              🔄 Обновить
            </button>
          </div>
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

  static async search(query: string): Promise<void> {
    const tab = adminRegistry.getInstance('users') as AdminUsersTab;
    if (!tab) return;
    tab.searchQuery = query;
    await tab.loadData(query);
    const container = document.querySelector('.admin-users-tab');
    if (container) {
      container.outerHTML = tab.render();
    }
  }

  static async editUser(userId: string): Promise<void> {
    // TODO: Открыть модалку редактирования пользователя
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('✏️ Редактирование пользователя', 'info', 1500);
    }
  }

  static async viewUser(userId: string): Promise<void> {
    // Переключаемся на аудит с фильтром по пользователю
    const auditTab = adminRegistry.getInstance('audit');
    if (auditTab) {
      // TODO: Применить фильтр и переключиться на вкладку аудита
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast(`👤 Пользователь ${userId}`, 'info', 1500);
      }
    }
  }

  async refresh(): Promise<void> {
    await this.loadData(this.searchQuery);
    const container = document.querySelector('.admin-users-tab');
    if (container) {
      container.outerHTML = this.render();
    }
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('🔄 Данные обновлены', 'info', 1500);
    }
  }

  onShow(): void {
    this.refresh();
  }

  destroy(): void {
    // Очистка
  }
}

// Статические методы для вызова из HTML
(AdminUsersTab as any).search = AdminUsersTab.search;
(AdminUsersTab as any).editUser = AdminUsersTab.editUser;
(AdminUsersTab as any).viewUser = AdminUsersTab.viewUser;
(AdminUsersTab as any).refresh = () => {
  const tab = adminRegistry.getInstance('users') as AdminUsersTab;
  if (tab) tab.refresh();
};

// Регистрируем вкладку
import { adminRegistry } from '../core/admin-registry';
adminRegistry.register('users', AdminUsersTab);
