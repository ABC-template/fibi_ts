// ============================================
// src/modules/admin/tabs/AdminTestingTab.ts
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';
import { userStore } from '@/store/UserStore';

export class AdminTestingTab implements IAdminTab {
  id = 'testing';
  label = 'Тестирование';
  icon = '🤖';
  priority = 90;

  async init(): Promise<void> {}
  async refresh(): Promise<void> {}
  onShow(): void {}
  destroy(): void {}

  render(): string {
    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 16px;color:var(--app-text-primary)">🤖 Тестирование</h3>
        <p style="color:var(--app-text-tertiary);font-size:13px;margin-bottom:20px">
          Быстрые действия для проверки экономики и ролей.
        </p>

        <div style="display:flex;flex-direction:column;gap:10px;max-width:360px">
          <button class="btn btn-secondary" onclick="window.adminModule.testAddCoins()" style="padding:12px;text-align:left">
            🪙 Начислить себе 100 монет
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.testAddTokens()" style="padding:12px;text-align:left">
            💎 Начислить себе 50 токенов
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.testResetDaily()" style="padding:12px;text-align:left">
            🔄 Сбросить daily-квесты
          </button>
        </div>
      </div>
    `;
  }
}
