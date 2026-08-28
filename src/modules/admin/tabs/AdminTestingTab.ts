// ============================================
// src/modules/admin/tabs/AdminTestingTab.ts
// Тестирование и отладка
// Версия: 1.0.1 — исправлена привязка методов
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminTestingTab implements IAdminTab {
  id = 'testing';
  label = 'Тестирование';
  icon = '🤖';
  priority = 110;

  private loading: boolean = false;

  async init(): Promise<void> {
    // Ничего не загружаем
  }

  render(): string {
    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">🤖 Тестирование</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Инструменты для тестирования системы.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <!-- Тестовый пользователь -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">👤 Тестовый пользователь</div>
            <div style="display: flex; gap: 6px;">
              <input type="number" id="test-user-id" placeholder="Telegram ID" value="${(window as any).userStore?.userId || ''}"
                     style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              <button class="btn btn-secondary" onclick="window.adminModule.setTestUser()" style="padding: 6px 14px; font-size: 12px;">
                Установить
              </button>
            </div>
          </div>

          <!-- Управление балансом -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">💰 Управление балансом</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <input type="number" id="test-amount" placeholder="Сумма" value="100"
                     style="flex: 1; min-width: 80px; padding: 8px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              <button class="btn btn-success" onclick="window.adminModule.addCoins()" style="padding: 6px 14px; font-size: 12px;">
                ➕ 🪙
              </button>
              <button class="btn btn-success" onclick="window.adminModule.addTokens()" style="padding: 6px 14px; font-size: 12px;">
                ➕ ⚡
              </button>
            </div>
          </div>

          <!-- Сброс -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🔄 Сброс</div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-warning" onclick="window.adminModule.resetTokens()" style="padding: 6px 14px; font-size: 12px;">
                🔄 Сбросить токены
              </button>
              <button class="btn btn-danger" onclick="window.adminModule.resetAll()" style="padding: 6px 14px; font-size: 12px;">
                🗑️ Полный сброс
              </button>
            </div>
          </div>

          <!-- Команды бота -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">📋 Команды для бота</div>
            <div style="font-size: 12px; color: var(--app-text-secondary); line-height: 1.8;">
              <div><code style="background: var(--app-bg-secondary); padding: 1px 6px; border-radius: 4px;">/balance</code> — показать баланс</div>
              <div><code style="background: var(--app-bg-secondary); padding: 1px 6px; border-radius: 4px;">/add_coins 100</code> — начислить монеты</div>
              <div><code style="background: var(--app-bg-secondary); padding: 1px 6px; border-radius: 4px;">/add_tokens 50</code> — начислить токены</div>
              <div><code style="background: var(--app-bg-secondary); padding: 1px 6px; border-radius: 4px;">/reset_tokens</code> — сбросить токены</div>
              <div><code style="background: var(--app-bg-secondary); padding: 1px 6px; border-radius: 4px;">/status</code> — статус подписки</div>
              <div><code style="background: var(--app-bg-secondary); padding: 1px 6px; border-radius: 4px;">/trial</code> — активировать пробный</div>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('testing')" style="padding: 10px 20px;">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  onShow(): void {
    const input = document.getElementById('test-user-id') as HTMLInputElement;
    if (input && (window as any).userStore?.userId) {
      input.value = (window as any).userStore.userId;
    }
  }

  destroy(): void {
    // Очистка
  }
}
