// ============================================
// src/modules/dashboard/DashboardModule.ts
// Главная страница (заглушка)
// Версия: 2.0.0 - TypeScript
// ============================================

import { headerManager } from '@/core/header-manager';
import { eventBus } from '@/core/event-bus';
import { chatStore } from '@/store/ChatStore';
import { tasksStore } from '@/store/TasksStore';

export class DashboardModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private eventBus = eventBus;
  private headerManager = headerManager;
  private chatStore = chatStore;
  private tasksStore = tasksStore;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    // Пустой заголовок для Dashboard
    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this.container.innerHTML = `
      <div style="padding: 16px; flex:1; overflow-y:auto; padding-bottom: 80px;">
        <h2 style="font-size:20px; font-weight:700; margin:0 0 4px 0; color:var(--app-text-primary);">
          🌤️ Добро пожаловать!
        </h2>
        <p style="font-size:14px; color:var(--app-text-tertiary); margin:0 0 20px 0;">
          Выберите раздел в меню ниже
        </p>

        <!-- Быстрый доступ -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
          <div onclick="window.navigation.switchTab('chat-list')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:32px; margin-bottom:8px;">💬</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Чат AI</div>
            <div style="font-size:12px; color:var(--app-text-tertiary);">Общайся с ИИ</div>
          </div>
          <div onclick="window.navigation.switchTab('organizer')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:32px; margin-bottom:8px;">📊</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Органайзер</div>
            <div style="font-size:12px; color:var(--app-text-tertiary);">To-Do, трекеры</div>
          </div>
          <div onclick="window.navigation.switchTab('chat-list')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:32px; margin-bottom:8px;">⭐</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Избранное</div>
            <div style="font-size:12px; color:var(--app-text-tertiary);">Лучшие ответы</div>
          </div>
          <div onclick="window.navigation.switchTab('profile')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:32px; margin-bottom:8px;">👤</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Профиль</div>
            <div style="font-size:12px; color:var(--app-text-tertiary);">Настройки</div>
          </div>
        </div>

        <!-- Статистика -->
        <div style="background:var(--app-bg-secondary); border-radius:16px; padding:16px; border:1px solid var(--app-border-color-light);">
          <div style="font-size:14px; font-weight:600; color:var(--app-text-primary); margin-bottom:12px;">📊 Ваша статистика</div>
          <div style="display:flex; justify-content:space-around;">
            <div style="text-align:center;">
              <div id="dash-chats" style="font-size:20px; font-weight:700; color:var(--app-accent-primary);">0</div>
              <div style="font-size:11px; color:var(--app-text-tertiary);">Чатов</div>
            </div>
            <div style="text-align:center;">
              <div id="dash-messages" style="font-size:20px; font-weight:700; color:var(--app-accent-primary);">0</div>
              <div style="font-size:11px; color:var(--app-text-tertiary);">Сообщений</div>
            </div>
            <div style="text-align:center;">
              <div id="dash-favorites" style="font-size:20px; font-weight:700; color:var(--app-accent-primary);">0</div>
              <div style="font-size:11px; color:var(--app-text-tertiary);">Избранных</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.updateStats();
    this._subscribeToEvents();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ DashboardModule v2.0.0 инициализирован');
  }

  private _subscribeToEvents(): void {
    const updateStats = () => this.updateStats();

    const unsub1 = this.eventBus.on('chat:all_updated', updateStats, this);
    this._subscriptions.push(unsub1);

    const unsub2 = this.eventBus.on('chat:created', updateStats, this);
    this._subscriptions.push(unsub2);

    const unsub3 = this.eventBus.on('chat:deleted', updateStats, this);
    this._subscriptions.push(unsub3);

    const unsub4 = this.eventBus.on('chat:restored', updateStats, this);
    this._subscriptions.push(unsub4);

    const unsub5 = this.eventBus.on('chat:favorite_toggled', updateStats, this);
    this._subscriptions.push(unsub5);

    console.log('📡 DashboardModule подписан на события');
  }

  updateStats(): void {
    const allChats: any[] = [];
    for (const topic of Object.values(this.chatStore.histories || {})) {
      if (topic) allChats.push(...(topic as any[]));
    }

    let totalMessages = 0;
    let activeChats = 0;
    for (const chat of allChats) {
      if (chat.deleted_at) continue;
      const messages = chat.messages?.filter((m: any) => !m.deleted_at) || [];
      if (messages.length > 0) activeChats++;
      totalMessages += messages.length;
    }

    const favorites = this.chatStore.getFavorites();

    const chatsEl = document.getElementById('dash-chats');
    const msgEl = document.getElementById('dash-messages');
    const favEl = document.getElementById('dash-favorites');

    if (chatsEl) chatsEl.textContent = String(activeChats || 0);
    if (msgEl) msgEl.textContent = String(totalMessages);
    if (favEl) favEl.textContent = String(favorites.length || 0);
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this.updateStats();

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }
  }

  hide(): void {
    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки DashboardModule:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 DashboardModule отписан от событий');
  }
}

// Экспортируем класс в глобальный объект для регистрации в ModuleLoader
(window as any).DashboardModule = DashboardModule;
console.log('✅ DashboardModule v2.0.0 загружен');
