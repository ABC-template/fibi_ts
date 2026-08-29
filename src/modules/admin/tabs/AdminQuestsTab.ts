// ============================================
// src/modules/admin/tabs/AdminQuestsTab.ts
// Полноценное управление квестами
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

export class AdminQuestsTab implements IAdminTab {
  id = 'quests';
  label = 'Квесты';
  icon = '🎯';
  priority = 30;

  private quests: any[] = [];
  private loading = false;
  private filterType = 'all';
  private filterActive = 'all';

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/quests');
      if (res.success) this.quests = res.quests || [];
    } catch (e) {
      console.error('[AdminQuestsTab]', e);
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

  setFilter(kind: 'type' | 'active', value: string): void {
    if (kind === 'type') this.filterType = value;
    else this.filterActive = value;
  }

  private getFiltered() {
    return this.quests.filter(q => {
      if (this.filterType !== 'all' && q.type !== this.filterType) return false;
      if (this.filterActive === 'active' && !q.is_active) return false;
      if (this.filterActive === 'inactive' && q.is_active) return false;
      return true;
    });
  }

  render(): string {
    const filtered = this.getFiltered();
    const activeCount = this.quests.filter(q => q.is_active).length;

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <h3 style="margin:0;color:var(--app-text-primary)">🎯 Квесты (${this.quests.length})</h3>
          <button class="btn btn-primary" onclick="window.adminModule.createQuest()" style="padding:8px 16px;font-size:13px">
            + Создать
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:20px;font-weight:700">${this.quests.length}</div>
            <div style="font-size:11px;color:var(--app-text-tertiary)">Всего</div>
          </div>
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:#27ae60">${activeCount}</div>
            <div style="font-size:11px;color:var(--app-text-tertiary)">Активных</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <select onchange="window.adminModule.setQuestFilter('type', this.value)" style="padding:6px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:13px">
            <option value="all" ${this.filterType==='all'?'selected':''}>Все типы</option>
            <option value="daily" ${this.filterType==='daily'?'selected':''}>daily</option>
            <option value="sponsor" ${this.filterType==='sponsor'?'selected':''}>sponsor</option>
            <option value="achievement" ${this.filterType==='achievement'?'selected':''}>achievement</option>
            <option value="event" ${this.filterType==='event'?'selected':''}>event</option>
          </select>
          <select onchange="window.adminModule.setQuestFilter('active', this.value)" style="padding:6px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:13px">
            <option value="all" ${this.filterActive==='all'?'selected':''}>Все статусы</option>
            <option value="active" ${this.filterActive==='active'?'selected':''}>Активные</option>
            <option value="inactive" ${this.filterActive==='inactive'?'selected':''}>Неактивные</option>
          </select>
        </div>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">Название</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Тип</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Цель</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Награда</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Статус</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--app-text-tertiary)">Нет квестов</td></tr>` :
                filtered.map(q => {
                  const title = typeof q.title === 'object' ? (q.title?.ru || q.title?.en || q.external_id) : (q.title || q.external_id);
                  return `
                    <tr style="border-bottom:1px solid var(--app-border-color-light)">
                      <td style="padding:8px;font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${title}">
                        ${title}
                        <div style="font-size:10px;color:var(--app-text-tertiary)">${q.external_id}</div>
                      </td>
                      <td style="text-align:center;padding:6px 8px">
                        <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:rgba(52,152,219,0.15);color:#3498db">${q.type}</span>
                      </td>
                      <td style="text-align:center;padding:6px 8px">${q.target}</td>
                      <td style="text-align:center;padding:6px 8px;font-weight:700;color:#d4af37">${q.reward_coins} 🪙</td>
                      <td style="text-align:center;padding:6px 8px">
                        <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${q.is_active ? 'background:rgba(39,174,96,0.15);color:#27ae60' : 'background:rgba(149,165,166,0.15);color:#95a5a6'}">
                          ${q.is_active ? 'Активен' : 'Выкл'}
                        </span>
                      </td>
                      <td style="text-align:center;padding:6px 8px;white-space:nowrap">
                        <button onclick="window.adminModule.editQuest('${q.id}')" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px">✏️</button>
                        <button onclick="window.adminModule.toggleQuest('${q.id}', ${!q.is_active})" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px">${q.is_active ? '⏸' : '▶️'}</button>
                        <button onclick="window.adminModule.deleteQuest('${q.id}')" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:rgba(231,76,60,0.15);color:#e74c3c;cursor:pointer;margin:0 2px">🗑</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:16px">
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('quests')" style="padding:8px 16px;font-size:13px">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  async toggleActive(id: string, state: boolean): Promise<void> {
    try {
      const res = await apiClient.patch(`/admin/quests/${id}`, { is_active: state });
      if (res.success) {
        const q = this.quests.find(x => x.id === id);
        if (q) q.is_active = state;
      }
    } catch (e) {
      alert('Ошибка изменения статуса');
    }
  }

  async remove(id: string): Promise<void> {
    if (!confirm('Удалить квест и весь прогресс пользователей?')) return;
    try {
      const res = await apiClient.delete(`/admin/quests/${id}`);
      if (res.success) {
        this.quests = this.quests.filter(q => q.id !== id);
      }
    } catch (e) {
      alert('Ошибка удаления');
    }
  }

  async create(): Promise<void> {
    const externalId = prompt('external_id:');
    if (!externalId) return;
    const type = prompt('type (daily/sponsor/achievement/event):', 'daily') || 'daily';
    const target = parseInt(prompt('target:', '1') || '1', 10);
    const reward = parseInt(prompt('reward_coins:', '10') || '10', 10);
    const title = prompt('Название (RU):', externalId) || externalId;

    try {
      const res = await apiClient.post('/admin/quests', {
        external_id: externalId,
        type,
        category: 'general',
        target,
        reward_coins: reward,
        title: { ru: title, en: title },
        description: { ru: '', en: '' },
        reset_type: type === 'daily' ? 'daily' : 'none',
        verification_type: type === 'sponsor' ? 'manual' : 'auto',
        is_active: true,
      });
      if (res.success) {
        this.quests.push(res.quest || res);
      } else {
        alert(res.error || 'Ошибка создания');
      }
    } catch (e) {
      alert('Ошибка создания квеста');
    }
  }

  async edit(id: string): Promise<void> {
    const q = this.quests.find(x => x.id === id);
    if (!q) return;

    const reward = prompt('Новая награда:', String(q.reward_coins));
    if (reward === null) return;
    const target = prompt('Новая цель:', String(q.target));
    if (target === null) return;

    try {
      const res = await apiClient.patch(`/admin/quests/${id}`, {
        reward_coins: parseInt(reward, 10),
        target: parseInt(target, 10),
      });
      if (res.success) {
        q.reward_coins = parseInt(reward, 10);
        q.target = parseInt(target, 10);
      }
    } catch (e) {
      alert('Ошибка обновления');
    }
  }

  destroy(): void {}
}
