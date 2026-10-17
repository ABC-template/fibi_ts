// ============================================
// src/core/navigation-state.ts
// Единое состояние навигации
// Версия: 8.1.0 — leaveChat: выход из чата на предыдущий раздел (общий для «Назад» и
//                  удаления открытого чата)
//          8.0.0 — слои поверх экрана (модалки, просмотрщик медиа, форма генерации) в одном
//                  стеке: «Назад» закрывает верхний слой (событие modal:state_changed с его
//                  modalId), закрытие слоя убирает из стека именно его, а не последний;
//                  кнопка «Назад» видна, пока открыт хоть один слой;
//                  switchRoot — переход на вкладку нижнего меню со сбросом истории;
//                  syncModule — ModuleLoader сообщает модуль, загруженный в обход navigate;
//                  исправлено: «Назад» по истории снимал из неё два шага вместо одного;
//                  «Назад» из чата — на предыдущий раздел (не чат), без него — к агентам
//          7.3.1 — проверка темы чата
// ============================================

import { eventBus } from './event-bus';
import { inputManager } from './input-manager';
import { chatStore } from '@/store/ChatStore';

export interface INavigationState {
  module: string;
  params: Record<string, any>;
  history: Array<{
    module: string;
    params: Record<string, any>;
  }>;
  isDrawerOpen: boolean;
  isModalOpen: boolean;
  modalStack: string[];
}

export interface INavigationOptions {
  /** Не добавлять текущий экран в историю (замена текущего) */
  replace?: boolean;
  silent?: boolean;
  addToHistory?: boolean;
}

const MAX_HISTORY = 20;

export class NavigationState {
  private eventBus = eventBus;
  private _state: INavigationState = {
    module: 'dashboard',
    params: {},
    history: [],
    isDrawerOpen: false,
    isModalOpen: false,
    modalStack: []
  };
  private _isLoading: boolean = false;

  constructor() {
    this._subscribe();
  }

  private get moduleLoader(): any {
    return (window as any).moduleLoader || null;
  }

  // ==========================================
  // КНОПКА «НАЗАД»
  // ==========================================

  shouldShowBackButton(): boolean {
    if (this._state.modalStack.length > 0) return true;

    const drawer = document.getElementById('drawer');
    if (drawer?.classList.contains('active') || this._state.isDrawerOpen) return true;

    if (inputManager.isExpanded()) return true;

    if (this._state.module === 'chat') return true;

    // Модули без вкладки в меню (профиль, экономика, админка…) — есть куда вернуться
    return this._state.history.length > 0;
  }

  back(): void {
    // 1. Капсула ввода
    if (inputManager.isExpanded()) {
      inputManager.collapseInputArea();
      return;
    }

    // 2. Верхний слой (модалка, просмотрщик, форма): закрывает его владелец по modalId
    if (this._state.modalStack.length > 0) {
      const top = this._state.modalStack.pop() as string;
      this._state.isModalOpen = this._state.modalStack.length > 0;
      this.eventBus.emit('modal:state_changed', {
        isOpen: this._state.isModalOpen,
        modalId: top,
        action: 'back'
      });
      this._updateBackButton();
      return;
    }

    // 3. Сайдбар
    const drawer = document.getElementById('drawer');
    if (drawer?.classList.contains('active') || this._state.isDrawerOpen) {
      if ((window as any).closeDrawer) {
        (window as any).closeDrawer();
      } else {
        drawer?.classList.remove('active');
        document.getElementById('drawer-overlay')?.classList.remove('active');
        document.body.style.overflow = '';
        this._state.isDrawerOpen = false;
        this._updateBackButton();
        this.eventBus.emit('drawer:state_changed', { isOpen: false });
      }
      return;
    }

    // 4. Чат: на предыдущий раздел (не чат), без него — к агентам
    if (this._state.module === 'chat') {
      this.leaveChat();
      return;
    }

    // 5. История или главная
    const prev = this._state.history.pop();
    void this.navigate(prev ? prev.module : 'dashboard', prev ? prev.params : {}, { replace: true });
  }

  // ==========================================
  // НАВИГАЦИЯ
  // ==========================================

  async navigate(module: string, params: Record<string, any> = {}, options: INavigationOptions = {}): Promise<void> {
    const { replace = false, silent = false, addToHistory = true } = options;

    if (this._isLoading) return;
    this._isLoading = true;

    const oldModule = this._state.module;
    const oldParams = { ...this._state.params };
    const oldHistoryLength = this._state.history.length;

    try {
      // Повторный вход в тот же модуль (чат → другой чат) историю не наращивает
      if (addToHistory && !replace && !silent && oldModule !== module) {
        this._state.history.push({ module: oldModule, params: oldParams });
        if (this._state.history.length > MAX_HISTORY) this._state.history.shift();
      }

      this._state.module = module;
      this._state.params = { ...params };

      const loader = this.moduleLoader;
      const instance = loader ? await loader.load(module, params, { silent }) : null;

      if (!instance) {
        console.error(`❌ Не удалось загрузить модуль ${module}`);
        this._state.module = oldModule;
        this._state.params = oldParams;
        this._state.history.length = Math.min(this._state.history.length, oldHistoryLength);
        return;
      }

      if (!silent) {
        this.eventBus.emit('navigation:state_changed', { ...this._state });
      }
      this._updateBackButton();
    } catch (err) {
      console.error(`❌ Ошибка навигации в ${module}:`, err);
    } finally {
      this._isLoading = false;
    }
  }

  /** Вкладка нижнего меню: корневой раздел, история сбрасывается */
  async switchRoot(module: string): Promise<void> {
    if (inputManager.isExpanded()) inputManager.collapseInputArea();
    this._state.history = [];
    await this.navigate(module, {}, { addToHistory: false });
  }

  /** ModuleLoader загрузил модуль в обход navigate (прямой вызов load) */
  syncModule(module: string, params: Record<string, any>): void {
    if (this._state.module === module) return;
    this._state.module = module;
    this._state.params = { ...params };
    this._updateBackButton();
  }

  openChat(chatId: string, topic: string, messageId?: string | null): void {
    // Тема — из самого чата, если он найден
    const found = chatStore.findChatById(chatId);
    if (found && found.chat.topic && found.chat.topic !== topic) {
      topic = found.chat.topic;
    }

    if (inputManager.isExpanded()) inputManager.collapseInputArea();
    this._closeDrawerIfOpen();

    void this.navigate('chat', { chatId, topic, messageId: messageId || undefined });
  }

  /** Уйти из чата на предыдущий раздел (не чат), без него — к агентам */
  leaveChat(): void {
    if (inputManager.isExpanded()) inputManager.collapseInputArea();
    if (this._state.module !== 'chat') return;
    let prev = this._state.history.pop();
    while (prev && prev.module === 'chat') prev = this._state.history.pop();
    if (prev) {
      void this.navigate(prev.module, prev.params, { replace: true });
    } else {
      this.goToAgents();
    }
  }

  goToChatList(): void {
    this.goToAgents();
  }

  goToAgents(): void {
    if (inputManager.isExpanded()) inputManager.collapseInputArea();
    void this.switchRoot('agents');
  }

  openProfile(): void {
    if (inputManager.isExpanded()) inputManager.collapseInputArea();
    this._closeDrawerIfOpen();
    void this.navigate('profile', {}, { addToHistory: true });
  }

  private _closeDrawerIfOpen(): void {
    const drawer = document.getElementById('drawer');
    if (!drawer?.classList.contains('active')) return;
    if ((window as any).closeDrawer) {
      (window as any).closeDrawer({ instant: true });
      return;
    }
    drawer.classList.remove('active');
    document.getElementById('drawer-overlay')?.classList.remove('active');
    document.body.style.overflow = '';
    this._state.isDrawerOpen = false;
    this._updateBackButton();
    this.eventBus.emit('drawer:state_changed', { isOpen: false });
  }

  // ==========================================
  // САЙДБАР
  // ==========================================

  toggleDrawer(open?: boolean): void {
    const isOpen = open !== undefined ? open : !this._state.isDrawerOpen;
    this._state.isDrawerOpen = isOpen;
    this._updateBackButton();
    this.eventBus.emit('drawer:state_changed', { isOpen });
  }

  // ==========================================
  // СЛОИ ПОВЕРХ ЭКРАНА (модалки, просмотрщик, форма генерации)
  // ==========================================

  /**
   * open = true — слой открыт (кладётся наверх стека, без повторов);
   * open = false — слой закрыт владельцем: убирается из стека именно он.
   */
  toggleModal(open: boolean, modalId: string = 'default'): void {
    const stack = this._state.modalStack;
    if (open) {
      const at = stack.indexOf(modalId);
      if (at !== -1) stack.splice(at, 1);
      stack.push(modalId);
    } else {
      const at = stack.lastIndexOf(modalId);
      if (at === -1) return;
      stack.splice(at, 1);
    }

    this._state.isModalOpen = stack.length > 0;
    this.eventBus.emit('modal:state_changed', {
      isOpen: this._state.isModalOpen,
      modalId,
      action: open ? 'open' : 'close'
    });
    this._updateBackButton();
  }

  isModalOpen(modalId: string): boolean {
    return this._state.modalStack.includes(modalId);
  }

  // ==========================================
  // КНОПКА «НАЗАД» TELEGRAM
  // ==========================================

  refreshBackButton(): void {
    this._updateBackButton();
  }

  private _updateBackButton(): void {
    const manager = (window as any).backButtonManager;
    if (!manager) return;
    if (this.shouldShowBackButton()) manager.show();
    else manager.hide();
  }

  // ==========================================
  // ГЕТТЕРЫ
  // ==========================================

  get current(): INavigationState {
    return {
      module: this._state.module,
      params: { ...this._state.params },
      history: [...this._state.history],
      isDrawerOpen: this._state.isDrawerOpen,
      isModalOpen: this._state.isModalOpen,
      modalStack: [...this._state.modalStack]
    };
  }

  get canGoBack(): boolean {
    return this.shouldShowBackButton();
  }

  get currentModule(): string {
    return this._state.module;
  }

  get currentParams(): Record<string, any> {
    return { ...this._state.params };
  }

  // ==========================================
  // ПОДПИСКИ
  // ==========================================

  private _subscribe(): void {
    this.eventBus.on('navigation:open_chat', (data) => {
      this.openChat(data.chatId, data.topic, data.messageId);
    });

    this.eventBus.on('navigation:go_back', () => {
      this.back();
    });

    this.eventBus.on('drawer:toggle', (data) => {
      this.toggleDrawer(data.open);
    });

    this.eventBus.on('navigation:open_profile', () => {
      this.openProfile();
    });

    this.eventBus.on('drawer:state_changed', (data) => {
      this._state.isDrawerOpen = data.isOpen;
      this._updateBackButton();
    });

    this.eventBus.on('input:state_changed', () => {
      this._updateBackButton();
    });
  }
}

export const navigationState = new NavigationState();
