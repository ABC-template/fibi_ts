// ============================================
// src/modules/agents/AgentsModule.ts
// Модуль списка агентов для пользователя
// Версия: 1.0.0
// ============================================

import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { navigationState } from '@/core/navigation-state';
import { moduleLoader } from '@/core/module-loader';
import { uiRenderer } from '@/modules/ui/renderer';
import { userStore } from '@/store/UserStore';
import { chatStore } from '@/store/ChatStore';
import type { IAiAgentWithAccess, AgentModality } from '@types/agents';

export class AgentsModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private _isVisible: boolean = false;
  private _agents: IAiAgentWithAccess[] = [];
  private _userRole: string = 'trial';
  private _userProTier: string | null = null;
  private _filterModality: string = 'all';
  private _searchQuery: string = '';

  private headerManager = headerManager;
  private eventBus = eventBus;
  private navigationState = navigationState;
  private moduleLoader = moduleLoader;
  private uiRenderer = uiRenderer;
  private userStore = userStore;
  private chatStore = chatStore;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).agentsModule = this;

    this.container.innerHTML = `
      <div class="agents-container" style="
        padding: 16px;
        flex: 1;
        overflow-y: auto;
        padding-bottom: 80px;
        display: flex;
        flex-direction: column;
        height: 100%;
      ">
        <h2 style="
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: var(--app-text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <i data-lucide="bot" style="width:24px;height:24px;"></i>
          ИИ-агенты
        </h2>
        <p style="
          font-size: 13px;
          color: var(--app-text-tertiary);
          margin: 0 0 16px 0;
        ">
          Выберите агента для выполнения задачи
        </p>

        <div style="
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          flex-shrink: 0;
        ">
          <input type="text" id="agents-search-input" placeholder="Поиск агентов..."
            style="
              flex: 1;
              padding: 10px 14px;
              border-radius: 12px;
              border: 1px solid var(--app-border-color);
              background: var(--app-bg-tertiary);
              color: var(--app-text-primary);
              font-size: 14px;
              outline: none;
            "
          >
          <select id="agents-modality-filter" style="
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid var(--app-border-color);
            background: var(--app-bg-tertiary);
            color: var(--app-text-primary);
            font-size: 13px;
            outline: none;
          ">
            <option value="all">Все типы</option>
            <option value="text">Текст</option>
            <option value="image">Изображение</option>
            <option value="video">Видео</option>
            <option value="audio">Аудио</option>
          </select>
        </div>

        <div id="agents-list" style="
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
        ">
          <div style="text-align: center; padding: 40px 0; color: var(--app-text-tertiary);">
            ⏳ Загрузка агентов...
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
    this._subscribeToEvents();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    await this.loadAgents();

    this.isInitialized = true;
    console.log('✅ AgentsModule v1.0.0 инициализирован');
  }

  private _bindEvents(): void {
    const searchInput = document.getElementById('agents-search-input') as HTMLInputElement;
    const filterSelect = document.getElementById('agents-modality-filter') as HTMLSelectElement;

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._searchQuery = searchInput.value.trim().toLowerCase();
        this.render();
      });
    }

    if (filterSelect) {
      filterSelect.addEventListener('change', () => {
        this._filterModality = filterSelect.value;
        this.render();
      });
    }
  }

  private _subscribeToEvents(): void {
    const unsub = this.eventBus.on('agents:reload', () => {
      this.loadAgents();
    }, this);
    this._subscriptions.push(unsub);

    const unsub2 = this.eventBus.on('user:role_changed', () => {
      this.loadAgents();
    }, this);
    this._subscriptions.push(unsub2);

    console.log('📡 AgentsModule подписан на события');
  }

  async loadAgents(): Promise<void> {
    try {
      const { fetchAgentsWithAccess } = await import('@/services/agents');
      const data = await fetchAgentsWithAccess();

      this._agents = data.agents || [];
      this._userRole = data.user_role || 'trial';
      this._userProTier = data.user_pro_tier || null;

      console.log(`📋 [AgentsModule] Загружено ${this._agents.length} агентов`);
      this.render();
    } catch (err) {
      console.error('❌ [AgentsModule] Ошибка загрузки агентов:', err);
      this.uiRenderer?.showToast('⚠️ Не удалось загрузить агентов', 'error', 2000);

      const list = document.getElementById('agents-list');
      if (list) {
        list.innerHTML = `
          <div style="text-align: center; padding: 40px 0; color: var(--app-text-tertiary);">
            <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
            <div style="font-size: 16px; font-weight: 600;">Ошибка загрузки</div>
            <div style="font-size: 13px; margin-top: 4px;">Попробуйте обновить страницу</div>
            <button onclick="window.agentsModule.loadAgents()" style="
              margin-top: 16px;
              padding: 8px 24px;
              border-radius: 10px;
              border: none;
              background: var(--app-gradient-primary);
              color: var(--app-text-inverse);
              font-weight: 600;
              cursor: pointer;
            ">
              🔄 Повторить
            </button>
          </div>
        `;
      }
    }
  }

  render(): void {
    const list = document.getElementById('agents-list');
    if (!list) return;

    const filtered = this._filterAgents();

    if (filtered.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px 0; color: var(--app-text-tertiary);">
          <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 16px; font-weight: 600;">Агенты не найдены</div>
          <div style="font-size: 13px; margin-top: 4px;">Попробуйте изменить фильтры</div>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    for (const agent of filtered) {
      const card = this._createAgentCard(agent);
      list.appendChild(card);
    }
  }

  private _filterAgents(): IAiAgentWithAccess[] {
    let result = [...this._agents];

    if (this._filterModality !== 'all') {
      result = result.filter(a => a.modality === this._filterModality);
    }

    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      result = result.filter(a => {
        const nameRu = a.name?.ru?.toLowerCase() || '';
        const nameEn = a.name?.en?.toLowerCase() || '';
        const descRu = a.description?.ru?.toLowerCase() || '';
        const slug = a.slug?.toLowerCase() || '';
        return nameRu.includes(q) || nameEn.includes(q) || descRu.includes(q) || slug.includes(q);
      });
    }

    return result.sort((a, b) => {
      if (a.has_access && !b.has_access) return -1;
      if (!a.has_access && b.has_access) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }

  private _createAgentCard(agent: IAiAgentWithAccess): HTMLElement {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.style.cssText = `
      background: var(--app-bg-secondary);
      border-radius: 16px;
      padding: 16px;
      border: 1px solid ${agent.has_access ? 'var(--app-border-color-light)' : 'var(--app-border-color)'};
      transition: all 0.2s ease;
      opacity: ${agent.is_active ? '1' : '0.5'};
      cursor: ${agent.has_access ? 'pointer' : 'default'};
    `;

    const hasAccess = agent.has_access;
    const accessReason = agent.access_reason;
    const modalityEmoji: Record<string, string> = {
      text: '📝',
      image: '🖼️',
      video: '🎬',
      audio: '🎵',
    };
    const modalityLabel: Record<string, string> = {
      text: 'Текст',
      image: 'Изображение',
      video: 'Видео',
      audio: 'Аудио',
    };

    let accessInfo = 'Доступен всем';
    if (!hasAccess) {
      if (accessReason === 'role') {
        const roles = agent.allowed_roles?.filter(r => r !== 'trial') || [];
        accessInfo = `Требуется: ${roles.join(', ')}`;
      } else if (accessReason === 'tier') {
        accessInfo = `Требуется: Pro (${agent.min_pro_tier})`;
      } else if (accessReason === 'inactive') {
        accessInfo = '⏳ Временно недоступен';
      }
    } else {
      if (agent.allowed_roles?.includes('trial')) {
        accessInfo = '🔓 Доступен бесплатно';
      } else if (agent.allowed_roles?.includes('pro')) {
        accessInfo = '⭐ Доступен по PRO';
      }
    }

    card.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: ${hasAccess ? 'var(--app-accent-glow)' : 'var(--app-bg-tertiary)'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
        ">
          ${modalityEmoji[agent.modality] || '🤖'}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="font-size: 16px; font-weight: 600; color: var(--app-text-primary);">
              ${agent.name?.ru || agent.slug}
            </div>
            ${!hasAccess ? `<span style="font-size: 14px;">🔒</span>` : ''}
            ${!agent.is_active ? `<span style="font-size: 11px; color: #95a5a6;">⏳</span>` : ''}
          </div>
          <div style="font-size: 13px; color: var(--app-text-secondary); margin-top: 2px;">
            ${agent.description?.ru || agent.modality || 'ИИ-агент'}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
            <span style="
              font-size: 10px;
              padding: 2px 8px;
              border-radius: 10px;
              background: var(--app-bg-tertiary);
              color: var(--app-text-tertiary);
            ">
              ${modalityLabel[agent.modality] || agent.modality}
            </span>
            <span style="
              font-size: 10px;
              padding: 2px 8px;
              border-radius: 10px;
              background: ${hasAccess ? 'rgba(39,174,96,0.12)' : 'rgba(231,76,60,0.12)'};
              color: ${hasAccess ? '#27ae60' : '#e74c3c'};
            ">
              ${accessInfo}
            </span>
          </div>
        </div>
      </div>
      <div style="margin-top: 12px;">
        ${hasAccess ? `
          <button class="btn" style="width:100%; padding: 10px; font-size: 14px; font-weight: 600;" 
                  onclick="window.agentsModule.startChatWithAgent('${agent.id}')">
            💬 Начать чат
          </button>
        ` : `
          <button class="btn btn-secondary" style="width:100%; padding: 10px; font-size: 14px; font-weight: 600;"
                  onclick="window.agentsModule.showUpgradeModal('${agent.id}')">
            ${agent.is_active ? '🔒 Расширить возможности' : '⏳ Временно недоступен'}
          </button>
        `}
      </div>
    `;

    if (hasAccess) {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        this.startChatWithAgent(agent.id);
      });
    }

    return card;
  }

  async startChatWithAgent(agentId: string): Promise<void> {
    console.log(`🚀 [AgentsModule] Запуск чата с агентом: ${agentId}`);

    const agent = this._agents.find(a => a.id === agentId);
    if (!agent) {
      this.uiRenderer?.showToast('⚠️ Агент не найден', 'error', 1500);
      return;
    }

    if (!agent.has_access) {
      this.showUpgradeModal(agentId);
      return;
    }

    let existingChat = this.chatStore.getAllChats('all').find(c => c.agent_id === agentId && !c.deleted_at);

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
      description = `Требуется роль: ${roles.join(', ')}`;
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
              ${reason === 'role' ? 'Обновите роль в настройках профиля' : 'Оформите PRO-подписку в разделе "Экономика"'}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const footer = `
      <button id="modal-save-btn" class="btn" style="width:100%;">
        ${isInactive ? '🔄 Обновить список' : '📈 Перейти к подписке'}
      </button>
    `;

    const modalManager = (window as any).modalManager;
    if (modalManager) {
      modalManager.open({
        title: title,
        content: content,
        footer: footer,
        modalId: 'agent-upgrade',
        showFooter: true,
        onSave: () => {
          if (isInactive) {
            this.loadAgents();
          } else {
            modalManager.close();
            if (this.navigationState) {
              this.navigationState.navigate('economy', {}, { addToHistory: true });
            } else if (this.moduleLoader) {
              this.moduleLoader.load('economy');
            }
          }
          modalManager.close();
        },
      });
    }
  }

  show(): void {
    console.log('📱 AgentsModule.show() вызван');

    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this._isVisible = true;

    this.headerManager.setTitle('🤖 Агенты');
    this.headerManager.setActions([]);

    this.loadAgents();

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 100);
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.add('hidden');
    this.container.style.display = 'none';

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки AgentsModule:', e);
      }
    }
    this._subscriptions = [];
    this._isVisible = false;
    console.log('📡 AgentsModule отписан от событий');
  }
}

(window as any).AgentsModule = AgentsModule;
console.log('✅ AgentsModule v1.0.0 загружен');
