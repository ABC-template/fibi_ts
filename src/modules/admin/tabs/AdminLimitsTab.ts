// ============================================
// src/modules/admin/tabs/AdminLimitsTab.ts
// Управление лимитами по ролям
// Версия: 1.0.0
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface ILimit {
  id: string;
  role_key: string;
  role_name: string;
  bonus_tokens_per_day: number;
  permanent_tokens_on_subscribe: number;
  openrouter_limit: number;
  is_active: boolean;
  sort_order: number;
}

export class AdminLimitsTab implements IAdminTab {
  id = 'limits';
  label = '📊 Лимиты токенов';
  icon = '📊';
  priority = 20;

  private limits: ILimit[] = [];
  private loading: boolean = false;
  private saving: boolean = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    return `
      <div class="admin-limits-tab">
        <div class="admin-section">
          <h3>📊 Лимиты токенов (по ролям и подпискам)</h3>
          <p class="hint">
            Эти лимиты определяют, сколько токенов получает пользователь при входе в систему.
            Изменения применяются при следующем входе пользователя.
          </p>

          <div class="limits-table-wrapper">
            <table class="limits-table">
              <thead>
                <tr>
                  <th>Роль</th>
                  <th>🎁 Бонусных в день</th>
                  <th>💎 Постоянных при подписке</th>
                  <th>📊 OpenRouter лимит</th>
                  <th>Активен</th>
                </tr>
              </thead>
              <tbody>
                ${this.limits.map(limit => `
                  <tr data-id="${limit.id}">
                    <td>
                      <strong>${limit.role_name}</strong>
                      <span class="role-key">${limit.role_key}</span>
                    </td>
                    <td>
                      <input 
                        type="number" 
                        class="limit-input bonus-input"
                        value="${limit.bonus_tokens_per_day}"
                        min="0"
                        data-field="bonus_tokens_per_day"
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        class="limit-input permanent-input"
                        value="${limit.permanent_tokens_on_subscribe}"
                        min="0"
                        data-field="permanent_tokens_on_subscribe"
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        class="limit-input openrouter-input"
                        value="${limit.openrouter_limit}"
                        min="0"
                        data-field="openrouter_limit"
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        class="limit-active"
                        ${limit.is_active ? 'checked' : ''}
                        data-field="is_active"
                      />
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="admin-actions">
            <button class="btn btn-primary" onclick="AdminLimitsTab.save()" id="save-limits-btn">
              💾 Сохранить лимиты
            </button>
            <button class="btn btn-secondary" onclick="AdminLimitsTab.refresh()">
              🔄 Обновить
            </button>
          </div>

          ${this.saving ? `<div class="saving-indicator">⏳ Сохранение...</div>` : ''}
        </div>
      </div>
    `;
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const response = await apiClient.get('/admin/economy/limits');
      if (response.success) {
        this.limits = response.limits || [];
      }
    } catch (err) {
      console.error('[AdminLimitsTab] Error loading limits:', err);
    } finally {
      this.loading = false;
    }
  }

  async save(): Promise<void> {
    if (this.saving) return;
    this.saving = true;

    const saveBtn = document.getElementById('save-limits-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Сохранение...';
    }

    try {
      // Собираем данные из формы
      const rows = document.querySelectorAll('.limits-table tbody tr');
      const limits: ILimit[] = [];

      rows.forEach(row => {
        const id = row.dataset.id!;
        const bonusInput = row.querySelector('.bonus-input') as HTMLInputElement;
        const permanentInput = row.querySelector('.permanent-input') as HTMLInputElement;
        const openrouterInput = row.querySelector('.openrouter-input') as HTMLInputElement;
        const activeCheckbox = row.querySelector('.limit-active') as HTMLInputElement;

        limits.push({
          id,
          role_key: '',
          role_name: '',
          bonus_tokens_per_day: parseInt(bonusInput.value) || 0,
          permanent_tokens_on_subscribe: parseInt(permanentInput.value) || 0,
          openrouter_limit: parseInt(openrouterInput.value) || 0,
          is_active: activeCheckbox.checked,
          sort_order: 0,
        });
      });

      const response = await apiClient.post('/admin/economy/limits', { limits });

      if (response.success) {
        // Показываем уведомление
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('✅ Лимиты сохранены', 'success', 2000);
        }
        await this.loadData();
        this.render();
      } else {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('⚠️ Ошибка сохранения', 'error', 2000);
        }
      }
    } catch (err) {
      console.error('[AdminLimitsTab] Error saving limits:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка сервера', 'error', 2000);
      }
    } finally {
      this.saving = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Сохранить лимиты';
      }
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
    const container = document.querySelector('.admin-limits-tab');
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
(AdminLimitsTab as any).save = () => {
  const tab = adminRegistry.getInstance('limits') as AdminLimitsTab;
  if (tab) tab.save();
};

(AdminLimitsTab as any).refresh = () => {
  const tab = adminRegistry.getInstance('limits') as AdminLimitsTab;
  if (tab) tab.refresh();
};

// Регистрируем вкладку
import { adminRegistry } from '../core/admin-registry';
adminRegistry.register('limits', AdminLimitsTab);
