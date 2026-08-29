// ============================================
// src/modules/admin/tabs/AdminSubscriptionsTab.ts
// Управление тарифами подписок
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminSubscriptionsTab implements IAdminTab {
  id = 'subscriptions';
  label = 'Подписки';
  icon = '📦';
  priority = 50;

  private tiers: any[] = [];
  private loading = false;

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
    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <h3 style="margin:0;color:var(--app-text-primary)">📦 Тарифы подписок</h3>
          <button class="btn btn-primary" onclick="window.adminModule.createTier()" style="padding:8px 16px;font-size:13px">
            + Создать тариф
          </button>
        </div>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:8px;color:var(--app-text-tertiary)">Название</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Дней</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Цена (Stars)</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Токены</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Статус</th>
                <th style="text-align:center;padding:8px;color:var(--app-text-tertiary)">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${this.tiers.length === 0 ? `
                <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--app-text-tertiary)">Нет тарифов</td></tr>
              ` : this.tiers.map(t => `
                <tr style="border-bottom:1px solid var(--app-border-color-light)">
                  <td style="padding:8px;font-weight:500">
                    ${t.name || t.tier_key}
                    ${t.is_trial ? '<span style="font-size:11px;color:#d4af37"> (trial)</span>' : ''}
                  </td>
                  <td style="text-align:center;padding:8px">${t.days ?? '—'}</td>
                  <td style="text-align:center;padding:8px">${t.price_stars ?? '—'}</td>
                  <td style="text-align:center;padding:8px">${t.permanent_tokens ?? '—'}</td>
                  <td style="text-align:center;padding:8px">
                    <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${t.is_active ? 'background:rgba(39,174,96,0.15);color:#27ae60' : 'background:rgba(149,165,166,0.15);color:#95a5a6'}">
                      ${t.is_active ? 'Активен' : 'Выкл'}
                    </span>
                  </td>
                  <td style="text-align:center;padding:8px;white-space:nowrap">
                    <button onclick="window.adminModule.editTier('${t.id}')" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px">✏️</button>
                    <button onclick="window.adminModule.toggleTier('${t.id}', ${!t.is_active})" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px">${t.is_active ? '⏸' : '▶️'}</button>
                    <button onclick="window.adminModule.deleteTier('${t.id}')" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:rgba(231,76,60,0.15);color:#e74c3c;cursor:pointer;margin:0 2px">🗑</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:16px">
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('subscriptions')" style="padding:8px 16px;font-size:13px">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  async create(): Promise<void> {
    const name = prompt('Название тарифа:');
    if (!name) return;
    const days = parseInt(prompt('Количество дней:', '30') || '30', 10);
    const price = parseInt(prompt('Цена в Stars:', '100') || '100', 10);
    const tokens = parseInt(prompt('Постоянные токены:', '0') || '0', 10);

    try {
      const res = await apiClient.post('/admin/economy/subscriptions', {
        name,
        name_en: name,
        tier_key: name.toLowerCase().replace(/\s+/g, '_'),
        days,
        price_stars: price,
        permanent_tokens: tokens,
        is_active: true,
        is_trial: false,
        is_one_time: false,
      });
      if (res.success) {
        this.tiers.push(res.tier || res);
      } else {
        alert(res.error || 'Ошибка создания');
      }
    } catch (e) {
      alert('Ошибка создания тарифа');
    }
  }

  async edit(id: string): Promise<void> {
    const t = this.tiers.find(x => x.id === id);
    if (!t) return;

    const price = prompt('Новая цена (Stars):', String(t.price_stars ?? 0));
    if (price === null) return;
    const tokens = prompt('Постоянные токены:', String(t.permanent_tokens ?? 0));
    if (tokens === null) return;

    try {
      const res = await apiClient.put(`/admin/economy/subscriptions`, {
        id,
        price_stars: parseInt(price, 10),
        permanent_tokens: parseInt(tokens, 10),
      });
      if (res.success) {
        t.price_stars = parseInt(price, 10);
        t.permanent_tokens = parseInt(tokens, 10);
      }
    } catch (e) {
      alert('Ошибка обновления');
    }
  }

  async toggle(id: string, state: boolean): Promise<void> {
    try {
      const res = await apiClient.put('/admin/economy/subscriptions', { id, is_active: state });
      if (res.success) {
        const t = this.tiers.find(x => x.id === id);
        if (t) t.is_active = state;
      }
    } catch (e) {
      alert('Ошибка');
    }
  }

  async remove(id: string): Promise<void> {
    if (!confirm('Удалить тариф?')) return;
    try {
      const res = await apiClient.delete(`/admin/economy/subscriptions?id=${id}`);
      if (res.success) {
        this.tiers = this.tiers.filter(t => t.id !== id);
      }
    } catch (e) {
      alert('Ошибка удаления');
    }
  }

  destroy(): void {}
}
