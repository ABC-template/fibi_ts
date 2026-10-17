// ============================================
// src/core/back-button-manager.ts
// Управление системной кнопкой «Назад» Telegram
// Версия: 6.2.0 - без особого случая для игр: открытая игра — слой в стеке навигации
//                 (её закрывает «Назад» через NavigationState, как модалки и просмотрщик)
//          6.1.0 - обновлена логика
// ============================================

import { eventBus } from './event-bus';
import { navigationState } from './navigation-state';

export class BackButtonManager {
  private tg: any;
  private eventBus = eventBus;
  private navigationState = navigationState;
  private _isVisible: boolean = false;
  private _subscriptions: Array<() => void> = [];

  constructor() {
    this.tg = (window as any).Telegram?.WebApp;
    this._init();
  }

  private _init(): void {
    if (!this.tg || !this.tg.BackButton) {
      console.warn('⚠️ BackButtonManager: Telegram BackButton не доступен');
      return;
    }

    this.tg.BackButton.hide();
    this._isVisible = false;

    const unsub1 = this.eventBus.on('navigation:state_changed', () => {
      this._update();
    }, this);
    this._subscriptions.push(unsub1);

    const unsub2 = this.eventBus.on('module:loaded', () => {
      this._update();
    }, this);
    this._subscriptions.push(unsub2);

    const unsub3 = this.eventBus.on('drawer:state_changed', () => {
      this._update();
    }, this);
    this._subscriptions.push(unsub3);

    const unsub5 = this.eventBus.on('modal:state_changed', () => {
      this._update();
    }, this);
    this._subscriptions.push(unsub5);

    // ✅ Подписка на состояние капсулы
    const unsub6 = this.eventBus.on('input:state_changed', () => {
      this._update();
    }, this);
    this._subscriptions.push(unsub6);

    this.tg.BackButton.offClick();
    this.tg.BackButton.onClick(() => {
      this._handleBackPress();
    });

    setTimeout(() => this._update(), 100);

    console.log('✅ BackButtonManager v6.1.0 инициализирован');
  }

  private _update(): void {
    const shouldShow = this._shouldShow();
    
    if (shouldShow) {
      this.show();
    } else {
      this.hide();
    }
  }

  private _shouldShow(): boolean {
    return this.navigationState.shouldShowBackButton();
  }

  show(): void {
    if (!this.tg || !this.tg.BackButton) return;
    if (this._isVisible) return;
    
    try {
      this.tg.BackButton.show();
      this._isVisible = true;
      console.log('🔙 BackButton показан');
    } catch (e) {
      console.warn('⚠️ Ошибка показа BackButton:', e);
    }
  }

  hide(): void {
    if (!this.tg || !this.tg.BackButton) return;
    if (!this._isVisible) return;
    
    try {
      this.tg.BackButton.hide();
      this._isVisible = false;
      console.log('🔙 BackButton скрыт');
    } catch (e) {
      console.warn('⚠️ Ошибка скрытия BackButton:', e);
    }
  }

  private _handleBackPress(): void {
    this.navigationState.back();
  }

  refresh(): void {
    this._update();
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки BackButtonManager:', e);
      }
    }
    this._subscriptions = [];
    this.hide();
    console.log('📡 BackButtonManager отписан от событий');
  }
}

export const backButtonManager = new BackButtonManager();
console.log('✅ BackButtonManager v6.1.0 загружен');
