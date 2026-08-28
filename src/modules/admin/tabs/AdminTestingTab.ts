// ============================================
// src/modules/admin/tabs/AdminTestingTab.ts
// Тестирование и отладка
// Версия: 1.0.0
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminTestingTab implements IAdminTab {
  id = 'testing';
  label = '🤖 Тестирование';
  icon = '🤖';
  priority = 110;

  private loading: boolean = false;

  async init(): Promise<void> {
    // Ничего не загружаем
  }

  render(): string {
    return `
      <div class="admin-testing-tab">
        <div class="admin-section">
          <h3>🤖 Тестирование и отладка</h3>
          <p class="hint">Инструменты для тестирования и отладки системы.</p>

          <div class="testing-grid">
            <!-- Тестовый пользователь -->
            <div class="testing-card">
              <h4>👤 Тестовый пользователь</h4>
              <div class="form-row">
                <input 
                  type="number" 
                  id="test-user-id" 
                  placeholder="Telegram ID"
                  value="${window.userStore?.userId || ''}"
                />
                <button class="btn btn-secondary" onclick="AdminTestingTab.setTestUser()">
                  Установить
                </button>
              </div>
            </div>

            <!-- Управление балансом -->
            <div class="testing-card">
              <h4>💰 Управление балансом</h4>
              <div class="form-row">
                <input 
                  type="number" 
                  id="test-amount" 
                  placeholder="Сумма"
                  value="100"
                />
                <button class="btn btn-success" onclick="AdminTestingTab.addCoins()">
                  ➕ Начислить 🪙
                </button>
                <button class="btn btn-success" onclick="AdminTestingTab.addTokens()">
                  ➕ Начислить ⚡
                </button>
              </div>
            </div>

            <!-- Сброс -->
            <div class="testing-card">
              <h4>🔄 Сброс</h4>
              <div class="form-row">
                <button class="btn btn-warning" onclick="AdminTestingTab.resetTokens()">
                  🔄 Сбросить токены
                </button>
                <button class="btn btn-danger" onclick="AdminTestingTab.resetAll()">
                  🗑️ Полный сброс
                </button>
              </div>
            </div>

            <!-- Команды бота -->
            <div class="testing-card">
              <h4>📋 Команды для бота</h4>
              <div class="commands-list">
                <div class="command-item">
                  <code>/balance</code>
                  <span>— показать баланс</span>
                </div>
                <div class="command-item">
                  <code>/add_coins 100</code>
                  <span>— начислить 100 монет</span>
                </div>
                <div class="command-item">
                  <code>/add_tokens 50</code>
                  <span>— начислить 50 токенов</span>
                </div>
                <div class="command-item">
                  <code>/reset_tokens</code>
                  <span>— сбросить все токены</span>
                </div>
                <div class="command-item">
                  <code>/status</code>
                  <span>— статус подписки</span>
                </div>
                <div class="command-item">
                  <code>/trial</code>
                  <span>— активировать пробный период</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  static async setTestUser(): Promise<void> {
    const input = document.getElementById('test-user-id') as HTMLInputElement;
    const userId = parseInt(input?.value || '0');
    
    if (!userId) {
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Введите ID пользователя', 'error', 2000);
      }
      return;
    }

    // Устанавливаем тестового пользователя
    if ((window as any).userStore) {
      (window as any).userStore.userId = userId;
      (window as any).userStore.save();
    }

    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast(`👤 Тестовый пользователь: ${userId}`, 'success', 2000);
    }
  }

  static async addCoins(): Promise<void> {
    const userIdInput = document.getElementById('test-user-id') as HTMLInputElement;
    const amountInput = document.getElementById('test-amount') as HTMLInputElement;
    
    const userId = parseInt(userIdInput?.value || '0');
    const amount = parseInt(amountInput?.value || '0');

    if (!userId || !amount) {
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Введите ID и сумму', 'error', 2000);
      }
      return;
    }

    try {
      // Используем существующий API
      const response = await apiClient.post('/admin/coins', {
        user_id: userId,
        amount: amount,
        reason: 'Тестирование',
        action: 'add',
      });

      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast(`✅ Начислено ${amount} 🪙 пользователю ${userId}`, 'success', 2000);
        }
      } else {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('⚠️ Ошибка начисления', 'error', 2000);
        }
      }
    } catch (err) {
      console.error('[AdminTestingTab] Error adding coins:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка сервера', 'error', 2000);
      }
    }
  }

  static async addTokens(): Promise<void> {
    const userIdInput = document.getElementById('test-user-id') as HTMLInputElement;
    const amountInput = document.getElementById('test-amount') as HTMLInputElement;
    
    const userId = parseInt(userIdInput?.value || '0');
    const amount = parseInt(amountInput?.value || '0');

    if (!userId || !amount) {
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Введите ID и сумму', 'error', 2000);
      }
      return;
    }

    try {
      // Используем RPC напрямую через API
      const response = await apiClient.post('/admin/tokens', {
        user_id: userId,
        amount: amount,
        reason: 'Тестирование',
      });

      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast(`✅ Начислено ${amount} ⚡ пользователю ${userId}`, 'success', 2000);
        }
      } else {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('⚠️ Ошибка начисления', 'error', 2000);
        }
      }
    } catch (err) {
      console.error('[AdminTestingTab] Error adding tokens:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка сервера', 'error', 2000);
      }
    }
  }

  static async resetTokens(): Promise<void> {
    const userIdInput = document.getElementById('test-user-id') as HTMLInputElement;
    const userId = parseInt(userIdInput?.value || '0');

    if (!userId) {
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Введите ID пользователя', 'error', 2000);
      }
      return;
    }

    const confirm = await new Promise<boolean>((resolve) => {
      if ((window as any).tg?.showConfirm) {
        (window as any).tg.showConfirm(
          `Сбросить все токены пользователю ${userId}?`,
          (ok: boolean) => resolve(ok)
        );
      } else {
        resolve(confirm(`Сбросить все токены пользователю ${userId}?`));
      }
    });

    if (!confirm) return;

    try {
      const response = await apiClient.post('/admin/tokens/reset', { user_id: userId });
      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast(`🔄 Токены сброшены пользователю ${userId}`, 'info', 2000);
        }
      }
    } catch (err) {
      console.error('[AdminTestingTab] Error resetting tokens:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка сервера', 'error', 2000);
      }
    }
  }

  static async resetAll(): Promise<void> {
    const confirm = await new Promise<boolean>((resolve) => {
      if ((window as any).tg?.showConfirm) {
        (window as any).tg.showConfirm(
          '⚠️ Полный сброс системы? Это действие необратимо!',
          (ok: boolean) => resolve(ok)
        );
      } else {
        resolve(confirm('⚠️ Полный сброс системы? Это действие необратимо!'));
      }
    });

    if (!confirm) return;

    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('⚠️ Функция временно отключена', 'warning', 2000);
    }
  }

  onShow(): void {
    // Обновляем значения по умолчанию
    const input = document.getElementById('test-user-id') as HTMLInputElement;
    if (input && (window as any).userStore?.userId) {
      input.value = (window as any).userStore.userId;
    }
  }

  destroy(): void {
    // Очистка
  }
}

// Статические методы для вызова из HTML
(AdminTestingTab as any).setTestUser = AdminTestingTab.setTestUser;
(AdminTestingTab as any).addCoins = AdminTestingTab.addCoins;
(AdminTestingTab as any).addTokens = AdminTestingTab.addTokens;
(AdminTestingTab as any).resetTokens = AdminTestingTab.resetTokens;
(AdminTestingTab as any).resetAll = AdminTestingTab.resetAll;

// Регистрируем вкладку
import { adminRegistry } from '../core/admin-registry';
adminRegistry.register('testing', AdminTestingTab);
