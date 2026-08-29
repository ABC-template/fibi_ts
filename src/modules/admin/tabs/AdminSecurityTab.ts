// ============================================
// src/modules/admin/tabs/AdminSecurityTab.ts
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminSecurityTab implements IAdminTab {
  id = 'security';
  label = 'Безопасность';
  icon = '🔐';
  priority = 80;

  private blocks: any[] = [];
  private whitelist: any[] = [];
  private loading = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const [blocksRes, whiteRes] = await Promise.all([
        apiClient.get('/admin/economy/blocks'),
        apiClient.get('/admin/economy/whitelist'),
      ]);
      if (blocksRes.success) this.blocks = blocksRes.blocks || [];
      if (whiteRes.success) this.whitelist = whiteRes.whitelist || whiteRes.users || [];
    } catch (e) {
      console.error('[AdminSecurityTab]', e);
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
    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 16px;color:var(--app-text-primary)">🔐 Безопасность</h3>

        <h4 style="margin:0 0 10px;font-size:14px">Заблокированные пользователи</h4>
        <div style="overflow-x:auto;margin-bottom:24px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">User ID</th>
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">Причина</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${this.blocks.length === 0 ? `
                <tr><td colspan="3" style="text-align:center;padding:20px;color:var(--app-text-tertiary)">Нет блокировок</td></tr>
              ` : this.blocks.map(b => `
                <tr style="border-bottom:1px solid var(--app-border-color-light)">
                  <td style="padding:6px 8px">${b.user_id}</td>
                  <td style="padding:6px 8px">${b.reason || '—'}</td>
                  <td style="text-align:center;padding:6px 8px">
                    <button onclick="window.adminModule.unblockUser(${b.user_id})" style="padding:4px 10px;font-size:11px;border:none;border-radius:6px;background:rgba(39,174,96,0.15);color:#27ae60;cursor:pointer">Разблокировать</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <h4 style="margin:0 0 10px;font-size:14px">Whitelist</h4>
        <div style="margin-bottom:12px">
          <button class="btn btn-primary" onclick="window.adminModule.addToWhitelist()" style="padding:6px 14px;font-size:12px">+ Добавить в whitelist</button>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">User ID</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${this.whitelist.length === 0 ? `
                <tr><td colspan="2" style="text-align:center;padding:20px;color:var(--app-text-tertiary)">Whitelist пуст</td></tr>
              ` : this.whitelist.map(w => `
                <tr style="border-bottom:1px solid var(--app-border-color-light)">
                  <td style="padding:6px 8px">${w.user_id || w}</td>
                  <td style="text-align:center;padding:6px 8px">
                    <button onclick="window.adminModule.removeFromWhitelist(${w.user_id || w})" style="padding:4px 10px;font-size:11px;border:none;border-radius:6px;background:rgba(231,76,60,0.15);color:#e74c3c;cursor:pointer">Удалить</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:16px">
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('security')" style="padding:8px 16px;font-size:13px">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  async unblock(userId: number): Promise<void> {
    try {
      const res = await apiClient.delete(`/admin/economy/blocks?user_id=${userId}`);
      if (res.success) {
        this.blocks = this.blocks.filter(b => b.user_id !== userId);
      }
    } catch (e) {
      alert('Ошибка разблокировки');
    }
  }

  async addWhitelist(): Promise<void> {
    const id = prompt('Telegram ID пользователя:');
    if (!id) return;
    try {
      const res = await apiClient.post('/admin/economy/whitelist', { user_id: parseInt(id, 10) });
      if (res.success) {
        this.whitelist.push({ user_id: parseInt(id, 10) });
      }
    } catch (e) {
      alert('Ошибка добавления');
    }
  }

  async removeWhitelist(userId: number): Promise<void> {
    try {
      const res = await apiClient.delete(`/admin/economy/whitelist?user_id=${userId}`);
      if (res.success) {
        this.whitelist = this.whitelist.filter(w => (w.user_id || w) !== userId);
      }
    } catch (e) {
      alert('Ошибка удаления');
    }
  }

  destroy(): void {}
}
