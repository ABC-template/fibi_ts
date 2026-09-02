// ============================================
// src/modules/admin/tabs/AdminAgentsTab.ts
// Управление ИИ-агентами (вкладка в админ-панели)
// Версия: 2.0.0 — ПОЛНАЯ ВЕРСИЯ
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';
import type { IAiAgent, IAiAgentInput, AgentModality, ProTier } from '../../../../types/agents';

interface OpenRouterModelOption {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

export class AdminAgentsTab implements IAdminTab {
  id = 'agents';
  label = 'Агенты';
  icon = '🤖';
  priority = 25;

  private agents: IAiAgent[] = [];
  private loading = false;
  private filterModality = 'all';
  private filterActive = 'all';
  private currentEditingId: string | null = null;
  private availableModels: OpenRouterModelOption[] = [];

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/agents');
      if (res.success) this.agents = res.agents || [];
    } catch (e) {
      console.error('[AdminAgentsTab]', e);
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

  setFilter(kind: 'modality' | 'active', value: string): void {
    if (kind === 'modality') this.filterModality = value;
    else this.filterActive = value;
  }

  private getFiltered(): IAiAgent[] {
    return this.agents.filter(a => {
      if (this.filterModality !== 'all' && a.modality !== this.filterModality) return false;
      if (this.filterActive === 'active' && !a.is_active) return false;
      if (this.filterActive === 'inactive' && a.is_active) return false;
      return true;
    });
  }

  render(): string {
    const filtered = this.getFiltered();
    const activeCount = this.agents.filter(a => a.is_active).length;

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <h3 style="margin:0;color:var(--app-text-primary)">🤖 Агенты (${this.agents.length})</h3>
          <button class="btn btn-primary" onclick="window.adminModule.createAgent()" style="padding:8px 16px;font-size:13px">
            + Создать
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:20px;font-weight:700">${this.agents.length}</div>
            <div style="font-size:11px;color:var(--app-text-tertiary)">Всего</div>
          </div>
          <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:#27ae60">${activeCount}</div>
            <div style="font-size:11px;color:var(--app-text-tertiary)">Активных</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <select onchange="window.adminModule.setAgentFilter('modality', this.value)" style="padding:6px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:13px">
            <option value="all" ${this.filterModality === 'all' ? 'selected' : ''}>Все типы</option>
            <option value="text" ${this.filterModality === 'text' ? 'selected' : ''}>Текст</option>
            <option value="image" ${this.filterModality === 'image' ? 'selected' : ''}>Изображение</option>
            <option value="video" ${this.filterModality === 'video' ? 'selected' : ''}>Видео</option>
            <option value="audio" ${this.filterModality === 'audio' ? 'selected' : ''}>Аудио</option>
          </select>
          <select onchange="window.adminModule.setAgentFilter('active', this.value)" style="padding:6px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);font-size:13px">
            <option value="all" ${this.filterActive === 'all' ? 'selected' : ''}>Все статусы</option>
            <option value="active" ${this.filterActive === 'active' ? 'selected' : ''}>Активные</option>
            <option value="inactive" ${this.filterActive === 'inactive' ? 'selected' : ''}>Неактивные</option>
          </select>
        </div>

        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:2px solid var(--app-border-color)">
                <th style="text-align:left;padding:6px 8px;color:var(--app-text-tertiary)">Название</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Тип</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Модель</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Коэф.</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Мин.</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Статус</th>
                <th style="text-align:center;padding:6px 8px;color:var(--app-text-tertiary)">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0
                ? `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--app-text-tertiary)">Нет агентов</td></tr>`
                : filtered.map(a => {
                    const title = a.name?.ru || a.slug;
                    const modalityLabel: Record<string, string> = {
                      text: 'Текст',
                      image: 'Изобр.',
                      video: 'Видео',
                      audio: 'Аудио',
                    };
                    return `
                      <tr style="border-bottom:1px solid var(--app-border-color-light)">
                        <td style="padding:8px;font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${title}">
                          ${title}
                          ${a.is_system ? '<span style="font-size:10px;color:#d4af37;margin-left:4px">system</span>' : ''}
                          <div style="font-size:10px;color:var(--app-text-tertiary)">${a.slug}</div>
                        </td>
                        <td style="text-align:center;padding:6px 8px">
                          <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:rgba(52,152,219,0.15);color:#3498db">
                            ${modalityLabel[a.modality] || a.modality}
                          </span>
                        </td>
                        <td style="text-align:center;padding:6px 8px;font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${a.model_id}">
                          ${a.model_id}
                        </td>
                        <td style="text-align:center;padding:6px 8px;font-weight:600">×${a.markup_coefficient}</td>
                        <td style="text-align:center;padding:6px 8px">${a.min_charge}</td>
                        <td style="text-align:center;padding:6px 8px">
                          <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;${a.is_active
                            ? 'background:rgba(39,174,96,0.15);color:#27ae60'
                            : 'background:rgba(149,165,166,0.15);color:#95a5a6'}">
                            ${a.is_active ? 'Активен' : 'Выкл'}
                          </span>
                        </td>
                        <td style="text-align:center;padding:6px 8px;white-space:nowrap">
                          <button onclick="window.adminModule.editAgent('${a.id}')" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px">✏️</button>
                          <button onclick="window.adminModule.toggleAgent('${a.id}', ${!a.is_active})" style="padding:4px 8px;font-size:11px;border:none;border-radius:6px;background:var(--app-bg-tertiary);color:var(--app-text-primary);cursor:pointer;margin:0 2px">${a.is_active ? '⏸' : '▶️'}</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top:16px">
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('agents')" style="padding:8px 16px;font-size:13px">🔄 Обновить</button>
        </div>
      </div>
    `;
  }

  async toggleActive(id: string, state: boolean): Promise<void> {
    try {
      const res = await apiClient.patch(`/admin/agents/${id}`, { is_active: state });
      if (res.success) {
        const a = this.agents.find(x => x.id === id);
        if (a) a.is_active = state;
      }
    } catch (e) {
      alert('Ошибка изменения статуса');
    }
  }

  async create(): Promise<void> {
    this.currentEditingId = null;
    await this.openAgentModal();
  }

  async edit(id: string): Promise<void> {
    this.currentEditingId = id;
    const agent = this.agents.find(a => a.id === id);
    if (!agent) return;
    await this.openAgentModal(agent);
  }

  private async openAgentModal(agent?: IAiAgent): Promise<void> {
    const isEdit = !!agent;
    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = isEdit ? 'Редактировать агента' : 'Создать агента';

    const bodyEl = document.getElementById('modal-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = this.getFormHtml(agent);

    const footerEl = document.getElementById('modal-footer');
    if (footerEl) {
      footerEl.classList.remove('hidden');
      footerEl.innerHTML = `
        <button class="btn btn-secondary" id="agent-modal-cancel" style="padding:8px 16px">Отмена</button>
        <button class="btn btn-primary" id="agent-modal-save" style="padding:8px 16px">
          ${isEdit ? 'Сохранить' : 'Создать'}
        </button>
      `;
    }

    const modal = document.getElementById('universal-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }

    this.bindFormEvents(agent);
  }

  private getFormHtml(agent?: IAiAgent): string {
    const nameRu = agent?.name?.ru || '';
    const nameEn = agent?.name?.en || '';
    const nameIt = agent?.name?.it || '';
    const descRu = agent?.description?.ru || '';
    const modality = agent?.modality || 'text';
    const roles = agent?.allowed_roles || ['trial', 'pro', 'admin', 'creator'];

    return `
      <div style="display:flex;flex-direction:column;gap:16px;max-height:65vh;overflow-y:auto;padding-right:4px">
        <div>
          <div style="font-weight:600;font-size:13px;color:#d4af37;margin-bottom:8px">Название</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <input id="agent-name-ru" type="text" placeholder="Русский *" value="${this.esc(nameRu)}"
              style="padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
            <input id="agent-name-en" type="text" placeholder="English" value="${this.esc(nameEn)}"
              style="padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
            <input id="agent-name-it" type="text" placeholder="Italiano" value="${this.esc(nameIt)}"
              style="padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </div>
        </div>

        <div>
          <div style="font-weight:600;font-size:13px;color:#d4af37;margin-bottom:8px">Описание (необязательно)</div>
          <textarea id="agent-desc-ru" rows="2" placeholder="Русский"
            style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);resize:vertical">${this.esc(descRu)}</textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;color:var(--app-text-tertiary)">Slug *</label>
            <input id="agent-slug" type="text" value="${this.esc(agent?.slug || '')}" ${agent?.is_system ? 'readonly' : ''}
              style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </div>
          <div>
            <label style="font-size:12px;color:var(--app-text-tertiary)">Модальность *</label>
            <select id="agent-modality"
              style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
              <option value="text" ${modality === 'text' ? 'selected' : ''}>Текст</option>
              <option value="image" ${modality === 'image' ? 'selected' : ''}>Изображение</option>
              <option value="video" ${modality === 'video' ? 'selected' : ''}>Видео</option>
              <option value="audio" ${modality === 'audio' ? 'selected' : ''}>Аудио</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size:12px;color:var(--app-text-tertiary)">Модель OpenRouter *</label>
          <select id="agent-model"
            style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
            <option value="">Загрузка...</option>
          </select>
        </div>

        <div>
          <label style="font-size:12px;color:var(--app-text-tertiary)">Системный промпт *</label>
          <textarea id="agent-system-prompt" rows="5"
            style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary);resize:vertical">${this.esc(agent?.system_prompt || '')}</textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;color:var(--app-text-tertiary)">Коэффициент</label>
            <input id="agent-coefficient" type="number" min="1" step="0.1" value="${agent?.markup_coefficient ?? 3}"
              style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </div>
          <div>
            <label style="font-size:12px;color:var(--app-text-tertiary)">Мин. списание</label>
            <input id="agent-min-charge" type="number" min="0" step="10" value="${agent?.min_charge ?? 50}"
              style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </div>
        </div>

        <div>
          <div style="font-weight:600;font-size:13px;color:#d4af37;margin-bottom:8px">Доступ</div>
          <div style="display:flex;flex-wrap:wrap;gap:12px 20px;margin-bottom:10px">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" name="agent-role" value="trial" ${roles.includes('trial') ? 'checked' : ''}> trial
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" name="agent-role" value="pro" ${roles.includes('pro') ? 'checked' : ''}> pro
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" name="agent-role" value="admin" ${roles.includes('admin') ? 'checked' : ''}> admin
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="checkbox" name="agent-role" value="creator" ${roles.includes('creator') ? 'checked' : ''}> creator
            </label>
          </div>
          <div id="min-pro-tier-row" style="${roles.includes('pro') ? '' : 'display:none'}">
            <label style="font-size:12px;color:var(--app-text-tertiary)">Минимальный Pro-tier</label>
            <select id="agent-min-pro-tier"
              style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
              <option value="">Не требовать</option>
              <option value="basic" ${agent?.min_pro_tier === 'basic' ? 'selected' : ''}>basic</option>
              <option value="plus" ${agent?.min_pro_tier === 'plus' ? 'selected' : ''}>plus</option>
              <option value="ultra" ${agent?.min_pro_tier === 'ultra' ? 'selected' : ''}>ultra</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:20px;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="agent-is-active" ${agent?.is_active !== false ? 'checked' : ''}> Активен
          </label>
          <div>
            <label style="font-size:12px;color:var(--app-text-tertiary)">Порядок</label>
            <input id="agent-sort-order" type="number" value="${agent?.sort_order ?? 100}" style="width:80px;padding:6px 10px;border-radius:8px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)">
          </div>
        </div>
      </div>
    `;
  }

  private async bindFormEvents(agent?: IAiAgent): Promise<void> {
    document.getElementById('agent-modal-cancel')?.addEventListener('click', () => this.closeModal());
    document.getElementById('agent-modal-save')?.addEventListener('click', () => this.saveAgent());

    const modalitySelect = document.getElementById('agent-modality') as HTMLSelectElement;
    modalitySelect?.addEventListener('change', async () => {
      await this.loadModels(modalitySelect.value as AgentModality, agent?.model_id);
    });

    document.querySelectorAll('input[name="agent-role"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const proChecked = (document.querySelector('input[name="agent-role"][value="pro"]') as HTMLInputElement)?.checked;
        const row = document.getElementById('min-pro-tier-row');
        if (row) row.style.display = proChecked ? '' : 'none';
      });
    });

    if (!agent) {
      const nameRu = document.getElementById('agent-name-ru') as HTMLInputElement;
      const slug = document.getElementById('agent-slug') as HTMLInputElement;
      nameRu?.addEventListener('input', () => {
        if (slug && !slug.dataset.manual) slug.value = this.slugify(nameRu.value);
      });
      slug?.addEventListener('input', () => { slug.dataset.manual = 'true'; });
    }

    await this.loadModels((agent?.modality || 'text') as AgentModality, agent?.model_id);
  }

  private async loadModels(modality: AgentModality, selectedId?: string): Promise<void> {
    const select = document.getElementById('agent-model') as HTMLSelectElement;
    if (!select) return;
    select.innerHTML = '<option value="">Загрузка...</option>';
    select.disabled = true;
    try {
      const res = await apiClient.get(`/admin/agents/models?modality=${modality}`);
      this.availableModels = res.models || [];
      select.innerHTML = this.availableModels
        .map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${m.name} (${m.id})</option>`)
        .join('') || '<option value="">Нет моделей</option>';
    } catch (e) {
      select.innerHTML = '<option value="">Ошибка загрузки</option>';
    } finally {
      select.disabled = false;
    }
  }

  private async saveAgent(): Promise<void> {
    const nameRu = (document.getElementById('agent-name-ru') as HTMLInputElement)?.value?.trim();
    const slug = (document.getElementById('agent-slug') as HTMLInputElement)?.value?.trim().toLowerCase();
    const modality = (document.getElementById('agent-modality') as HTMLSelectElement)?.value as AgentModality;
    const modelId = (document.getElementById('agent-model') as HTMLSelectElement)?.value;
    const systemPrompt = (document.getElementById('agent-system-prompt') as HTMLTextAreaElement)?.value?.trim();

    if (!nameRu || !slug || !modality || !modelId || !systemPrompt) {
      alert('Заполните обязательные поля');
      return;
    }

    const allowedRoles: string[] = [];
    document.querySelectorAll('input[name="agent-role"]:checked').forEach(el => {
      allowedRoles.push((el as HTMLInputElement).value);
    });
    if (allowedRoles.length === 0) {
      alert('Выберите хотя бы одну роль');
      return;
    }

    const payload: IAiAgentInput = {
      slug,
      name: {
        ru: nameRu,
        en: (document.getElementById('agent-name-en') as HTMLInputElement)?.value?.trim() || undefined,
        it: (document.getElementById('agent-name-it') as HTMLInputElement)?.value?.trim() || undefined,
      },
      description: {
        ru: (document.getElementById('agent-desc-ru') as HTMLTextAreaElement)?.value?.trim() || undefined,
      },
      modality,
      model_id: modelId,
      system_prompt: systemPrompt,
      markup_coefficient: Number((document.getElementById('agent-coefficient') as HTMLInputElement)?.value) || 3,
      min_charge: Number((document.getElementById('agent-min-charge') as HTMLInputElement)?.value) || 50,
      allowed_roles: allowedRoles,
      min_pro_tier: (document.getElementById('agent-min-pro-tier') as HTMLSelectElement)?.value as ProTier || null,
      is_active: (document.getElementById('agent-is-active') as HTMLInputElement)?.checked,
      sort_order: Number((document.getElementById('agent-sort-order') as HTMLInputElement)?.value) || 100,
    };

    const saveBtn = document.getElementById('agent-modal-save') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
    }

    try {
      if (this.currentEditingId) {
        const res = await apiClient.patch(`/admin/agents/${this.currentEditingId}`, payload);
        if (res.success) {
          const idx = this.agents.findIndex(a => a.id === this.currentEditingId);
          if (idx !== -1) this.agents[idx] = res.agent;
        }
      } else {
        const res = await apiClient.post('/admin/agents', payload);
        if (res.success) this.agents.push(res.agent);
      }
      this.closeModal();
    } catch (e: any) {
      alert(e?.message || 'Ошибка сохранения');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = this.currentEditingId ? 'Сохранить' : 'Создать';
      }
    }
  }

  private closeModal(): void {
    const modal = document.getElementById('universal-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    this.currentEditingId = null;
  }

  private esc(str: string): string {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private slugify(text: string): string {
    const map: Record<string, string> = {
      'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
      'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
      'х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
    };
    return text.toLowerCase().split('').map(c => map[c] || c).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
  }

  destroy(): void {}
}
