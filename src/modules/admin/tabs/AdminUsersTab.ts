// ============================================
// src/modules/admin/tabs/AdminUsersTab.ts
// Пользователи + смена ролей
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminUsersTab implements IAdminTab {
  id = 'users';
  label = 'Пользователи';
  icon = '👤';
  priority = 60;

  private users: any[] = [];
  private loading = false;
  private search = '';

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(query?: string): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const url = query ? `/admin/users?search=${encodeURIComponent(query)}` : '/admin/users';
      const res = await apiClient.get(url);
      if (res.success) this.users = res.users || [];
    } catch (e) {
      console.error('[AdminUsersTab]', e);
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    await this.loadData(this.search);
  }

  onShow(): void {
    this.loadData();
  }

  render(): string {
    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 16px;color:var(--app-text-primary)">👤 Пользователи (${this.users.length})</h3>

        <div style="margin-bottom:16px">
          <input type="text" id="users-search" placeholder="Поиск по ID или username..." 
            value="${this.search}"
            style="width:100%;max-width:320px;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:13px"
            onkeydown="if(event.key==='Enter') window.adminModule.searchUsers(this.value)">
        </div>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">ID</th>
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">Username</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Роль</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">🪙</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Токены</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${this.users.length === 0 ? `
                <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--app-text-tertiary)">Нет пользователей</td></tr>
              ` : this.users.slice(0, 100).map(u => `
                <tr style="border-bottom:1px solid var(--app-border-color-light)">
                  <td style="padding:6px 8px">${u.telegram_id}</td>
                  <td style="padding:6px 8px">${u.username ? '@' + u.username : '—'}</td>
                  <td style="text-align:center;padding:6px 8px">
                    <select data-user="${u.telegram_id}" onchange="window.adminModule.changeRole(${u.telegram_id}, this.value)"
                      style="padding:4px 8px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:12px">
                      <option value="trial" ${u.role === 'trial' ? 'selected' : ''}>trial</option>
                      <option value="premium" ${u.role === 'premium' ? 'selected' : ''}>premium</option>
                      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                      <option value="creator" ${u.role === 'creator' ? 'selected' : ''}>creator</option>
                    </select>
                  </td>
                  <td style="text-align:center;padding:6px 8px">${u.coin_balance ?? 0}</td>
                  <td style="text-align:center;padding:6px 8px">${(u.token_balance_bonus ?? 0) + (u.token_balance_permanent ?? 0)}</td>
                  <td style="text-align:center;padding:6px 8px">
                    <button onclick="window.adminModule.addCoinsToUser(${u.telegram_id})" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px" title="Добавить монеты">🪙</button>
                    <button onclick="window.adminModule.addTokensToUser(${u.telegram_id})" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px" title="Добавить токены">💎</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${this.users.length > 100 ? `<div style="text-align:center;padding:10px;color:var(--app-text-tertiary);font-size:12px">Показано 100 из ${this.users.length}</div>` : ''}

        <div style="margin-top:16px">
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('users')" style="padding:8px 16px;font-size:13px">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  async changeRole(userId: number, role: string): Promise<void> {
    try {
      const res = await apiClient.post('/admin/users/role', { user_id: userId, role });
      if (res.success) {
        const u = this.users.find(x => x.telegram_id === userId);
        if (u) u.role = role;
      } else {
        alert(res.error || 'Ошибка смены роли');
      }
    } catch (e) {
      // Если эндпоинта нет — можно обновлять напрямую через RPC или другой путь
      console.error(e);
      alert('Ошибка смены роли (проверьте API)');
    }
  }

  async addCoins(userId: number): Promise<void> {
    const amount = prompt('Сколько монет добавить?', '100');
    if (!amount) return;
    try {
      const res = await apiClient.post('/admin/coins', {
        user_id: userId,
        amount: parseInt(amount, 10),
        reason: 'Админское начисление',
      });
      if (res.success) {
        alert('Монеты начислены');
        await this.loadData(this.search);
      }
    } catch (e) {
      alert('Ошибка начисления');
    }
  }

  async addTokens(userId: number): Promise<void> {
    const amount = prompt('Сколько токенов добавить?', '50');
    if (!amount) return;
    try {
      // Используем существующий эндпоинт или RPC
      const res = await apiClient.post('/admin/coins', {
        user_id: userId,
        amount: parseInt(amount, 10),
        currency: 'tokens',
        reason: 'Админское начисление токенов',
      });
      if (res.success) {
        alert('Токены начислены');
        await this.loadData(this.search);
      }
    } catch (e) {
      alert('Ошибка начисления токенов');
    }
  }

  destroy(): void {}
}
