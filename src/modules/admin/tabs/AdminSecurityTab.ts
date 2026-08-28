// ============================================
// src/modules/admin/tabs/AdminSecurityTab.ts
// Настройки безопасности и блокировки
// Версия: 1.0.1 — исправлена привязка методов
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface IBlock {
  id: string;
  user_id: number;
  username?: string;
  reason: string | null;
  blocked_by: number | null;
  blocked_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export class AdminSecurityTab implements IAdminTab {
  id = 'security';
  label = 'Безопасность';
  icon = '🔐';
  priority = 100;

  private blocks: IBlock[] = [];
  private loading: boolean = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">🔐 Настройки безопасности</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Управление блокировками пользователей.
        </p>

        <!-- Заблокировать пользователя -->
        <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; margin-bottom: 16px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🚫 Заблокировать пользователя</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <input type="number" id="block-user-id" placeholder="Telegram ID"
                   style="flex: 1; min-width: 120px; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
            <input type="text" id="block-reason" placeholder="Причина"
                   style="flex: 1; min-width: 120px; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
            <input type="datetime-local" id="block-expires" placeholder="До"
                   style="padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
            <button class="btn btn-danger" onclick="window.adminModule.blockUser()" style="padding: 8px 16px;">
              🔒 Заблокировать
            </button>
          </div>
        </div>

        <!-- Список блокировок -->
        <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🚫 Активные блокировки</div>
          ${this.blocks.length === 0 ? `
            <div style="text-align: center; padding: 20px; color: var(--app-text-tertiary);">🔓 Нет активных блокировок</div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${this.blocks.map(block => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--app-bg-secondary); border-radius: 8px;">
                  <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                    <span style="font-weight: 500;">${block.username || '👤 ' + block.user_id}</span>
                    <span style="font-size: 12px; color: var(--app-text-tertiary);">${block.reason || 'Причина не указана'}</span>
                    <span style="font-size: 11px; color: var(--app-text-tertiary);">С ${new Date(block.blocked_at).toLocaleDateString()}</span>
                    ${block.expires_at ? `<span style="font-size: 11px; color: #e74c3c;">до ${new Date(block.expires_at).toLocaleDateString()}</span>` : ''}
                  </div>
                  <button class="btn btn-sm btn-success" onclick="window.adminModule.unblockUser('${block.user_id}')" style="padding: 4px 12px; font-size: 12px;">
                    🔓 Разблокировать
                  </button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('security')" style="padding: 10px 20px;">
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
      const response = await apiClient.get('/admin/economy/blocks');
      if (response.success) {
        this.blocks = response.blocks || [];
      }
    } catch (err) {
      console.error('[AdminSecurityTab] Error loading blocks:', err);
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
