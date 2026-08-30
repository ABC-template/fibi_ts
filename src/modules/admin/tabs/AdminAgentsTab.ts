// ============================================
// src/modules/admin/tabs/AdminAgentsTab.ts
// Описание: Вкладка управления ИИ-агентами
// Версия: 1.0.0
// ============================================

import { fetchAllAgents, createAgent, updateAgent, toggleAgentActive, fetchModelsByModality } from '../../../services/agents';
import type { IAiAgent, IAiAgentInput, AgentModality } from '../../../../types/agents';
// + ваши ui-хелперы, toast, modal и т.д.

export class AdminAgentsTab {
  private container: HTMLElement;
  private agents: IAiAgent[] = [];
  private isLoading = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.renderSkeleton();
    await this.loadAgents();
  }

  private async loadAgents(): Promise<void> {
    this.isLoading = true;
    try {
      this.agents = await fetchAllAgents();
      this.renderList();
    } catch (err) {
      console.error('Failed to load agents:', err);
      // showToast('Ошибка загрузки агентов', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  private renderSkeleton(): void {
    this.container.innerHTML = `
      <div class="admin-agents">
        <div class="admin-agents-header">
          <h2>Агенты</h2>
          <button class="btn btn-primary" id="btn-create-agent">+ Создать агента</button>
        </div>
        <div class="admin-agents-filters">
          <!-- фильтры по modality / статусу позже -->
        </div>
        <div class="admin-agents-list" id="agents-list">
          <div class="loading">Загрузка...</div>
        </div>
      </div>
    `;

    const createBtn = this.container.querySelector('#btn-create-agent');
    createBtn?.addEventListener('click', () => this.openCreateModal());
  }

  private renderList(): void {
    const listEl = this.container.querySelector('#agents-list');
    if (!listEl) return;

    if (this.agents.length === 0) {
      listEl.innerHTML = `<div class="empty">Агентов пока нет</div>`;
      return;
    }

    listEl.innerHTML = this.agents.map(agent => this.renderAgentRow(agent)).join('');

    // Навешиваем обработчики
    listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        this.openEditModal(id);
      });
    });

    listEl.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const current = this.agents.find(a => a.id === id);
        if (!current) return;
        try {
          await toggleAgentActive(id, !current.is_active);
          await this.loadAgents();
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  private renderAgentRow(agent: IAiAgent): string {
    const name = agent.name?.ru || agent.slug;
    const modalityLabel = {
      text: 'Текст',
      image: 'Изображение',
      video: 'Видео',
      audio: 'Аудио',
    }[agent.modality] || agent.modality;

    return `
      <div class="agent-row ${agent.is_active ? '' : 'inactive'}">
        <div class="agent-main">
          <div class="agent-title">
            ${name}
            ${agent.is_system ? '<span class="badge">system</span>' : ''}
          </div>
          <div class="agent-meta">
            <span>${agent.slug}</span>
            <span>${modalityLabel}</span>
            <span>×${agent.markup_coefficient}</span>
            <span>min ${agent.min_charge}</span>
          </div>
        </div>
        <div class="agent-actions">
          <button data-action="edit" data-id="${agent.id}">✏️</button>
          <button data-action="toggle" data-id="${agent.id}">
            ${agent.is_active ? '🟢' : '🔴'}
          </button>
        </div>
      </div>
    `;
  }

  private openCreateModal(): void {
    // TODO: открыть модалку создания
    console.log('Open create agent modal');
  }

  private openEditModal(id: string): void {
    // TODO: открыть модалку редактирования
    console.log('Open edit agent modal', id);
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
