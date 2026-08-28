// ============================================
// src/modules/admin/tabs/AdminAuditTab.ts
// Аудит экономических операций
// Версия: 1.0.1 — добавлена привязка к window
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';
import { adminRegistry } from '../core/admin-registry';

interface IAuditLog {
  id: string;
  user_id: number;
  username?: string;
  event_type: string;
  source: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  metadata: any;
  currency: string;
  created_at: string;
}

export class AdminAuditTab implements IAdminTab {
  id = 'audit';
  label = '📜 Аудит';
  icon = '📜';
  priority = 70;

  private logs: IAuditLog[] = [];
  private total: number = 0;
  private loading: boolean = false;
  private page: number = 0;
  private pageSize: number = 50;
  private filters = {
    userId: '',
    eventType: '',
    source: '',
    from: '',
    to: '',
  };

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    return `
      <div class="admin-audit-tab">
        <div class="admin-section">
          <h3>📜 Аудит экономических операций</h3>
          <p class="hint">Просмотр всех начислений и списаний монет.</p>

          <!-- Фильтры -->
          <div class="filters-grid">
            <div class="filter-group">
              <label>👤 Пользователь</label>
              <input 
                type="number" 
                id="audit-user-filter" 
                placeholder="Telegram ID"
                value="${this.filters.userId}"
              />
            </div>
            <div class="filter-group">
              <label>🏷️ Тип операции</label>
              <select id="audit-type-filter">
                <option value="">Все</option>
                <option value="EARN" ${this.filters.eventType === 'EARN' ? 'selected' : ''}>📈 Начисление</option>
                <option value="SPEND" ${this.filters.eventType === 'SPEND' ? 'selected' : ''}>📉 Списание</option>
                <option value="ADJUST" ${this.filters.eventType === 'ADJUST' ? 'selected' : ''}>⚙️ Корректировка</option>
                <option value="REFUND" ${this.filters.eventType === 'REFUND' ? 'selected' : ''}>🔄 Возврат</option>
              </select>
            </div>
            <div class="filter-group">
              <label>📅 С</label>
              <input type="date" id="audit-from-filter" value="${this.filters.from}" />
            </div>
            <div class="filter-group">
              <label>📅 По</label>
              <input type="date" id="audit-to-filter" value="${this.filters.to}" />
            </div>
            <div class="filter-group" style="grid-column: span 2;">
              <label>🔍 Источник</label>
              <input 
                type="text" 
                id="audit-source-filter" 
                placeholder="quest:daily_login, game:tetris, etc."
                value="${this.filters.source}"
              />
            </div>
          </div>

          <div class="filter-actions">
            <button class="btn btn-primary" onclick="window.AdminAuditTab.applyFilters()">
              🔍 Применить
            </button>
            <button class="btn btn-secondary" onclick="window.AdminAuditTab.resetFilters()">
              🔄 Сбросить
            </button>
          </div>

          <!-- Сводка -->
          <div class="audit-summary">
            <div class="summary-item">
              <span class="label">Всего операций</span>
              <span class="value" id="audit-total">${this.total}</span>
            </div>
            <div class="summary-item">
              <span class="label">📈 Начислено</span>
              <span class="value positive" id="audit-total-earned">
                ${this.calcTotal('EARN')} 🪙
              </span>
            </div>
            <div class="summary-item">
              <span class="label">📉 Списано</span>
              <span class="value negative" id="audit-total-spent">
                ${this.calcTotal('SPEND')} 🪙
              </span>
            </div>
            <div class="summary-item">
              <span class="label">📊 Чистый прирост</span>
              <span class="value" id="audit-net-change">
                ${this.calcNet()} 🪙
              </span>
            </div>
          </div>

          <!-- Список транзакций -->
          <div class="audit-list" id="audit-list">
            ${this.renderLogs()}
          </div>

          <!-- Пагинация -->
          <div class="audit-pagination">
            <button class="btn btn-sm btn-secondary" onclick="window.AdminAuditTab.prevPage()" ${this.page === 0 ? 'disabled' : ''}>
              ◀ Назад
            </button>
            <span class="page-info">Страница ${this.page + 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="window.AdminAuditTab.nextPage()" ${this.logs.length < this.pageSize ? 'disabled' : ''}>
              Вперед ▶
            </button>
          </div>

          <div class="admin-actions">
            <button class="btn btn-secondary" onclick="window.AdminAuditTab.refresh()">
              🔄 Обновить
            </button>
            <button class="btn btn-secondary" onclick="window.AdminAuditTab.exportCSV()">
              📥 Экспорт CSV
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderLogs(): string {
    if (this.logs.length === 0) {
      return `<div class="empty-state">📭 Нет операций за выбранный период</div>`;
    }

    return `
      <table class="audit-table">
        <thead>
          <tr>
            <th>🕐 Время</th>
            <th>👤 Пользователь</th>
            <th>🏷️ Тип</th>
            <th>🔍 Источник</th>
            <th>💰 Сумма</th>
            <th>📊 Баланс</th>
            <th>📝 Детали</th>
          </tr>
        </thead>
        <tbody>
          ${this.logs.map(log => `
            <tr>
              <td>${new Date(log.created_at).toLocaleString()}</td>
              <td>
                <span class="user-link" onclick="window.AdminAuditTab.showUser('${log.user_id}')">
                  ${log.username || '👤 ' + log.user_id}
                </span>
              </td>
              <td>
                <span class="event-badge ${log.event_type.toLowerCase()}">
                  ${this.getEventLabel(log.event_type)}
                </span>
              </td>
              <td class="source-cell">${log.source}</td>
              <td class="${log.amount > 0 ? 'positive' : 'negative'}">
                ${log.amount > 0 ? '+' : ''}${log.amount} 🪙
              </td>
              <td>${log.balance_before} → ${log.balance_after}</td>
              <td class="details-cell">
                ${this.renderDetails(log.metadata)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  private getEventLabel(type: string): string {
    const labels: Record<string, string> = {
      'EARN': '📈 Начисление',
      'SPEND': '📉 Списание',
      'ADJUST': '⚙️ Корректировка',
      'REFUND': '🔄 Возврат',
    };
    return labels[type] || type;
  }

  private renderDetails(metadata: any): string {
    if (!metadata) return '—';
    const parts = [];
    if (metadata.reason) parts.push(`Причина: ${metadata.reason}`);
    if (metadata.quest_id) parts.push(`Квест: ${metadata.quest_id}`);
    if (metadata.game) parts.push(`Игра: ${metadata.game}`);
    if (metadata.streak) parts.push(`Стрик: ${metadata.streak}`);
    return parts.join(' • ') || '—';
  }

  private calcTotal(type: string): number {
    return this.logs
      .filter(l => l.event_type === type)
      .reduce((sum, l) => sum + Math.abs(l.amount), 0);
  }

  private calcNet(): number {
    const earned = this.calcTotal('EARN');
    const spent = this.calcTotal('SPEND');
    return earned - spent;
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;

    try {
      let url = `/economy/audit?limit=${this.pageSize}&offset=${this.page * this.pageSize}`;
      if (this.filters.userId) url += `&userId=${this.filters.userId}`;
      if (this.filters.eventType) url += `&type=${this.filters.eventType}`;
      if (this.filters.source) url += `&source=${encodeURIComponent(this.filters.source)}`;
      if (this.filters.from) url += `&from=${this.filters.from}`;
      if (this.filters.to) url += `&to=${this.filters.to}`;

      const response = await apiClient.get(url);
      if (response.success) {
        this.logs = response.logs || [];
        this.total = response.total || 0;
      }
    } catch (err) {
      console.error('[AdminAuditTab] Error loading audit:', err);
    } finally {
      this.loading = false;
    }
  }

  static async applyFilters(): Promise<void> {
    const tab = adminRegistry.getInstance('audit') as AdminAuditTab;
    if (!tab) return;

    tab.filters.userId = (document.getElementById('audit-user-filter') as HTMLInputElement)?.value || '';
    tab.filters.eventType = (document.getElementById('audit-type-filter') as HTMLSelectElement)?.value || '';
    tab.filters.source = (document.getElementById('audit-source-filter') as HTMLInputElement)?.value || '';
    tab.filters.from = (document.getElementById('audit-from-filter') as HTMLInputElement)?.value || '';
    tab.filters.to = (document.getElementById('audit-to-filter') as HTMLInputElement)?.value || '';
    tab.page = 0;

    await tab.loadData();
    const container = document.querySelector('.admin-audit-tab');
    if (container) {
      container.outerHTML = tab.render();
    }
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('🔍 Фильтры применены', 'info', 1500);
    }
  }

  static async resetFilters(): Promise<void> {
    const tab = adminRegistry.getInstance('audit') as AdminAuditTab;
    if (!tab) return;

    tab.filters = { userId: '', eventType: '', source: '', from: '', to: '' };
    tab.page = 0;

    await tab.loadData();
    const container = document.querySelector('.admin-audit-tab');
    if (container) {
      container.outerHTML = tab.render();
    }
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('🔄 Фильтры сброшены', 'info', 1500);
    }
  }

  static async showUser(userId: string): Promise<void> {
    const tab = adminRegistry.getInstance('audit') as AdminAuditTab;
    if (!tab) return;

    tab.filters.userId = userId;
    tab.page = 0;

    await tab.loadData();
    const container = document.querySelector('.admin-audit-tab');
    if (container) {
      container.outerHTML = tab.render();
    }
  }

  static async nextPage(): Promise<void> {
    const tab = adminRegistry.getInstance('audit') as AdminAuditTab;
    if (!tab) return;
    tab.page++;
    await tab.loadData();
    const container = document.querySelector('.admin-audit-tab');
    if (container) {
      container.outerHTML = tab.render();
    }
  }

  static async prevPage(): Promise<void> {
    const tab = adminRegistry.getInstance('audit') as AdminAuditTab;
    if (!tab || tab.page === 0) return;
    tab.page--;
    await tab.loadData();
    const container = document.querySelector('.admin-audit-tab');
    if (container) {
      container.outerHTML = tab.render();
    }
  }

  static async exportCSV(): Promise<void> {
    const tab = adminRegistry.getInstance('audit') as AdminAuditTab;
    if (!tab) return;

    try {
      const response = await apiClient.get(`/economy/audit/export`);
      if (response.success && response.url) {
        window.open(response.url, '_blank');
      }
    } catch (err) {
      console.error('[AdminAuditTab] Error exporting CSV:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка экспорта', 'error', 2000);
      }
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
    const container = document.querySelector('.admin-audit-tab');
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

// ✅ ПРИВЯЗЫВАЕМ К WINDOW
(window as any).AdminAuditTab = {
  applyFilters: AdminAuditTab.applyFilters,
  resetFilters: AdminAuditTab.resetFilters,
  showUser: AdminAuditTab.showUser,
  nextPage: AdminAuditTab.nextPage,
  prevPage: AdminAuditTab.prevPage,
  exportCSV: AdminAuditTab.exportCSV,
  refresh: () => {
    const tab = adminRegistry.getInstance('audit') as AdminAuditTab;
    if (tab) tab.refresh();
  }
};

// Регистрируем вкладку
adminRegistry.register('audit', AdminAuditTab);
