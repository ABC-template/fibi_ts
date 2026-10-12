// ============================================
// src/modules/admin/tabs/AdminDashboardTab.ts
// Версия: 2.0.0 — плитки по новой статистике: пользователи, квесты, энергия
//                  и недоплаты за 7 дней, монеты, рефералы, реклама сегодня
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminDashboardTab implements IAdminTab {
  id = 'dashboard';
  label = 'Дашборд';
  icon = '📊';
  priority = 10;

  private stats: any = null;
  private loading = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/stats');
      if (res.success) this.stats = res.stats || res;
    } catch (e) {
      console.error('[AdminDashboardTab]', e);
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

  private tile(value: unknown, label: string, color = ''): string {
    const v = value === undefined || value === null ? '—' : String(value);
    return `
      <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:22px;font-weight:700;${color ? `color:${color}` : ''}">${v}</div>
        <div style="font-size:11px;color:var(--app-text-tertiary);margin-top:2px">${label}</div>
      </div>`;
  }

  private section(title: string, tiles: string[]): string {
    return `
      <div style="font-size:12px;font-weight:600;color:var(--app-text-secondary);margin:14px 0 8px">${title}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">${tiles.join('')}</div>`;
  }

  render(): string {
    if (this.loading && !this.stats) {
      return `<div style="padding:40px;text-align:center;color:var(--app-text-tertiary)">⏳ Загрузка...</div>`;
    }

    const s = this.stats || {};
    const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('ru-RU') : n);

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 4px;color:var(--app-text-primary)">📊 Дашборд</h3>

        ${this.section('👤 Пользователи', [
          this.tile(fmt(s.total_users), 'Всего'),
          this.tile(fmt(s.active_users_7d), 'Заходили за 7 дней', '#27ae60'),
          this.tile(fmt(s.premium_users), 'Premium (активные)', '#d4af37'),
          this.tile(fmt(s.trial_users), 'Trial'),
        ])}

        ${this.section('⚡ Энергия за 7 дней', [
          this.tile(fmt(s.energy_spent_7d), 'Списано'),
          this.tile(fmt(s.shortfall_count_7d), 'Недоплат', s.shortfall_count_7d ? '#e67e22' : ''),
          this.tile(fmt(s.shortfall_energy_7d), 'Недоплачено ⚡', s.shortfall_energy_7d ? '#e74c3c' : ''),
        ])}

        ${this.section('🪙 Монеты за 7 дней', [
          this.tile(fmt(s.coins_earned_7d), 'Начислено', '#27ae60'),
          this.tile(fmt(s.coins_spent_7d), 'Потрачено'),
          this.tile(fmt(s.ad_views_today), 'Реклама сегодня'),
          this.tile(fmt(s.ad_coins_today), '🪙 за рекламу сегодня'),
        ])}

        ${this.section('📋 Задания и рефералы', [
          this.tile(fmt(s.total_quests), 'Квестов'),
          this.tile(fmt(s.active_quests), 'Активных', '#27ae60'),
          this.tile(fmt(s.referrals_pending), 'Рефералов ждут'),
          this.tile(fmt(s.referrals_rewarded), 'Награждено'),
        ])}

        <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('dashboard')" style="padding:8px 16px;font-size:13px;margin-top:16px">
          🔄 Обновить
        </button>
      </div>
    `;
  }

  destroy(): void {}
}
