// ============================================
// src/core/input-manager.ts
// Управление капсулой ввода
// Версия: 1.0.0 - EventBus-based
// ============================================

import { eventBus } from './event-bus';

export class InputManager {
  private eventBus = eventBus;
  private _subscriptions: Array<() => void> = [];
  
  // DOM-элементы
  private userInput: HTMLTextAreaElement | null = null;
  private inputArea: HTMLElement | null = null;
  private chatContainer: HTMLElement | null = null;
  private fabBtn: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private clearBtn: HTMLElement | null = null;
  
  private _isExpanded: boolean = false;

  constructor() {
    // Ждем DOM перед инициализацией
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init());
    } else {
      this._init();
    }
    this._subscribeToEvents();
    console.log('✅ InputManager v1.0.0 инициализирован');
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ
  // ==========================================

  private _init(): void {
    // Находим DOM-элементы
    this.userInput = document.getElementById('user-input') as HTMLTextAreaElement;
    this.inputArea = document.getElementById('input-area');
    this.chatContainer = document.getElementById('chat-container');
    this.fabBtn = document.getElementById('fab-open-input');
    this.overlay = document.getElementById('input-overlay');
    this.clearBtn = document.getElementById('clear-input-btn');

    if (!this.userInput || !this.inputArea || !this.chatContainer || !this.fabBtn || !this.overlay || !this.clearBtn) {
      console.warn('⚠️ InputManager: не все DOM-элементы найдены');
      return;
    }

    // Настройка виртуальной клавиатуры
    if ((navigator as any).virtualKeyboard) {
      (navigator as any).virtualKeyboard.overlaysContent = false;
    }

    // Авто-высота текстового поля
    this.userInput.addEventListener('input', () => {
      this._resizeTextArea();
    });

    // Закрытие по клику на оверлей
    this.overlay.addEventListener('click', () => {
      this.collapseInputArea();
    });

    // Клик по капсуле — не закрывать
    this.inputArea.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Кнопка очистки
    this.clearBtn.addEventListener('click', () => {
      this.clearUserText();
    });

    // Отправка по Enter
    this.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.eventBus.emit('chat:send-message');
      }
      if (e.key === 'Escape' && this.userInput?.value.trim().length === 0) {
        this.collapseInputArea();
      }
    });

    // Настройка Telegram viewport
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try {
        tg.onEvent('viewportChanged', () => {
          if (!this._isExpanded) return;
          const isKeyboardOpen = window.innerHeight < tg.viewportStableHeight;
          if (isKeyboardOpen) {
            this.inputArea?.classList.add('keyboard-up');
          } else {
            this.inputArea?.classList.remove('keyboard-up');
          }
        });
      } catch (err) {
        console.error('Ошибка контроля вьюпорта в InputManager:', err);
      }
    }

    console.log('🔧 InputManager: DOM-элементы инициализированы');
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToEvents(): void {
    // Открыть капсулу
    const unsubExpand = this.eventBus.on('input:expand', () => {
      this.expandInputArea();
    }, this);
    this._subscriptions.push(unsubExpand);

    // Закрыть капсулу
    const unsubCollapse = this.eventBus.on('input:collapse', () => {
      this.collapseInputArea();
    }, this);
    this._subscriptions.push(unsubCollapse);

    // Очистить поле
    const unsubClear = this.eventBus.on('input:clear', () => {
      this.clearUserText();
    }, this);
    this._subscriptions.push(unsubClear);

    // Фокус на поле
    const unsubFocus = this.eventBus.on('input:focus', () => {
      this.userInput?.focus();
    }, this);
    this._subscriptions.push(unsubFocus);

    console.log('📡 InputManager подписан на события');
  }

  // ==========================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================

  private _resizeTextArea(): void {
    if (!this.userInput) return;
    
    this.userInput.style.height = 'auto';
    this.userInput.style.height = (this.userInput.scrollHeight) + 'px';

    if (this.clearBtn) {
      if (this.userInput.value.trim().length > 0) {
        this.clearBtn.classList.remove('hidden');
      } else {
        this.clearBtn.classList.add('hidden');
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
    if (this._isExpanded) return;
    if (!this.fabBtn || !this.overlay || !this.inputArea) return;

    this.fabBtn.style.opacity = '0';
    this.fabBtn.style.pointerEvents = 'none';

    this.overlay.classList.remove('hidden');
    this.inputArea.classList.add('active');

    if (this.clearBtn) {
      if (this.userInput?.value.length > 0) {
        this.clearBtn.classList.remove('hidden');
      } else {
        this.clearBtn.classList.add('hidden');
      }
    }

    this._resizeTextArea();
    this.userInput?.focus();

    // Скрываем нижнюю навигацию
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.style.display = 'none';
    }

    this._isExpanded = true;
    this.eventBus.emit('input:state_changed', { isExpanded: true });
  }

  /**
   * Закрыть капсулу ввода
   */
  collapseInputArea(): void {
    if (!this._isExpanded) return;
    if ((window as any).isVoiceRecording) return;

    this.userInput?.blur();
    this.inputArea?.classList.remove('active');
    this.inputArea?.classList.remove('keyboard-up');
    this.overlay?.classList.add('hidden');

    if (this.fabBtn) {
      this.fabBtn.style.opacity = '1';
      this.fabBtn.style.pointerEvents = 'auto';
    }

    // Показываем нижнюю навигацию
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.style.display = 'flex';
    }

    this._isExpanded = false;
    this.eventBus.emit('input:state_changed', { isExpanded: false });
  }

  /**
   * Очистить текст в поле ввода
   */
  clearUserText(e?: Event): void {
    if (e) e.stopPropagation();
    
    if (this.userInput) {
      this.userInput.value = '';
      this.userInput.style.height = 'auto';
    }
    if (this.clearBtn) {
      this.clearBtn.classList.add('hidden');
    }
    if (this.userInput) {
      this.userInput.focus();
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
    return this.userInput?.value?.trim() || '';
  }

  /**
   * Установить текст в поле ввода
   */
  setInputText(text: string): void {
    if (!this.userInput) return;
    this.userInput.value = text;
    this._resizeTextArea();
    if (text.trim().length > 0) {
      this.clearBtn?.classList.remove('hidden');
    } else {
      this.clearBtn?.classList.add('hidden');
    }
  }

  /**
   * Уничтожение (отписка)
   */
  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки InputManager:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 InputManager отписан от событий');
  }
}

// Создаем экземпляр
export const inputManager = new InputManager();

// ==========================================
// ✅ ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ==========================================

// Оставляем для старого кода (постепенно уберем)
(window as any).expandInputArea = inputManager.expandInputArea.bind(inputManager);
(window as any).collapseInputArea = inputManager.collapseInputArea.bind(inputManager);
(window as any).clearUserText = inputManager.clearUserText.bind(inputManager);

console.log('✅ InputManager v1.0.0 загружен');
