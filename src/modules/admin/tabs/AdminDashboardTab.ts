// ============================================
// src/modules/admin/tabs/AdminDashboardTab.ts
// Дашборд админ-панели (статистика)
// Версия: 1.0.1 — добавлена привязка к window
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';
import { adminRegistry } from '../core/admin-registry';

export class AdminDashboardTab implements IAdminTab {
  id = 'dashboard';
  label = '📊 Дашборд';
  icon = '📊';
  priority = 0;

  private data: any = null;
  private loading: boolean = false;

  async init(): Promise<void> {
    // Данные загружаются при показе
  }

  render(): string {
    const stats = this.data || {
      total_users: 0,
      premium_users: 0,
      trial_users: 0,
      total_coins: 0,
      total_tokens: 0,
      requests_today: 0,
      unique_users_today: 0,
      top_users: [],
    };

    return `
      <div class="admin-dashboard-tab">
        <!-- Ключевые показатели -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.total_users}</div>
            <div class="stat-label">👥 Всего пользователей</div>
          </div>
          <div class="stat-card premium">
            <div class="stat-value">${stats.premium_users}</div>
            <div class="stat-label">⭐ PRO подписка</div>
          </div>
          <div class="stat-card trial">
            <div class="stat-value">${stats.trial_users}</div>
            <div class="stat-label">🔓 Trial</div>
          </div>
          <div class="stat-card coins">
            <div class="stat-value">${stats.total_coins}</div>
            <div class="stat-label">🪙 Всего монет</div>
          </div>
          <div class="stat-card tokens">
            <div class="stat-value">${stats.total_tokens}</div>
            <div class="stat-label">⚡ Всего токенов</div>
          </div>
          <div class="stat-card requests">
            <div class="stat-value">${stats.requests_today}</div>
            <div class="stat-label">📨 Запросов сегодня</div>
          </div>
        </div>

        <!-- Топ пользователей -->
        <div class="top-users-section">
          <h4>🏆 Топ пользователей</h4>
          <div class="top-users-list">
            ${this.renderTopUsers(stats.top_users || [])}
          </div>
        </div>

        <div class="dashboard-actions">
          <button class="btn btn-secondary" onclick="window.AdminDashboardTab.refresh()">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  private renderTopUsers(users: any[]): string {
    if (!users || users.length === 0) {
      return `<div class="empty-state">Нет данных</div>`;
    }

    return users.map((user, index) => `
      <div class="top-user-item">
        <span class="rank">#${index + 1}</span>
        <span class="username">${user.username || 'Пользователь'}</span>
        <span class="coins">${user.coins || 0} 🪙</span>
        <span class="tokens">${user.tokens || 0} ⚡</span>
        <span class="role ${user.role}">${user.role}</span>
      </div>
    `).join('');
  }

  onShow(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      const response = await apiClient.get('/admin/stats');
      if (response.success) {
        this.data = response.stats;
      }
    } catch (err) {
      console.error('[AdminDashboardTab] Error loading data:', err);
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
    const container = document.querySelector('.admin-dashboard-tab');
    if (container) {
      container.outerHTML = this.render();
    }
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('🔄 Данные обновлены', 'info', 1500);
    }
  }

  destroy(): void {
    // Очистка
  }
}

// ✅ ПРИВЯЗЫВАЕМ К WINDOW
(window as any).AdminDashboardTab = {
  refresh: () => {
    const tab = adminRegistry.getInstance('dashboard') as AdminDashboardTab;
    if (tab) tab.refresh();
  }
};

// Регистрируем вкладку
adminRegistry.register('dashboard', AdminDashboardTab);
