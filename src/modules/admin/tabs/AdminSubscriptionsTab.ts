// ============================================
// src/modules/admin/tabs/AdminSubscriptionsTab.ts
// Управление тарифами подписки
// Версия: 1.0.1 — исправлен confirm
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

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
  label = '📦 Подписки';
  icon = '📦';
  priority = 50;

  private tiers: ITier[] = [];
  private loading: boolean = false;
  private saving: boolean = false;
  private editing: ITier | null = null;
  private showForm: boolean = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  render(): string {
    return `
      <div class="admin-subscriptions-tab">
        <div class="admin-section">
          <div class="section-header">
            <h3>📦 Тарифы подписки</h3>
            <button class="btn btn-primary" onclick="AdminSubscriptionsTab.showCreateForm()">
              ➕ Добавить тариф
            </button>
          </div>
          <p class="hint">
            Управление тарифами подписки. Цены указываются в ⭐ Stars.
          </p>

          ${this.showForm ? this.renderForm() : ''}

          <div class="tiers-table-wrapper">
            <table class="tiers-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Дней</th>
                  <th>Цена ⭐</th>
                  <th>Постоянных ⚡</th>
                  <th>Пробный</th>
                  <th>1 раз</th>
                  <th>Активен</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                ${this.tiers.map(tier => `
                  <tr>
                    <td>
                      <strong>${tier.name}</strong>
                      <span class="tier-key">${tier.tier_key}</span>
                    </td>
                    <td>${tier.days}</td>
                    <td>${tier.price_stars} ⭐</td>
                    <td>${tier.permanent_tokens} ⚡</td>
                    <td>${tier.is_trial ? '✅' : '—'}</td>
                    <td>${tier.is_one_time ? '✅' : '—'}</td>
                    <td>${tier.is_active ? '✅' : '❌'}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="AdminSubscriptionsTab.edit('${tier.id}')">
                        ✏️
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="AdminSubscriptionsTab.deleteTier('${tier.id}')">
                        🗑️
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="admin-actions">
            <button class="btn btn-secondary" onclick="AdminSubscriptionsTab.refresh()">
              🔄 Обновить
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderForm(): string {
    const t = this.editing || {
      tier_key: '',
      name: '',
      name_en: '',
      days: 30,
      price_stars: 5,
      permanent_tokens: 100,
      is_active: true,
      is_trial: false,
      is_one_time: false,
      description: '',
      sort_order: 0,
    };

    const isEdit = !!this.editing?.id;

    return `
      <div class="tier-form">
        <h4>${isEdit ? '✏️ Редактировать тариф' : '➕ Новый тариф'}</h4>
        
        <div class="form-grid">
          <div class="form-group">
            <label>Ключ тарифа *</label>
            <input 
              type="text" 
              id="tier_key" 
              value="${t.tier_key}"
              ${isEdit ? 'readonly' : ''}
              placeholder="trial, basic, pro, ultimate"
            />
          </div>
          
          <div class="form-group">
            <label>Название (RU) *</label>
            <input type="text" id="name" value="${t.name}" placeholder="Пробный, Базовый, PRO" />
          </div>
          
          <div class="form-group">
            <label>Название (EN) *</label>
            <input type="text" id="name_en" value="${t.name_en}" placeholder="Trial, Basic, Pro" />
          </div>
          
          <div class="form-group">
            <label>Дней *</label>
            <input type="number" id="days" value="${t.days}" min="1" />
          </div>
          
          <div class="form-group">
            <label>Цена ⭐ *</label>
            <input type="number" id="price_stars" value="${t.price_stars}" min="0" />
          </div>
          
          <div class="form-group">
            <label>Постоянных токенов</label>
            <input type="number" id="permanent_tokens" value="${t.permanent_tokens}" min="0" />
          </div>
          
          <div class="form-group">
            <label>Порядок сортировки</label>
            <input type="number" id="sort_order" value="${t.sort_order}" min="0" />
          </div>
          
          <div class="form-group">
            <label>Описание</label>
            <input type="text" id="description" value="${t.description || ''}" placeholder="Описание тарифа" />
          </div>
        </div>
        
        <div class="form-checkboxes">
          <label>
            <input type="checkbox" id="is_active" ${t.is_active ? 'checked' : ''} />
            Активен
          </label>
          <label>
            <input type="checkbox" id="is_trial" ${t.is_trial ? 'checked' : ''} />
            Пробный период
          </label>
          <label>
            <input type="checkbox" id="is_one_time" ${t.is_one_time ? 'checked' : ''} />
            Только 1 раз
          </label>
        </div>
        
        <div class="form-actions">
          <button class="btn btn-primary" onclick="AdminSubscriptionsTab.saveTier()">
            💾 ${isEdit ? 'Обновить' : 'Создать'}
          </button>
          <button class="btn btn-secondary" onclick="AdminSubscriptionsTab.cancelForm()">
            ✕ Отмена
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

  static showCreateForm(): void {
    const tab = adminRegistry.getInstance('subscriptions') as AdminSubscriptionsTab;
    if (tab) {
      tab.editing = null;
      tab.showForm = true;
      const container = document.querySelector('.admin-subscriptions-tab');
      if (container) {
        container.outerHTML = tab.render();
      }
    }
  }

  static edit(id: string): void {
    const tab = adminRegistry.getInstance('subscriptions') as AdminSubscriptionsTab;
    if (tab) {
      const tier = tab.tiers.find(t => t.id === id);
      if (tier) {
        tab.editing = tier;
        tab.showForm = true;
        const container = document.querySelector('.admin-subscriptions-tab');
        if (container) {
          container.outerHTML = tab.render();
        }
      }
    }
  }

  static cancelForm(): void {
    const tab = adminRegistry.getInstance('subscriptions') as AdminSubscriptionsTab;
    if (tab) {
      tab.editing = null;
      tab.showForm = false;
      const container = document.querySelector('.admin-subscriptions-tab');
      if (container) {
        container.outerHTML = tab.render();
      }
    }
  }

  static async saveTier(): Promise<void> {
    const tab = adminRegistry.getInstance('subscriptions') as AdminSubscriptionsTab;
    if (!tab) return;

    const isEdit = !!tab.editing?.id;

    const data = {
      tier_key: (document.getElementById('tier_key') as HTMLInputElement)?.value.trim(),
      name: (document.getElementById('name') as HTMLInputElement)?.value.trim(),
      name_en: (document.getElementById('name_en') as HTMLInputElement)?.value.trim(),
      days: parseInt((document.getElementById('days') as HTMLInputElement)?.value || '0'),
      price_stars: parseInt((document.getElementById('price_stars') as HTMLInputElement)?.value || '0'),
      permanent_tokens: parseInt((document.getElementById('permanent_tokens') as HTMLInputElement)?.value || '0'),
      sort_order: parseInt((document.getElementById('sort_order') as HTMLInputElement)?.value || '0'),
      description: (document.getElementById('description') as HTMLInputElement)?.value.trim() || null,
      is_active: (document.getElementById('is_active') as HTMLInputElement)?.checked ?? true,
      is_trial: (document.getElementById('is_trial') as HTMLInputElement)?.checked ?? false,
      is_one_time: (document.getElementById('is_one_time') as HTMLInputElement)?.checked ?? false,
    };

    if (!data.tier_key || !data.name || !data.name_en || data.days <= 0) {
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Заполните все обязательные поля', 'error', 2000);
      }
      return;
    }

    try {
      let response;
      if (isEdit) {
        response = await apiClient.put('/admin/economy/subscriptions', { id: tab.editing!.id, ...data });
      } else {
        response = await apiClient.post('/admin/economy/subscriptions', data);
      }

      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast(
            isEdit ? '✅ Тариф обновлён' : '✅ Тариф создан',
            'success',
            2000
          );
        }
        tab.editing = null;
        tab.showForm = false;
        await tab.loadData();
        const container = document.querySelector('.admin-subscriptions-tab');
        if (container) {
          container.outerHTML = tab.render();
        }
      } else {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('⚠️ Ошибка сохранения', 'error', 2000);
        }
      }
    } catch (err) {
      console.error('[AdminSubscriptionsTab] Error saving tier:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка сервера', 'error', 2000);
      }
    }
  }

  static async deleteTier(id: string): Promise<void> {
    const userConfirmed = await new Promise<boolean>((resolve) => {
      if ((window as any).tg?.showConfirm) {
        (window as any).tg.showConfirm(
          'Удалить этот тариф? Пользователи с активной подпиской не пострадают.',
          (ok: boolean) => resolve(ok)
        );
      } else {
        resolve(window.confirm('Удалить этот тариф?'));
      }
    });

    if (!userConfirmed) return;

    try {
      const response = await apiClient.delete(`/admin/economy/subscriptions?id=${id}`);
      if (response.success) {
        if ((window as any).uiRenderer) {
          (window as any).uiRenderer.showToast('🗑️ Тариф удалён', 'info', 2000);
        }
        const tab = adminRegistry.getInstance('subscriptions') as AdminSubscriptionsTab;
        if (tab) {
          await tab.loadData();
          const container = document.querySelector('.admin-subscriptions-tab');
          if (container) {
            container.outerHTML = tab.render();
          }
        }
      }
    } catch (err) {
      console.error('[AdminSubscriptionsTab] Error deleting tier:', err);
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('⚠️ Ошибка удаления', 'error', 2000);
      }
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
    const container = document.querySelector('.admin-subscriptions-tab');
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
(AdminSubscriptionsTab as any).showCreateForm = AdminSubscriptionsTab.showCreateForm;
(AdminSubscriptionsTab as any).edit = AdminSubscriptionsTab.edit;
(AdminSubscriptionsTab as any).cancelForm = AdminSubscriptionsTab.cancelForm;
(AdminSubscriptionsTab as any).saveTier = AdminSubscriptionsTab.saveTier;
(AdminSubscriptionsTab as any).deleteTier = AdminSubscriptionsTab.deleteTier;
(AdminSubscriptionsTab as any).refresh = () => {
  const tab = adminRegistry.getInstance('subscriptions') as AdminSubscriptionsTab;
  if (tab) tab.refresh();
};

// Регистрируем вкладку
import { adminRegistry } from '../core/admin-registry';
adminRegistry.register('subscriptions', AdminSubscriptionsTab);
