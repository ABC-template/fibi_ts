// ============================================
// src/modules/admin/tabs/AdminLimitsTab.ts
// Редактирование лимитов по ролям
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminLimitsTab implements IAdminTab {
  id = 'limits';
  label = 'Лимиты';
  icon = '📊';
  priority = 20;

  private limits: any[] = [];
  private loading = false;
  private saving = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/economy/limits');
      if (res.success) this.limits = res.limits || [];
    } catch (e) {
      console.error('[AdminLimitsTab]', e);
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
    if (this.loading && this.limits.length === 0) {
      return `<div style="padding:40px;text-align:center;color:var(--app-text-tertiary)">⏳ Загрузка лимитов...</div>`;
    }

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 8px;color:var(--app-text-primary)">📊 Лимиты токенов по ролям</h3>
        <p style="color:var(--app-text-tertiary);font-size:13px;margin-bottom:16px">
          Бонусные токены сбрасываются ежедневно. Постоянные выдаются при подписке.
        </p>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:8px;color:var(--app-text-tertiary)">Роль</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Бонус / день</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Постоянные</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">OpenRouter</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Активен</th>
              </tr>
            </thead>
            <tbody>
              ${this.limits.map((l, idx) => `
                <tr style="border-bottom:1px solid var(--app-border-color-light)">
                  <td style="padding:8px;font-weight:600">${l.role_name || l.role_key || l.id}</td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${l.bonus_tokens_per_day ?? 0}" 
                      data-idx="${idx}" data-field="bonus_tokens_per_day"
                      style="width:80px;padding:4px 8px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${l.permanent_tokens_on_subscribe ?? 0}" 
                      data-idx="${idx}" data-field="permanent_tokens_on_subscribe"
                      style="width:80px;padding:4px 8px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${l.openrouter_limit ?? 0}" 
                      data-idx="${idx}" data-field="openrouter_limit"
                      style="width:80px;padding:4px 8px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="checkbox" ${l.is_active ? 'checked' : ''} 
                      data-idx="${idx}" data-field="is_active"
                      style="width:18px;height:18px">
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="window.adminModule.saveLimits()" style="padding:8px 16px;font-size:13px" ${this.saving ? 'disabled' : ''}>
            ${this.saving ? '⏳ Сохранение...' : '💾 Сохранить'}
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('limits')" style="padding:8px 16px;font-size:13px">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  /** Сохранить изменения из инпутов */
  async save(): Promise<void> {
    if (this.saving) return;
    this.saving = true;

    try {
      // Собираем актуальные значения из DOM
      const inputs = document.querySelectorAll('#admin-tab-content input[data-idx]');
      inputs.forEach((el: any) => {
        const idx = parseInt(el.dataset.idx, 10);
        const field = el.dataset.field;
        if (this.limits[idx]) {
          if (el.type === 'checkbox') {
            this.limits[idx][field] = el.checked;
          } else {
            this.limits[idx][field] = parseInt(el.value, 10) || 0;
          }
        }
      });

      const res = await apiClient.post('/admin/economy/limits', { limits: this.limits });
      if (res.success) {
        alert('Лимиты сохранены');
      } else {
        alert(res.error || 'Ошибка сохранения');
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка сохранения лимитов');
    } finally {
      this.saving = false;
    }
  }

  destroy(): void {}
}
