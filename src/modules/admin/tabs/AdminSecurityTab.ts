// ============================================
// src/modules/admin/tabs/AdminSecurityTab.ts
// Настройки безопасности и блокировки
// Версия: 1.0.0
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
  label = '🔐 Безопасность';
  icon = '🔐';
  priority = 100;

  private blocks: IBlock[] = [];
  private loading: boolean = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    return `
      <div class="admin-security-tab">
        <div class="admin-section">
          <h3>🔐 Настройки безопасности</h3>
          <p class="hint">Управление блокировками пользователей и ограничениями.</p>

          <!-- Заблокировать пользователя -->
          <div class="security-card">
            <h4>🚫 Заблокировать пользователя</h4>
            <div class="block-form">
              <div class="form-group">
                <input 
                  type="number" 
                  id="block-user-id" 
                  placeholder="Telegram ID пользователя"
                />
              </div>
              <div class="form-group">
                <input 
                  type="text" 
                  id="block-reason" 
                  placeholder="Причина блокировки (опционально)"
                />
              </div>
              <div class="form-group">
                <input 
                  type="datetime-local" 
                  id="block-expires" 
                  placeholder="Дата окончания (опционально)"
                />
              </div>
              <button class="btn btn-danger" onclick="AdminSecurityTab.blockUser()">
                🔒 Заблокировать
              </button>
            </div>
          </div>

          <!-- Список блокировок -->
          <div class="security-card">
            <h4>🚫 Активные блокировки</h4>
            ${this.blocks.length === 0 ? `
              <div class="empty-state">🔓 Нет активных блокировок</div>
            ` : `
              <div class="blocks-list">
                ${this.blocks.map(block => `
                  <div class="block-item">
                    <div class="block-info">
                      <span class="user">${block.username || '👤 ' + block.user_id}</span>
                      <span class="reason">${block.reason || 'Причина не указана'}</span>
                      <span class="date">С ${new Date(block.blocked_at).toLocaleDateString()}</span>
                      ${block.expires_at ? `<span class="expires">до ${new Date(block.expires_at).toLocaleDateString()}</span>` : ''}
                    </div>
                    <button class="btn btn-sm btn-success" onclick="AdminSecurityTab.unblockUser('${block.user_id}')">
                      🔓 Разблокировать
                    </button>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div class="admin-actions">
            <button class="btn btn-secondary" onclick="AdminSecurityTab.refresh()">
              🔄 Обновить
            </button>
          </div>
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

  static async blockUser(): Promise<void> {
    const userIdInput = document.getElementById('block-user-id') as HTMLInputElement;
    const reasonInput = document.getElementById('block-reason') as HTMLInputElement;
    const expiresInput = document.getElementById('block-expires') as HTMLInputElement;

    const userId = parseInt(userIdInput?.value || '0');
    if (!userId) {
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Введите ID пользователя', 'error', 2000);
      }
      return;
    }

    const reason = reasonInput?.value || null;
    const expiresAt = expiresInput?.value || null;

    try {
      const response = await apiClient.post('/admin/economy/blocks', {
        user_id: userId,
        reason,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast(`🔒 Пользователь ${userId} заблокирован`, 'success', 2000);
        }
        userIdInput.value = '';
        reasonInput.value = '';
        expiresInput.value = '';
        
        const tab = adminRegistry.getInstance('security') as AdminSecurityTab;
        if (tab) {
          await tab.loadData();
          const container = document.querySelector('.admin-security-tab');
          if (container) {
            container.outerHTML = tab.render();
          }
        }
      } else {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('⚠️ Ошибка блокировки', 'error', 2000);
        }
      }
    } catch (err) {
      console.error('[AdminSecurityTab] Error blocking user:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка сервера', 'error', 2000);
      }
    }
  }

  static async unblockUser(userId: string): Promise<void> {
    const confirm = await new Promise<boolean>((resolve) => {
      if ((window as any).tg?.showConfirm) {
        (window as any).tg.showConfirm(
          `Разблокировать пользователя ${userId}?`,
          (ok: boolean) => resolve(ok)
        );
      } else {
        resolve(confirm(`Разблокировать пользователя ${userId}?`));
      }
    });

    if (!confirm) return;

    try {
      const response = await apiClient.delete(`/admin/economy/blocks?user_id=${userId}`);
      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast(`🔓 Пользователь ${userId} разблокирован`, 'success', 2000);
        }
        const tab = adminRegistry.getInstance('security') as AdminSecurityTab;
        if (tab) {
          await tab.loadData();
          const container = document.querySelector('.admin-security-tab');
          if (container) {
            container.outerHTML = tab.render();
          }
        }
      }
    } catch (err) {
      console.error('[AdminSecurityTab] Error unblocking user:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка разблокировки', 'error', 2000);
      }
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
    const container = document.querySelector('.admin-security-tab');
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
(AdminSecurityTab as any).blockUser = AdminSecurityTab.blockUser;
(AdminSecurityTab as any).unblockUser = AdminSecurityTab.unblockUser;
(AdminSecurityTab as any).refresh = () => {
  const tab = adminRegistry.getInstance('security') as AdminSecurityTab;
  if (tab) tab.refresh();
};

// Регистрируем вкладку
import { adminRegistry } from '../core/admin-registry';
adminRegistry.register('security', AdminSecurityTab);
