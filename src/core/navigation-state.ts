// ============================================
// src/core/navigation-state.ts
// Единое состояние навигации
// Версия: 7.2.0 - FIXED
// ============================================

import { eventBus } from './event-bus';

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
  replace?: boolean;
  silent?: boolean;
  addToHistory?: boolean;
}

export class NavigationState {
  private eventBus = eventBus;
  private _moduleLoader: any = null;
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
    console.log('✅ NavigationState v7.2.0 инициализирован');
  }

  private get moduleLoader(): any {
    if (!this._moduleLoader) {
      this._moduleLoader = (window as any).moduleLoader || null;
    }
    return this._moduleLoader;
  }

  // ==========================================
  // НУЖНО ЛИ ПОКАЗЫВАТЬ КНОПКУ НАЗАД?
  // ==========================================

  shouldShowBackButton(): boolean {
    const drawer = document.getElementById('drawer');
    const isDrawerPhysicallyOpen = drawer?.classList.contains('active') || false;

    if (isDrawerPhysicallyOpen || this._state.isDrawerOpen) {
      return true;
    }

    if (this._state.module === 'chat') {
      return true;
    }

    if (this._state.module === 'profile') {
      return true;
    }

    return false;
  }

  // ==========================================
  // ОБРАБОТКА НАЖАТИЯ КНОПКИ НАЗАД
  // ==========================================

  back(): void {
    console.log('🔙 NavigationState.back()');
    console.log('📊 Текущее состояние:', {
      modalStack: this._state.modalStack,
      isDrawerOpen: this._state.isDrawerOpen,
      module: this._state.module
    });

    // 1. ПРОВЕРЯЕМ МОДАЛКИ
    if (this._state.modalStack.length > 0) {
      const lastModal = this._state.modalStack.pop();
      console.log(`📱 Закрываем модалку: ${lastModal}`);

      this.eventBus.emit('modal:state_changed', {
        isOpen: this._state.modalStack.length > 0,
        modalId: lastModal,
        action: 'back'
      });

      if (this._state.modalStack.length === 0) {
        this._state.isModalOpen = false;
        this._updateBackButton();
      }
      return;
    }

    // 2. ПРОВЕРЯЕМ САЙДБАР
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    const isDrawerPhysicallyOpen = drawer?.classList.contains('active') || false;

    if (isDrawerPhysicallyOpen || this._state.isDrawerOpen) {
      console.log('📂 Закрываем сайдбар через closeDrawer()');

      if ((window as any).closeDrawer) {
        (window as any).closeDrawer();
      } else {
        if (drawer) {
          drawer.classList.remove('active');
          drawer.classList.remove('drawer-anim-in');
          drawer.classList.add('drawer-anim-out');
        }
        if (overlay) {
          overlay.classList.remove('active');
        }
        document.body.style.overflow = '';
        setTimeout(() => {
          if (drawer) {
            drawer.classList.remove('drawer-anim-out');
          }
        }, 300);
      }

      this._state.isDrawerOpen = false;
      this._updateBackButton();
      this.eventBus.emit('drawer:state_changed', { isOpen: false });

      return;
    }

    // 3. ПРОВЕРЯЕМ МОДУЛИ
    if (this._state.module === 'chat') {
      this.goToChatList();
      return;
    }

    if (this._state.module === 'profile') {
      if (this._state.history.length > 0) {
        const prev = this._state.history.pop();
        if (prev) {
          this.navigate(prev.module, prev.params, { replace: true });
        } else {
          this.navigate('chat-list', {}, { replace: true });
        }
      } else {
        this.navigate('chat-list', {}, { replace: true });
      }
      return;
    }

    // 4. ИСТОРИЯ ИЛИ ГЛАВНАЯ
    if (this._state.history.length > 0) {
      const prev = this._state.history.pop();
      if (prev) {
        this.navigate(prev.module, prev.params, { replace: true });
      } else {
        this.navigate('dashboard', {}, { replace: true });
      }
    } else {
      this.navigate('dashboard', {}, { replace: true });
    }
  }

  // ==========================================
  // НАВИГАЦИЯ
  // ==========================================

  async navigate(module: string, params: Record<string, any> = {}, options: INavigationOptions = {}): Promise<void> {
    const { replace = false, silent = false, addToHistory = true } = options;

    if (this._isLoading) {
      console.log(`⏳ Уже выполняется навигация, пропускаем`);
      return;
    }

    this._isLoading = true;

    try {
      if (addToHistory && !replace && !silent) {
        this._state.history.push({
          module: this._state.module,
          params: { ...this._state.params }
        });

        if (this._state.history.length > 20) {
          this._state.history.shift();
        }
      }

      const oldModule = this._state.module;
      const oldParams = { ...this._state.params };

      this._state.module = module;
      this._state.params = { ...params };

      if (replace && this._state.history.length > 0) {
        this._state.history.pop();
      }

      const loader = this.moduleLoader;
      if (loader) {
        console.log(`📦 Загружаем модуль: ${module}`, params);

        const instance = await loader.load(module, params, {
          silent: silent,
          replace: replace
        });

        if (!instance) {
          console.error(`❌ Не удалось загрузить модуль ${module}`);
          this._state.module = oldModule;
          this._state.params = oldParams;
          this._isLoading = false;
          return;
        }

        if (typeof instance.show === 'function') {
          await instance.show(params);
          console.log(`✅ show() вызван у модуля ${module}`);
        }

        console.log(`✅ Модуль ${module} загружен и показан`);
      } else {
        console.error(`❌ ModuleLoader не доступен!`);
        this._state.module = oldModule;
        this._state.params = oldParams;
        this._isLoading = false;
        return;
      }

      if (!silent) {
        this.eventBus.emit('navigation:state_changed', { ...this._state });
      }

      this._updateBackButton();

      console.log(`🧭 Навигация завершена: ${module}`, params);

    } catch (err) {
      console.error(`❌ Ошибка навигации в ${module}:`, err);
    } finally {
      this._isLoading = false;
    }
  }

  // ==========================================
  // ОТКРЫТИЕ ЧАТА
  // ==========================================

  openChat(chatId: string, topic: string): void {
    console.log(`📂 NavigationState.openChat: ${chatId}, ${topic}`);

    const drawer = document.getElementById('drawer');
    if (drawer?.classList.contains('active')) {
      console.log('📂 Сайдбар открыт, закрываем через closeDrawer()');
      if ((window as any).closeDrawer) {
        (window as any).closeDrawer();
      } else {
        drawer.classList.remove('active');
        document.getElementById('drawer-overlay')?.classList.remove('active');
        document.body.style.overflow = '';
      }
      this._state.isDrawerOpen = false;
      this._updateBackButton();
      this.eventBus.emit('drawer:state_changed', { isOpen: false });
    }

    this.navigate('chat', { chatId, topic });
  }

  // ==========================================
  // ПЕРЕХОД В СПИСОК ЧАТОВ
  // ==========================================

  goToChatList(): void {
    this.navigate('chat-list', {}, { replace: true });
  }

  // ==========================================
  // ОТКРЫТИЕ ПРОФИЛЯ
  // ==========================================

  openProfile(): void {
    console.log('👤 NavigationState.openProfile');

    const drawer = document.getElementById('drawer');
    if (drawer?.classList.contains('active')) {
      console.log('📂 Сайдбар открыт, закрываем через closeDrawer()');
      if ((window as any).closeDrawer) {
        (window as any).closeDrawer();
      } else {
        drawer.classList.remove('active');
        document.getElementById('drawer-overlay')?.classList.remove('active');
        document.body.style.overflow = '';
      }
      this._state.isDrawerOpen = false;
      this._updateBackButton();
      this.eventBus.emit('drawer:state_changed', { isOpen: false });
    }

    this.navigate('profile', {}, { addToHistory: true });
  }

  // ==========================================
  // УПРАВЛЕНИЕ САЙДБАРОМ
  // ==========================================

  toggleDrawer(open?: boolean): void {
    const isOpen = open !== undefined ? open : !this._state.isDrawerOpen;
    this._state.isDrawerOpen = isOpen;
    this._updateBackButton();
    this.eventBus.emit('drawer:state_changed', { isOpen });
    console.log(`📂 Состояние сайдбара обновлено: ${isOpen ? 'открыт' : 'закрыт'}`);
  }

  // ==========================================
  // УПРАВЛЕНИЕ МОДАЛКАМИ
  // ==========================================

  toggleModal(open: boolean, modalId: string = 'default'): void {
    if (open === false) {
      if (this._state.modalStack.length > 0) {
        const lastModal = this._state.modalStack.pop();
        console.log(`📱 Закрыта модалка: ${lastModal}`);
      }

      const isOpen = this._state.modalStack.length > 0;
      this._state.isModalOpen = isOpen;

      this.eventBus.emit('modal:state_changed', {
        isOpen,
        modalId: modalId || 'default',
        action: 'close'
      });

      this._updateBackButton();

    } else {
      if (!this._state.modalStack.includes(modalId)) {
        this._state.modalStack.push(modalId);
      }
      this._state.isModalOpen = true;

      this.eventBus.emit('modal:state_changed', {
        isOpen: true,
        modalId,
        action: 'open'
      });

      this._updateBackButton();
    }
  }

  // ==========================================
  // ОБНОВЛЕНИЕ КНОПКИ НАЗАД (ПУБЛИЧНЫЙ МЕТОД!)
  // ==========================================

  refreshBackButton(): void {
    this._updateBackButton();
    console.log('🔄 BackButton обновлен принудительно');
  }

  // ==========================================
  // ОБНОВЛЕНИЕ КНОПКИ НАЗАД (ПРИВАТНЫЙ)
  // ==========================================

  private _updateBackButton(): void {
    const shouldShow = this.shouldShowBackButton();

    if ((window as any).backButtonManager) {
      if (shouldShow) {
        (window as any).backButtonManager.show();
      } else {
        (window as any).backButtonManager.hide();
      }
    }
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
    return this.shouldShowBackButton() || this._state.modalStack.length > 0;
  }

  get currentModule(): string {
    return this._state.module;
  }

  get currentParams(): Record<string, any> {
    return { ...this._state.params };
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribe(): void {
    this.eventBus.on('navigation:open_chat', (data) => {
      console.log('📡 Событие navigation:open_chat', data);
      this.openChat(data.chatId, data.topic);
    });

    this.eventBus.on('navigation:go_back', () => {
      console.log('📡 Событие navigation:go_back');
      this.back();
    });

    this.eventBus.on('drawer:toggle', (data) => {
      this.toggleDrawer(data.open);
    });

    this.eventBus.on('modal:open', (data) => {
      this.toggleModal(true, data.modalId || 'default');
    });

    this.eventBus.on('modal:close', (data) => {
      this.toggleModal(false, data.modalId || 'default');
    });

    this.eventBus.on('modal:back', () => {
      if (this._state.modalStack.length > 0) {
        this.back();
      }
    });

    this.eventBus.on('navigation:open_profile', () => {
      this.openProfile();
    });

    this.eventBus.on('drawer:state_changed', (data) => {
      this._state.isDrawerOpen = data.isOpen;
      this._updateBackButton();
    });

    console.log('📡 NavigationState подписан на события');
  }
}

// Создаем экземпляр
export const navigationState = new NavigationState();
console.log('✅ NavigationState v7.2.0 загружен');
