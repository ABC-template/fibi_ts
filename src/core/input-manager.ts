// ============================================
// src/core/input-manager.ts
// Управление капсулой ввода
// Версия: 2.0.0 - Без кеширования DOM-элементов
// ============================================

import { eventBus } from './event-bus';

export class InputManager {
  private eventBus = eventBus;
  private _subscriptions: Array<() => void> = [];
  private _isExpanded: boolean = false;

  constructor() {
    this._subscribeToEvents();
    console.log('✅ InputManager v2.0.0 инициализирован (без кеширования)');
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToEvents(): void {
    // Открыть капсулу
    const unsubExpand = this.eventBus.on('input:expand', () => {
      console.log('📡 InputManager: получено событие input:expand');
      this.expandInputArea();
    }, this);
    this._subscriptions.push(unsubExpand);

    // Закрыть капсулу
    const unsubCollapse = this.eventBus.on('input:collapse', () => {
      console.log('📡 InputManager: получено событие input:collapse');
      this.collapseInputArea();
    }, this);
    this._subscriptions.push(unsubCollapse);

    // Очистить поле
    const unsubClear = this.eventBus.on('input:clear', () => {
      console.log('📡 InputManager: получено событие input:clear');
      this.clearUserText();
    }, this);
    this._subscriptions.push(unsubClear);

    // Фокус на поле
    const unsubFocus = this.eventBus.on('input:focus', () => {
      console.log('📡 InputManager: получено событие input:focus');
      this.focusInput();
    }, this);
    this._subscriptions.push(unsubFocus);

    console.log('📡 InputManager подписан на события');
  }

  // ==========================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ (всегда ищут элементы заново)
  // ==========================================

  private _getElements(): {
    userInput: HTMLTextAreaElement | null;
    inputArea: HTMLElement | null;
    chatContainer: HTMLElement | null;
    fabBtn: HTMLElement | null;
    overlay: HTMLElement | null;
    clearBtn: HTMLElement | null;
  } {
    return {
      userInput: document.getElementById('user-input') as HTMLTextAreaElement,
      inputArea: document.getElementById('input-area'),
      chatContainer: document.getElementById('chat-container'),
      fabBtn: document.getElementById('fab-open-input'),
      overlay: document.getElementById('input-overlay'),
      clearBtn: document.getElementById('clear-input-btn')
    };
  }

  private _resizeTextArea(userInput: HTMLTextAreaElement, clearBtn: HTMLElement | null): void {
    if (!userInput) return;
    
    userInput.style.height = 'auto';
    userInput.style.height = (userInput.scrollHeight) + 'px';

    if (clearBtn) {
      if (userInput.value.trim().length > 0) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    }
  }

  // ==========================================
  // ПУБЛИЧНЫЕ МЕТОДЫ
  // ==========================================

  /**
   * Открыть капсулу ввода
   */
  expandInputArea(): void {
    console.log('🔧 expandInputArea() вызван');
    
    if (this._isExpanded) {
      console.log('⚠️ Капсула уже открыта');
      return;
    }

    const elements = this._getElements();
    const { fabBtn, overlay, inputArea, userInput, clearBtn } = elements;

    if (!fabBtn || !overlay || !inputArea || !userInput) {
      console.warn('⚠️ expandInputArea: не все элементы найдены', {
        fabBtn: !!fabBtn,
        overlay: !!overlay,
        inputArea: !!inputArea,
        userInput: !!userInput
      });
      return;
    }

    console.log('🔧 Все элементы найдены, открываем капсулу');

    fabBtn.style.opacity = '0';
    fabBtn.style.pointerEvents = 'none';

    overlay.classList.remove('hidden');
    inputArea.classList.add('active');

    if (clearBtn) {
      if (userInput.value.length > 0) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    }

    this._resizeTextArea(userInput, clearBtn);
    userInput.focus();

    // Скрываем нижнюю навигацию
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.style.display = 'none';
    }

    this._isExpanded = true;
    this.eventBus.emit('input:state_changed', { isExpanded: true });
    console.log('✅ Капсула открыта');
  }

  /**
   * Закрыть капсулу ввода
   */
  collapseInputArea(): void {
    console.log('🔧 collapseInputArea() вызван');
    
    if (!this._isExpanded) {
      console.log('⚠️ Капсула уже закрыта');
      return;
    }

    // Не закрываем, если идет запись голоса
    if ((window as any).isVoiceRecording) {
      console.log('⚠️ Идет запись голоса, капсула не закрывается');
      return;
    }

    const elements = this._getElements();
    const { userInput, inputArea, overlay, fabBtn } = elements;

    if (userInput) {
      userInput.blur();
    }

    if (inputArea) {
      inputArea.classList.remove('active');
      inputArea.classList.remove('keyboard-up');
    }

    if (overlay) {
      overlay.classList.add('hidden');
    }

    if (fabBtn) {
      fabBtn.style.opacity = '1';
      fabBtn.style.pointerEvents = 'auto';
    }

    // Показываем нижнюю навигацию
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.style.display = 'flex';
    }

    this._isExpanded = false;
    this.eventBus.emit('input:state_changed', { isExpanded: false });
    console.log('✅ Капсула закрыта');
  }

  /**
   * Очистить текст в поле ввода
   */
  clearUserText(e?: Event): void {
    if (e) e.stopPropagation();
    
    console.log('🔧 clearUserText() вызван');
    
    const elements = this._getElements();
    const { userInput, clearBtn } = elements;

    if (userInput) {
      userInput.value = '';
      userInput.style.height = 'auto';
      userInput.focus();
    }

    if (clearBtn) {
      clearBtn.classList.add('hidden');
    }
  }

  /**
   * Установить фокус на поле ввода
   */
  focusInput(): void {
    console.log('🔧 focusInput() вызван');
    
    const userInput = document.getElementById('user-input') as HTMLTextAreaElement;
    if (userInput) {
      userInput.focus();
    }
  }

  /**
   * Проверить, открыта ли капсула
   */
  isExpanded(): boolean {
    return this._isExpanded;
  }

  /**
   * Получить текст из поля ввода
   */
  getInputText(): string {
    const userInput = document.getElementById('user-input') as HTMLTextAreaElement;
    return userInput?.value?.trim() || '';
  }

  /**
   * Установить текст в поле ввода
   */
  setInputText(text: string): void {
    console.log('🔧 setInputText() вызван');
    
    const elements = this._getElements();
    const { userInput, clearBtn } = elements;

    if (!userInput) return;
    
    userInput.value = text;
    this._resizeTextArea(userInput, clearBtn);
    
    if (text.trim().length > 0 && clearBtn) {
      clearBtn.classList.remove('hidden');
    } else if (clearBtn) {
      clearBtn.classList.add('hidden');
    }
  }

  /**
   * Уничтожение (отписка)
   */
  destroy(): void {
    console.log('🗑️ InputManager.destroy()');
    
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки InputManager:', e);
      }
    }
    this._subscriptions = [];
    this._isExpanded = false;
    console.log('📡 InputManager отписан от событий');
  }
}

// Создаем экземпляр
export const inputManager = new InputManager();

// ==========================================
// ✅ ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ==========================================

(window as any).expandInputArea = inputManager.expandInputArea.bind(inputManager);
(window as any).collapseInputArea = inputManager.collapseInputArea.bind(inputManager);
(window as any).clearUserText = inputManager.clearUserText.bind(inputManager);

console.log('✅ InputManager v2.0.0 загружен');
