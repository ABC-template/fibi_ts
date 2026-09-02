// ============================================
// src/modules/agents/AgentsModule.ts
// Список ИИ-агентов для пользователя
// Версия: 1.1.0 — можно открыть чат без доступа, блок только на send
// ============================================

import { eventBus } from '@/core/event-bus';
import { chatStore } from '@/store/ChatStore';
import { uiRenderer } from '@/modules/ui/renderer';
import { fetchAgentsWithAccess } from '@/services/agents';
import type { IAiAgentWithAccess } from '@/types/agents';

export class AgentsModule {
  private container:
  private container: HTMLElement;
  private eventBus = eventBus;
  private chatStore = chatStore;
  private uiRenderer = uiRenderer;

  private _agents: IAiAgentWithAccess[] = [];
  private _loading = false;
  private _isShowing = false;
  private _subscriptions: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this._subscribe();
    await this.loadAgents();
    console.log('✅ AgentsModule v1.1.0 инициализирован');
  }

  private _subscribe(): void {
    const unsub = this.eventBus.on('agents:refresh', () => {
      this.loadAgents();
    }, this);
    this._subscriptions.push(unsub);
    console.log('📡 AgentsModule подписан на события');
  }

  async loadAgents(): Promise<void> {
    if (this._loading) return;
    this._loading = true;
    try {
      const data = await fetchAgentsWithAccess();
      this._agents = data.agents || [];
      console.log(`📋 [AgentsModule] Загружено ${this._agents.length} агентов`);
      if (this._isShowing) this.render();
      this.eventBus.emit('agents:access_updated', { agents: this._agents });
    } catch (err) {
      console.error('❌ [AgentsModule] Ошибка загрузки агентов:', err);
    } finally {
      this._loading = false;
    }
  }

  private getSortedAgents(): IAiAgentWithAccess[] {
    return [...this._agents].sort((a, b) => {
      if (a.has_access && !b.has_access) return -1;
      if (!a.has_access && b.has_access) return 1;
      return (a.sort_order || 100) - (b.sort_order || 100);
    });
  }

  private renderAgentCard(agent: IAiAgentWithAccess): HTMLElement {
    const hasAccess = agent.has_access;
    const accessReason = agent.access_reason;

    const modalityEmoji: Record<string, string> = {
      text: '💬',
      image: '🖼️',
      video: '🎬',
      audio: '🎧',
    };

    let accessInfo = '';
    if (!hasAccess) {
      if (accessReason === 'inactive') {
        accessInfo = 'Временно недоступен';
      } else if (accessReason === 'tier') {
        accessInfo = `Требуется: Pro (${agent.min_pro_tier})`;
      } else if (accessReason === 'role') {
        const roles = agent.allowed_roles?.filter(r => r !== 'trial') || [];
        accessInfo = roles.length ? `Требуется: ${roles.join(', ')}` : 'Требуется PRO';
      } else {
        if (agent.allowed_roles?.includes('trial')) {
          accessInfo = 'Доступ ограничен';
        } else if (agent.allowed_roles?.includes('pro')) {
          accessInfo = 'Требуется PRO';
        } else {
          accessInfo = 'Доступ ограничен';
        }
      }
    }

    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--app-bg-secondary);
      border: 1px solid ${hasAccess ? 'var(--app-border-color-light)' : 'var(--app-border-color)'};
      border-radius: 14px;
      padding: 14px 16px;
      opacity: ${agent.is_active ? '1' : '0.55'};
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    const title = agent.name?.ru || agent.slug;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:20px;">${modalityEmoji[agent.modality] || '🤖'}</span>
            <div style="font-weight:700;font-size:15px;color:var(--app-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${title}
            </div>
            ${!hasAccess ? '<span style="font-size:14px;">🔒</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--app-text-tertiary);margin-bottom:6px;">
            ${agent.description?.ru || agent.slug}
          </div>
          ${!hasAccess ? `
            <div style="font-size:11px;color:#d4af37;font-weight:600;">
              ${accessInfo}
            </div>
          ` : `
            <div style="font-size:11px;color:var(--app-text-tertiary);">
              ×${agent.markup_coefficient} · min ${agent.min_charge} ⚡
            </div>
          `}
        </div>
        <div>
          ${hasAccess
            ? `<button class="btn btn-primary" style="padding:8px 12px;font-size:12px;" data-action="start">Открыть</button>`
            : `<button class="btn btn-secondary" style="padding:8px 12px;font-size:12px;" data-action="start">
                 🔒 Открыть
               </button>`
          }
        </div>
      </div>
    `;

    // Можно открыть чат всегда (и с доступом, и без)
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="upgrade"]')) {
        this.showUpgradeModal(agent.id);
        return;
      }
      this.startChatWithAgent(agent.id);
    });

    return card;
  }

  /**
   * Согласованное поведение:
   * - чат можно открыть всегда
   * - отправка блокируется в ChatModule, если нет доступа
   */
  async startChatWithAgent(agentId: string): Promise<void> {
    console.log(`🚀 [AgentsModule] Запуск чата с агентом: ${agentId}`);

    const agent = this._agents.find(a => a.id === agentId);
    if (!agent) {
      this.uiRenderer?.showToast('⚠️ Агент не найден', 'error', 1500);
      return;
    }

    let existingChat = this.chatStore
      .getAllChats('all')
      .find(c => c.agent_id === agentId && !c.deleted_at);

    if (existingChat) {
      console.log(`📂 [AgentsModule] Найден существующий чат: ${existingChat.id}`);
      this.eventBus.emit('navigation:open_chat', {
        chatId: existingChat.id,
        topic: agent.slug,
      });
      this.hide();
      return;
    }

    const chat = this.chatStore.createTempChat(agent.slug as any);
    if (chat) {
      chat.agent_id = agentId;
      chat.modality = agent.modality;
      chat.title = agent.name?.ru || agent.slug;
      this.chatStore.save();

      console.log(`✅ [AgentsModule] Создан новый чат с агентом: ${chat.id}`);

      this.eventBus.emit('navigation:open_chat', {
        chatId: chat.id,
        topic: agent.slug,
      });
      this.hide();
    } else {
      this.uiRenderer?.showToast('⚠️ Не удалось создать чат', 'error', 1500);
    }
  }

  showUpgradeModal(agentId: string): void {
    const agent = this._agents.find(a => a.id === agentId);
    if (!agent) return;

    const isInactive = !agent.is_active;
    const reason = agent.access_reason;

    let title = '🔒 Доступ ограничен';
    let description = `Для использования агента "${agent.name?.ru || agent.slug}" требуется:`;

    if (isInactive) {
      title = '⏳ Агент временно недоступен';
      description = 'Этот агент отключён администратором. Попробуйте позже.';
    } else if (reason === 'role') {
      const roles = agent.allowed_roles?.filter(r => r !== 'trial') || [];
      description = `Требуется роль: ${roles.join(', ') || 'PRO'}`;
    } else if (reason === 'tier') {
      description = `Требуется подписка: Pro (${agent.min_pro_tier})`;
    }

    const content = `
      <div style="text-align: center; padding: 8px 0;">
        <div style="font-size: 56px; margin-bottom: 12px;">${isInactive ? '⏳' : '🔒'}</div>
        <div style="font-size: 20px; font-weight: 700; color: var(--app-text-primary);">${title}</div>
        <div style="font-size: 14px; color: var(--app-text-secondary); margin-top: 8px; line-height: 1.5;">
          ${description}
        </div>
        ${!isInactive ? `
          <div style="
            margin-top: 16px;
            background: var(--app-bg-tertiary);
            border-radius: 12px;
            padding: 12px;
            text-align: left;
          ">
            <div style="font-size: 12px; color: var(--app-text-tertiary);">
              💡 <strong>Как получить доступ?</strong>
            </div>
            <div style="font-size: 12px; color: var(--app-text-secondary); margin-top: 4px;">
              Оформите подходящую подписку в разделе экономики / подписок.
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    const modal = document.getElementById('universal-modal');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = content;
    if (modalFooter) {
      modalFooter.classList.remove('hidden');
      modalFooter.innerHTML = `
        <button class="btn btn-primary" id="agent-upgrade-btn" style="width:100%;padding:10px 16px;">
          ${isInactive ? 'Понятно' : '📈 Расширить возможности'}
        </button>
      `;
    }
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }

    document.getElementById('agent-upgrade-btn')?.addEventListener('click', () => {
      if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
      }
      if (!isInactive) {
        // Переход в экономику / подписки
        this.eventBus.emit('navigation:open_economy');
      }
    });
  }

  render(): void {
    const agents = this.getSortedAgents();

    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding: 16px; display:flex; flex-direction:column; gap:12px;';

    const header = document.createElement('div');
    header.innerHTML = `
      <h2 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:var(--app-text-primary);">🤖 Агенты</h2>
      <div style="font-size:13px;color:var(--app-text-tertiary);margin-bottom:8px;">
        Выберите агента для общения
      </div>
    `;
    wrapper.appendChild(header);

    if (this._loading) {
      const loading = document.createElement('div');
      loading.style.cssText = 'text-align:center;padding:40px;color:var(--app-text-tertiary);';
      loading.textContent = 'Загрузка...';
      wrapper.appendChild(loading);
    } else if (agents.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:40px;color:var(--app-text-tertiary);';
      empty.textContent = 'Агенты пока не настроены';
      wrapper.appendChild(empty);
    } else {
      agents.forEach(agent => {
        wrapper.appendChild(this.renderAgentCard(agent));
      });
    }

    this.container.appendChild(wrapper);
  }

  async show(): Promise<void> {
    console.log('📱 AgentsModule.show() вызван');
    this._isShowing = true;
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';
    this.container.style.overflowY = 'auto';

    await this.loadAgents();
    this.render();
  }

  hide(): void {
    this._isShowing = false;
    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  destroy(): void {
    this._subscriptions.forEach(unsub => {
      try { unsub(); } catch (e) {
        console.warn('Ошибка отписки AgentsModule:', e);
      }
    });
    this._subscriptions = [];
    this.container.innerHTML = '';
    console.log('📡 AgentsModule отписан от событий');
  }
}

(window as any).AgentsModule = AgentsModule;
(window as any).agentsModule = null; // инстанс создаётся module-loader'ом
console.log('✅ AgentsModule v1.1.0 загружен');
