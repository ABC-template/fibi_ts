// ============================================
// src/modules/admin/tabs/AdminLimitsTab.ts
// Лимиты перенесены во вкладку «Тарифы»
// Версия: 2.0.0
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';

export class AdminLimitsTab implements IAdminTab {
  id = 'limits';
  label = 'Лимиты';
  icon = '📊';
  priority = 20;

  async init(): Promise<void> {}
  async refresh(): Promise<void> {}
  onShow(): void {}
  destroy(): void {}

  render(): string {
    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:24px;border:1px solid var(--app-border-color-light);text-align:center">
        <h3 style="margin:0 0 8px;color:var(--app-text-primary)">📊 Лимиты перенесены</h3>
        <p style="color:var(--app-text-tertiary);font-size:14px;margin:0 0 16px;line-height:1.5">
          Бонус/день, постоянные токены и дневной лимит трат теперь настраиваются<br>
          во вкладке <strong>«Тарифы»</strong>.
        </p>
        <button class="btn btn-primary" onclick="window.adminModule.switchTab('subscriptions')" style="padding:8px 16px;font-size:13px">
          Перейти к тарифам →
        </button>
      </div>
    `;
  }
}
