// ============================================
// src/core/module-loader.ts
// Загрузчик модулей с полным управлением видимостью
// Версия: 5.1.0 - FIXED
// ============================================

import { eventBus } from './event-bus';
import { navigationState } from './navigation-state';

export interface IModuleOptions {
  silent?: boolean;
  replace?: boolean;
}

export class ModuleLoader {
  private modules: Record<string, any> = {};
  private container: HTMLElement | null = null;
  private eventBus = eventBus;
  private navigationState = navigationState;
  private _currentModule: string | null = null;
  private _currentParams: Record<string, any> = {};
  private _isLoading: boolean = false;

  constructor() {
    this.container = document.getElementById('app-screen');
    console.log('✅ ModuleLoader v5.1.0 загружен');
  }

  /**
   * Зарегистрировать модуль
   */
  register(moduleName: string, ModuleClass: any): void {
    if (this.modules[moduleName]) {
      console.warn(`⚠️ Модуль ${moduleName} уже зарегистрирован`);
      return;
    }
    this.modules[moduleName] = ModuleClass;
    console.log(`📦 Модуль зарегистрирован: ${moduleName}`);
  }

  /**
   * Загрузить модуль
   */
  async load(moduleName: string, params: Record<string, any> = {}, options: IModuleOptions = {}): Promise<any> {
    const { silent = false, replace = false } = options;

    if (this._isLoading) {
      console.log(`⏳ Уже выполняется загрузка, пропускаем`);
      return this._getModuleInstance(moduleName);
    }

    if (!this.modules[moduleName]) {
      console.error(`❌ Модуль не найден: ${moduleName}`);
      return null;
    }

    this._isLoading = true;

    try {
      this._hideAllModules();

      let container = document.getElementById(`module-${moduleName}`);
      if (!container) {
        container = this._createContainer(moduleName);
      }

      const ModuleClass = this.modules[moduleName];
      let instance = ModuleClass._instance;

      if (!instance) {
        this._showLoader(container);
        
        try {
          instance = new ModuleClass(container);
          await instance.init();
          ModuleClass._instance = instance;
        } catch (err) {
          console.error(`❌ Ошибка инициализации ${moduleName}:`, err);
          this._hideLoader(container);
          throw err;
        }
        
        this._hideLoader(container);
      }

      container.classList.remove('hidden');
      (container as HTMLElement).style.display = 'flex';
      (container as HTMLElement).style.flexDirection = 'column';
      (container as HTMLElement).style.height = '100%';
      (container as HTMLElement).style.width = '100%';

      if (typeof instance.show === 'function') {
        await instance.show(params);
        console.log(`✅ show() вызван у модуля ${moduleName}`);
      }

      this._currentModule = moduleName;
      this._currentParams = { ...params };

      if (!silent) {
        this.eventBus.emit('module:loaded', { 
          moduleName, 
          params,
          instance 
        });
      }

      console.log(`✅ Модуль загружен и показан: ${moduleName}`, params);
      return instance;

    } catch (err) {
      console.error(`❌ Ошибка загрузки модуля ${moduleName}:`, err);
      
      const container = document.getElementById(`module-${moduleName}`);
      if (container) {
        this._hideLoader(container);
        container.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
            <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
            <div style="font-size:16px;color:var(--app-text-primary);margin-bottom:8px;">Ошибка загрузки</div>
            <div style="font-size:13px;color:var(--app-text-tertiary);">${err instanceof Error ? err.message : 'Неизвестная ошибка'}</div>
            <button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;border-radius:12px;background:var(--app-accent-primary);color:var(--app-text-inverse);border:none;font-weight:600;cursor:pointer;">
              🔄 Перезагрузить
            </button>
          </div>
        `;
        container.classList.remove('hidden');
        (container as HTMLElement).style.display = 'flex';
      }
      return null;
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Показать модуль (без перезагрузки)
   */
  show(moduleName: string, params: Record<string, any> = {}): void {
    this._hideAllModules();
    
    const container = document.getElementById(`module-${moduleName}`);
    if (!container) {
      console.warn(`⚠️ Контейнер модуля ${moduleName} не найден`);
      return;
    }

    container.classList.remove('hidden');
    (container as HTMLElement).style.display = 'flex';
    (container as HTMLElement).style.flexDirection = 'column';
    (container as HTMLElement).style.height = '100%';
    (container as HTMLElement).style.width = '100%';

    const instance = this._getModuleInstance(moduleName);
    if (instance && typeof instance.show === 'function') {
      instance.show(params);
    }

    this._currentModule = moduleName;
    this._currentParams = { ...params };
  }

  /**
   * Вернуться назад
   */
  back(): void {
    if (this.navigationState) {
      this.navigationState.back();
    } else {
      if (this._currentModule === 'chat') {
        this.load('chat-list');
      } else {
        this.load('dashboard');
      }
    }
  }

  /**
   * Получить текущий модуль
   */
  get currentModule(): string | null {
    return this._currentModule;
  }

  get currentParams(): Record<string, any> {
    return { ...this._currentParams };
  }

  /**
   * Проверить, загружен ли модуль
   */
  isLoaded(moduleName: string): boolean {
    const container = document.getElementById(`module-${moduleName}`);
    return container ? !container.classList.contains('hidden') : false;
  }

  /**
   * Получить экземпляр модуля
   */
  getModule(moduleName: string): any {
    return this._getModuleInstance(moduleName);
  }

  // ==========================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ==========================================

  private _getModuleInstance(moduleName: string): any {
    const ModuleClass = this.modules[moduleName];
    return ModuleClass ? ModuleClass._instance : null;
  }

  private _createContainer(moduleName: string): HTMLElement {
    const container = document.createElement('div');
    container.id = `module-${moduleName}`;
    container.className = 'module-container hidden';
    (container as HTMLElement).style.display = 'none';
    if (this.container) {
      this.container.appendChild(container);
    }
    return container;
  }

  private _hideAllModules(): void {
    document.querySelectorAll('.module-container').forEach((el) => {
      const element = el as HTMLElement;
      element.classList.add('hidden');
      element.style.display = 'none';
      
      const loader = element.querySelector('.module-loader-overlay');
      if (loader) loader.remove();
    });
    console.log('📦 Все модули скрыты');
  }

  private _showLoader(container: HTMLElement): void {
    const oldLoader = container.querySelector('.module-loader-overlay');
    if (oldLoader) oldLoader.remove();

    const loader = document.createElement('div');
    loader.className = 'module-loader-overlay';
    loader.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--app-bg-primary, #0A0A0A);
      z-index: 10;
      opacity: 1;
      transition: opacity 0.25s ease;
      border-radius: 0;
      pointer-events: none;
    `;

    loader.innerHTML = `
      <div class="module-spinner" style="
        width: 36px;
        height: 36px;
        border: 3px solid rgba(212, 175, 55, 0.12);
        border-top-color: var(--app-accent-primary, #D4AF37);
        border-radius: 50%;
        animation: moduleSpinnerSpin 0.7s linear infinite;
      "></div>
    `;

    if (!document.getElementById('module-loader-styles')) {
      const style = document.createElement('style');
      style.id = 'module-loader-styles';
      style.textContent = `
        @keyframes moduleSpinnerSpin {
          to { transform: rotate(360deg); }
        }
        .module-loader-overlay {
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(loader);
  }

  private _hideLoader(container: HTMLElement): void {
    const loader = container.querySelector('.module-loader-overlay');
    if (!loader) return;

    (loader as HTMLElement).style.opacity = '0';
    setTimeout(() => {
      if (loader.parentNode) {
        loader.remove();
      }
    }, 300);
  }
}

// Создаем экземпляр
export const moduleLoader = new ModuleLoader();
console.log('✅ ModuleLoader v5.1.0 загружен');
