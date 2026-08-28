// ============================================
// src/modules/admin/tabs/AdminSubscriptionsTab.ts
// Управление тарифами подписки
// Версия: 1.0.1 — исправлена привязка методов
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';
import { modalManager } from '@/core/modal-manager';
import { uiRenderer } from '@/modules/ui/renderer';

interface ITier {
  id: string;
  tier_key: string;
  name: string;
  name_en: string;
  days: number;
  price_stars: number;
  permanent_tokens: number;
  is_active: boolean;
  is_trial: boolean;
  is_one_time: boolean;
  description: string | null;
  sort_order: number;
}

export class AdminSubscriptionsTab implements IAdminTab {
  id = 'subscriptions';
  label = 'Подписки';
  icon = '📦';
  priority = 50;

  private tiers: ITier[] = [];
  private loading: boolean = false;
  private modalManager = modalManager;
  private uiRenderer = uiRenderer;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    if (this.tiers.length === 0) {
      return `
        <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
          <h3 style="margin: 0 0 16px 0; color: var(--app-text-primary);">📦 Тарифы подписки</h3>
          <div style="text-align: center; padding: 30px; color: var(--app-text-tertiary);">⏳ Загрузка данных...</div>
        </div>
      `;
    }

    return `
      <div style="background: var(--app-bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--app-border-color-light);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; color: var(--app-text-primary);">📦 Тарифы подписки</h3>
          <button class="btn btn-primary" onclick="window.adminModule.showTierForm()" style="padding: 6px 14px; font-size: 13px;">
            ➕ Добавить
          </button>
        </div>
        <p style="color: var(--app-text-tertiary); margin-bottom: 16px; font-size: 13px;">
          Цены указываются в ⭐ Stars.
        </p>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--app-border-color);">
                <th style="text-align: left; padding: 8px 10px; color: var(--app-text-tertiary);">Название</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Дней</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Цена ⭐</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">⚡ Токенов</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Пробный</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Активен</th>
                <th style="text-align: center; padding: 8px 10px; color: var(--app-text-tertiary);">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${this.tiers.map((tier: any) => `
                <tr style="border-bottom: 1px solid var(--app-border-color-light);">
                  <td style="padding: 8px 10px; font-weight: 600; color: var(--app-text-primary);">
                    ${tier.name}
                    <span style="font-size: 11px; color: var(--app-text-tertiary); font-weight: 400;">${tier.tier_key}</span>
                  </td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.days}</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.price_stars} ⭐</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.permanent_tokens}</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.is_trial ? '✅' : '—'}</td>
                  <td style="text-align: center; padding: 8px 10px;">${tier.is_active ? '✅' : '❌'}</td>
                  <td style="text-align: center; padding: 8px 10px;">
                    <button class="btn btn-sm btn-secondary" onclick="window.adminModule.editTier('${tier.id}')" style="padding: 2px 8px; font-size: 12px;">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.adminModule.deleteTier('${tier.id}')" style="padding: 2px 8px; font-size: 12px;">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.adminModule.switchTab('subscriptions')" style="padding: 10px 20px;">
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
      const response = await apiClient.get('/admin/economy/subscriptions');
      if (response.success) {
        this.tiers = response.tiers || [];
      }
    } catch (err) {
      console.error('[AdminSubscriptionsTab] Error loading tiers:', err);
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
