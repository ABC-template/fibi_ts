// ============================================
// src/modules/admin/tabs/AdminSettingsTab.ts
// Глобальные настройки экономики
// Версия: 1.0.1 — исправлены типы
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface ISettings {
  id?: string;
  exchange_enabled: boolean;
  exchange_rate: number;
  max_exchange_percent: number;
  min_exchange_amount: number;
  bonus_coins_per_day: number;
  bonus_tokens_per_day: number;
  whitelist_enabled: boolean;
  daily_reset_time: string;
  token_expiry_days: number;
  min_tokens_for_request: number;
  low_balance_threshold: number;
  low_tokens_threshold: number;
  log_retention_days: number;
  audit_log_retention_days: number;
}

export class AdminSettingsTab implements IAdminTab {
  id = 'settings';
  label = '⚙️ Настройки';
  icon = '⚙️';
  priority = 30;

  private settings: ISettings | null = null;
  private loading: boolean = false;
  private saving: boolean = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    const s = this.settings || this.getDefaultSettings();

    return `
      <div class="admin-settings-tab">
        <div class="admin-section">
          <h3>⚙️ Глобальные настройки экономики</h3>
          <p class="hint">Эти настройки применяются ко всем пользователям системы.</p>

          <div class="settings-form">
            <!-- Обмен -->
            <div class="settings-group">
              <h4>💱 Обмен коинов → токены</h4>
              
              <div class="setting-row">
                <label>
                  <input type="checkbox" id="exchange_enabled" ${s.exchange_enabled ? 'checked' : ''} />
                  Включить обмен
                </label>
              </div>
              
              <div class="setting-row">
                <label>Курс обмена: 1 🪙 = </label>
                <input type="number" id="exchange_rate" value="${s.exchange_rate}" min="1" />
                <span>⚡</span>
              </div>
              
              <div class="setting-row">
                <label>Максимальный % для обмена: </label>
                <input type="number" id="max_exchange_percent" value="${s.max_exchange_percent}" min="1" max="100" />
                <span>%</span>
              </div>
              
              <div class="setting-row">
                <label>Минимальная сумма для обмена: </label>
                <input type="number" id="min_exchange_amount" value="${s.min_exchange_amount}" min="1" />
                <span>🪙</span>
              </div>
            </div>

            <!-- Бонусы -->
            <div class="settings-group">
              <h4>🎁 Ежедневные бонусы</h4>
              
              <div class="setting-row">
                <label>Бонусных коинов в день: </label>
                <input type="number" id="bonus_coins_per_day" value="${s.bonus_coins_per_day}" min="0" />
                <span>🪙</span>
              </div>
              
              <div class="setting-row">
                <label>Бонусных токенов в день: </label>
                <input type="number" id="bonus_tokens_per_day" value="${s.bonus_tokens_per_day}" min="0" />
                <span>⚡ (0 = отключить)</span>
              </div>
            </div>

            <!-- Белый список -->
            <div class="settings-group">
              <h4>🔒 Белый список для обмена</h4>
              
              <div class="setting-row">
                <label>
                  <input type="checkbox" id="whitelist_enabled" ${s.whitelist_enabled ? 'checked' : ''} />
                  Включить белый список (только избранные могут обменивать)
                </label>
              </div>
            </div>

            <!-- Системные настройки -->
            <div class="settings-group">
              <h4>⚙️ Системные настройки</h4>
              
              <div class="setting-row">
                <label>Время сброса бонусов: </label>
                <input type="time" id="daily_reset_time" value="${s.daily_reset_time}" />
              </div>
              
              <div class="setting-row">
                <label>Срок жизни бонусных токенов: </label>
                <input type="number" id="token_expiry_days" value="${s.token_expiry_days}" min="1" />
                <span>дней</span>
              </div>
              
              <div class="setting-row">
                <label>Минимум токенов для запроса: </label>
                <input type="number" id="min_tokens_for_request" value="${s.min_tokens_for_request}" min="1" />
                <span>⚡</span>
              </div>
            </div>

            <!-- Уведомления -->
            <div class="settings-group">
              <h4>🔔 Уведомления</h4>
              
              <div class="setting-row">
                <label>Порог для уведомления о низком балансе: </label>
                <input type="number" id="low_balance_threshold" value="${s.low_balance_threshold}" min="0" />
                <span>🪙</span>
              </div>
              
              <div class="setting-row">
                <label>Порог для уведомления о низком балансе токенов: </label>
                <input type="number" id="low_tokens_threshold" value="${s.low_tokens_threshold}" min="0" />
                <span>⚡</span>
              </div>
            </div>

            <!-- Хранение логов -->
            <div class="settings-group">
              <h4>📋 Хранение логов</h4>
              
              <div class="setting-row">
                <label>Срок хранения системных логов: </label>
                <input type="number" id="log_retention_days" value="${s.log_retention_days}" min="1" />
                <span>дней</span>
              </div>
              
              <div class="setting-row">
                <label>Срок хранения аудит-логов: </label>
                <input type="number" id="audit_log_retention_days" value="${s.audit_log_retention_days}" min="1" />
                <span>дней</span>
              </div>
            </div>

            <div class="admin-actions">
              <button class="btn btn-primary" onclick="AdminSettingsTab.save()" id="save-settings-btn">
                💾 Сохранить настройки
              </button>
              <button class="btn btn-secondary" onclick="AdminSettingsTab.refresh()">
                🔄 Обновить
              </button>
            </div>

            ${this.saving ? `<div class="saving-indicator">⏳ Сохранение...</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private getDefaultSettings(): ISettings {
    return {
      exchange_enabled: true,
      exchange_rate: 1,
      max_exchange_percent: 80,
      min_exchange_amount: 1,
      bonus_coins_per_day: 5,
      bonus_tokens_per_day: 5,
      whitelist_enabled: false,
      daily_reset_time: '00:00:00',
      token_expiry_days: 1,
      min_tokens_for_request: 1,
      low_balance_threshold: 10,
      low_tokens_threshold: 5,
      log_retention_days: 90,
      audit_log_retention_days: 180,
    };
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const response = await apiClient.get('/admin/economy/settings');
      if (response.success) {
        this.settings = response.settings;
      }
    } catch (err) {
      console.error('[AdminSettingsTab] Error loading settings:', err);
    } finally {
      this.loading = false;
    }
  }

  async save(): Promise<void> {
    if (this.saving) return;
    this.saving = true;

    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
      (saveBtn as HTMLButtonElement).disabled = true;
      saveBtn.textContent = '⏳ Сохранение...';
    }

    try {
      const data: ISettings = {
        exchange_enabled: (document.getElementById('exchange_enabled') as HTMLInputElement)?.checked ?? true,
        exchange_rate: parseInt((document.getElementById('exchange_rate') as HTMLInputElement)?.value || '1'),
        max_exchange_percent: parseInt((document.getElementById('max_exchange_percent') as HTMLInputElement)?.value || '80'),
        min_exchange_amount: parseInt((document.getElementById('min_exchange_amount') as HTMLInputElement)?.value || '1'),
        bonus_coins_per_day: parseInt((document.getElementById('bonus_coins_per_day') as HTMLInputElement)?.value || '5'),
        bonus_tokens_per_day: parseInt((document.getElementById('bonus_tokens_per_day') as HTMLInputElement)?.value || '5'),
        whitelist_enabled: (document.getElementById('whitelist_enabled') as HTMLInputElement)?.checked ?? false,
        daily_reset_time: (document.getElementById('daily_reset_time') as HTMLInputElement)?.value || '00:00:00',
        token_expiry_days: parseInt((document.getElementById('token_expiry_days') as HTMLInputElement)?.value || '1'),
        min_tokens_for_request: parseInt((document.getElementById('min_tokens_for_request') as HTMLInputElement)?.value || '1'),
        low_balance_threshold: parseInt((document.getElementById('low_balance_threshold') as HTMLInputElement)?.value || '10'),
        low_tokens_threshold: parseInt((document.getElementById('low_tokens_threshold') as HTMLInputElement)?.value || '5'),
        log_retention_days: parseInt((document.getElementById('log_retention_days') as HTMLInputElement)?.value || '90'),
        audit_log_retention_days: parseInt((document.getElementById('audit_log_retention_days') as HTMLInputElement)?.value || '180'),
      };

      const response = await apiClient.post('/admin/economy/settings', data);

      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('✅ Настройки сохранены', 'success', 2000);
        }
        this.settings = response.settings;
      } else {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('⚠️ Ошибка сохранения', 'error', 2000);
        }
      }
    } catch (err) {
      console.error('[AdminSettingsTab] Error saving settings:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка сервера', 'error', 2000);
      }
    } finally {
      this.saving = false;
      if (saveBtn) {
        (saveBtn as HTMLButtonElement).disabled = false;
        saveBtn.textContent = '💾 Сохранить настройки';
      }
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
    const container = document.querySelector('.admin-settings-tab');
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
(AdminSettingsTab as any).save = () => {
  const tab = adminRegistry.getInstance('settings') as AdminSettingsTab;
  if (tab) tab.save();
};

(AdminSettingsTab as any).refresh = () => {
  const tab = adminRegistry.getInstance('settings') as AdminSettingsTab;
  if (tab) tab.refresh();
};

// Регистрируем вкладку
import { adminRegistry } from '../core/admin-registry';
adminRegistry.register('settings', AdminSettingsTab);
