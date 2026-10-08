// ============================================
// src/modules/admin/tabs/AdminSubscriptionsTab.ts
// Управление тарифами (подписки + лимиты токенов)
// Версия: 2.0.0
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminSubscriptionsTab implements IAdminTab {
  id = 'subscriptions';
  label = 'Тарифы';
  icon = '📦';
  priority = 50;

  private tiers: any[] = [];
  private loading = false;
  private saving = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/economy/subscriptions');
      if (res.success) this.tiers = res.tiers || res.subscriptions || [];
    } catch (e) {
      console.error('[AdminSubscriptionsTab]', e);
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
    if (this.loading && this.tiers.length === 0) {
      return `<div style="padding:40px;text-align:center;color:var(--app-text-tertiary)">⏳ Загрузка тарифов...</div>`;
    }

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:12px">
          <div>
            <h3 style="margin:0 0 4px;color:var(--app-text-primary)">📦 Тарифы</h3>
            <p style="margin:0;color:var(--app-text-tertiary);font-size:12px">
              Бонус/день сбрасывается ежедневно. Постоянные — при покупке. Лимит/сутки — макс. списание за день (0 = без лимита).
            </p>
          </div>
          <button class="btn btn-primary" onclick="window.adminModule.createTier()" style="padding:8px 16px;font-size:13px">
            + Создать тариф
          </button>
        </div>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:720px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:8px;color:var(--app-text-tertiary)">Название</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Дней</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Цена ★</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Бонус/день</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Постоянные</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Лимит/сутки</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Активен</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${this.tiers.length === 0 ? `
                <tr><td colspan="8" style="text-align:center;padding:30px;color:var(--app-text-tertiary)">Нет тарифов</td></tr>
              ` : this.tiers.map((t, idx) => `
                <tr style="border-bottom:1px solid var(--app-border-color-light)">
                  <td style="padding:8px;font-weight:500">
                    ${t.name || t.tier_key}
                    ${t.is_trial ? '<span style="font-size:10px;color:#d4af37"> trial</span>' : ''}
                    <div style="font-size:10px;color:var(--app-text-tertiary);margin-top:2px">${t.tier_key}</div>
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${t.days ?? 0}" data-idx="${idx}" data-field="days"
                      style="width:56px;padding:4px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${t.price_stars ?? 0}" data-idx="${idx}" data-field="price_stars"
                      style="width:64px;padding:4px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${t.bonus_tokens_per_day ?? 0}" data-idx="${idx}" data-field="bonus_tokens_per_day"
                      style="width:64px;padding:4px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${t.permanent_tokens ?? 0}" data-idx="${idx}" data-field="permanent_tokens"
                      style="width:64px;padding:4px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="number" value="${t.daily_spend_limit ?? 0}" data-idx="${idx}" data-field="daily_spend_limit"
                      style="width:64px;padding:4px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);text-align:center"
                      title="0 = без лимита">
                  </td>
                  <td style="text-align:center;padding:6px">
                    <input type="checkbox" ${t.is_active ? 'checked' : ''} data-idx="${idx}" data-field="is_active"
                      style="width:18px;height:18px">
                  </td>
                  <td style="text-align:center;padding:6px;white-space:nowrap">
                    <button onclick="window.adminModule.saveTierRow(${idx})" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:rgba(39,174,96,0.15);color:#27ae60;cursor:pointer;margin:0 2px" title="Сохранить">💾</button>
                    <button onclick="window.adminModule.deleteTier('${t.id}')" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:rgba(231,76,60,0.15);color:#e74c3c;cursor:pointer;margin:0 2px" title="Удалить">🗑</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="window.adminModule.saveAllTiers()" style="padding:8px 16px;font-size:13px" ${this.saving ? 'disabled' : ''}>
            ${this.saving ? '⏳ Сохранение...' : '💾 Сохранить все'}
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('subscriptions')" style="padding:8px 16px;font-size:13px">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  /** Собрать значения из инпутов в this.tiers */
  collectFromDOM(): void {
    const inputs = document.querySelectorAll('#admin-tab-content input[data-idx]');
    inputs.forEach((el: any) => {
      const idx = parseInt(el.dataset.idx, 10);
      const field = el.dataset.field;
      if (!this.tiers[idx]) return;
      if (el.type === 'checkbox') {
        this.tiers[idx][field] = el.checked;
      } else {
        this.tiers[idx][field] = parseInt(el.value, 10) || 0;
      }
    });
  }

  async saveRow(idx: number): Promise<void> {
    this.collectFromDOM();
    const t = this.tiers[idx];
    if (!t?.id) return;

    try {
      const res = await apiClient.put('/admin/economy/subscriptions', {
        id: t.id,
        name: t.name,
        name_en: t.name_en,
        days: t.days,
        price_stars: t.price_stars,
        permanent_tokens: t.permanent_tokens,
        bonus_tokens_per_day: t.bonus_tokens_per_day,
        daily_spend_limit: t.daily_spend_limit,
        is_active: t.is_active,
        is_trial: t.is_trial,
        is_one_time: t.is_one_time,
        sort_order: t.sort_order,
      });
      if (res.success) {
        alert('Тариф сохранён');
      } else {
        alert(res.error || 'Ошибка сохранения');
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка сохранения тарифа');
    }
  }

  async saveAll(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.collectFromDOM();

    try {
      for (const t of this.tiers) {
        if (!t.id) continue;
        await apiClient.put('/admin/economy/subscriptions', {
          id: t.id,
          name: t.name,
          name_en: t.name_en,
          days: t.days,
          price_stars: t.price_stars,
          permanent_tokens: t.permanent_tokens,
          bonus_tokens_per_day: t.bonus_tokens_per_day,
          daily_spend_limit: t.daily_spend_limit,
          is_active: t.is_active,
          is_trial: t.is_trial,
          is_one_time: t.is_one_time,
          sort_order: t.sort_order,
        });
      }
      alert('Все тарифы сохранены');
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Ошибка сохранения');
    } finally {
      this.saving = false;
    }
  }

  destroy(): void {}
}
