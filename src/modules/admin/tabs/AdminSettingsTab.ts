// ============================================
// src/modules/admin/tabs/AdminSettingsTab.ts
// Глобальные настройки экономики
// Версия: 1.0.1 — исправлена привязка методов
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
  label = 'Настройки';
  icon = '⚙️';
  priority = 30;

  private settings: ISettings | null = null;
  private loading: boolean = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    const s = this.settings || {
      exchange_enabled: true,
      exchange_rate: 1,
      max_exchange_percent: 80,
      min_exchange_amount: 1,
      bonus_coins_per_day: 5,
      bonus_tokens_per_day: 5,
      whitelist_enabled: false,
      daily_reset_time: '00:00',
      token_expiry_days: 1,
      min_tokens_for_request: 1,
      low_balance_threshold: 10,
      low_tokens_threshold: 5,
      log_retention_days: 90,
      audit_log_retention_days: 180,
    };

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">⚙️ Глобальные настройки</h3>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Настройки применяются ко всем пользователям системы.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <!-- Обмен -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">💱 Обмен</div>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--app-text-secondary); margin-bottom: 6px;">
              <input type="checkbox" id="exchange_enabled" ${s.exchange_enabled ? 'checked' : ''} />
              Включить обмен
            </label>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                1 🪙 =
                <input type="number" id="exchange_rate" value="${s.exchange_rate}" min="1" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                ⚡
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Макс %:
                <input type="number" id="max_exchange_percent" value="${s.max_exchange_percent}" min="1" max="100" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                %
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Мин:
                <input type="number" id="min_exchange_amount" value="${s.min_exchange_amount}" min="1" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                🪙
              </label>
            </div>
          </div>

          <!-- Бонусы -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🎁 Ежедневные бонусы</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                🪙 Коинов:
                <input type="number" id="bonus_coins_per_day" value="${s.bonus_coins_per_day}" min="0" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                ⚡ Токенов:
                <input type="number" id="bonus_tokens_per_day" value="${s.bonus_tokens_per_day}" min="0" style="width: 60px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              </label>
            </div>
          </div>

          <!-- Белый список -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">🔒 Белый список</div>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--app-text-secondary);">
              <input type="checkbox" id="whitelist_enabled" ${s.whitelist_enabled ? 'checked' : ''} />
              Включить белый список (только избранные могут обменивать)
            </label>
          </div>

          <!-- Системные -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">⚙️ Системные</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Время сброса:
                <input type="time" id="daily_reset_time" value="${s.daily_reset_time}" style="width: 90px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Срок токенов:
                <input type="number" id="token_expiry_days" value="${s.token_expiry_days}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                дней
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Мин токенов:
                <input type="number" id="min_tokens_for_request" value="${s.min_tokens_for_request}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                ⚡
              </label>
            </div>
          </div>

          <!-- Логи -->
          <div style="background: var(--app-bg-tertiary); padding: 14px; border-radius: 10px; grid-column: span 2;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--app-text-primary);">📋 Хранение логов</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Системные:
                <input type="number" id="log_retention_days" value="${s.log_retention_days}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                дней
              </label>
              <label style="font-size: 13px; color: var(--app-text-secondary); display: flex; align-items: center; gap: 6px;">
                Аудит:
                <input type="number" id="audit_log_retention_days" value="${s.audit_log_retention_days}" min="1" style="width: 50px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--app-border-color); background: var(--app-bg-tertiary); color: var(--app-text-primary);">
                дней
              </label>
            </div>
          </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="window.adminModule.saveSettings()" style="padding: 10px 20px;">
            💾 Сохранить настройки
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('settings')" style="padding: 10px 20px;">
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
