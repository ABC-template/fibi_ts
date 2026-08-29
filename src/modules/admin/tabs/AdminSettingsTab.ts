// ============================================
// src/modules/admin/tabs/AdminSettingsTab.ts
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminSettingsTab implements IAdminTab {
  id = 'settings';
  label = 'Настройки';
  icon = '⚙️';
  priority = 40;

  private settings: any = null;
  private loading = false;
  private saving = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/economy/settings');
      if (res.success) this.settings = res.settings || res;
    } catch (e) {
      console.error(e);
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
    const s = this.settings || {};

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 16px;color:var(--app-text-primary)">⚙️ Экономические настройки</h3>

        <div style="display:grid;gap:12px;max-width:480px">
          <label style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span>Курс обмена (монеты → токены)</span>
            <input type="number" id="set-exchange-rate" value="${s.exchange_rate ?? 10}" style="width:100px;padding:6px 10px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span>Мин. сумма обмена</span>
            <input type="number" id="set-min-exchange" value="${s.min_exchange_amount ?? 10}" style="width:100px;padding:6px 10px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span>Бонусные монеты / день</span>
            <input type="number" id="set-bonus-coins" value="${s.bonus_coins_per_day ?? 0}" style="width:100px;padding:6px 10px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span>Обмен включён</span>
            <input type="checkbox" id="set-exchange-enabled" ${s.exchange_enabled ? 'checked' : ''} style="width:18px;height:18px">
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span>Whitelist включён</span>
            <input type="checkbox" id="set-whitelist" ${s.whitelist_enabled ? 'checked' : ''} style="width:18px;height:18px">
          </label>
        </div>

        <div style="margin-top:20px;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="window.adminModule.saveSettings()" style="padding:8px 16px;font-size:13px">
            💾 Сохранить
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('settings')" style="padding:8px 16px;font-size:13px">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  async save(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      const payload = {
        exchange_rate: parseInt((document.getElementById('set-exchange-rate') as HTMLInputElement)?.value || '10', 10),
        min_exchange_amount: parseInt((document.getElementById('set-min-exchange') as HTMLInputElement)?.value || '10', 10),
        bonus_coins_per_day: parseInt((document.getElementById('set-bonus-coins') as HTMLInputElement)?.value || '0', 10),
        exchange_enabled: (document.getElementById('set-exchange-enabled') as HTMLInputElement)?.checked ?? false,
        whitelist_enabled: (document.getElementById('set-whitelist') as HTMLInputElement)?.checked ?? false,
      };

      const res = await apiClient.post('/admin/economy/settings', payload);
      if (res.success) {
        this.settings = { ...this.settings, ...payload };
        alert('Настройки сохранены');
      } else {
        alert(res.error || 'Ошибка');
      }
    } catch (e) {
      alert('Ошибка сохранения');
    } finally {
      this.saving = false;
    }
  }

  destroy(): void {}
}
