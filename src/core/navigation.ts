// ============================================
// src/core/navigation.ts
// Нижняя навигация с иконками Lucide
// Версия: 5.0.0 — видимость меню решает ModuleLoader (везде, кроме чата и открытой игры);
//                  высота меню + отступ снизу публикуются в CSS-переменной --app-nav-space,
//                  #app-screen отступает на неё — меню больше не закрывает контент;
//                  переключение вкладок идёт через NavigationState (раньше в обход:
//                  состояние навигации и кнопка «Назад» отставали); switchTab открывает и
//                  модули без вкладки (например, «Настройки» с главной)
//          4.1.0 — добавлен AgentsModule
// ============================================

import { navigationState } from './navigation-state';

export interface INavTab {
  id: string;
  icon: string;
  label: string;
}

/** Зазор между меню и контентом над ним */
const NAV_CONTENT_GAP = 8;

export class Navigation {
  private tabs: INavTab[] = [
    { id: 'dashboard', icon: 'home', label: 'Главная' },
    { id: 'organizer', icon: 'layout-dashboard', label: 'Органайзер' },
    { id: 'agents', icon: 'bot', label: 'Агенты' },
    { id: 'games', icon: 'gamepad-2', label: 'Игры' },
    { id: 'quests', icon: 'trophy', label: 'Задания' },
  ];
  private activeTab: string = 'dashboard';
  private navElement: HTMLElement | null = null;
  private _visible = true;
  private _resizeObserver: ResizeObserver | null = null;

  render(): void {
    if (document.getElementById('bottom-nav')) return;

    this.navElement = document.createElement('div');
    this.navElement.id = 'bottom-nav';
    this.navElement.className = 'bottom-nav';
    if (!this._visible) this.navElement.classList.add('hidden');

    this.tabs.forEach((tab, index) => {
      const btn = document.createElement('button');
      const isCenter = index === Math.floor(this.tabs.length / 2);
      btn.className = `nav-tab ${tab.id === this.activeTab ? 'active' : ''} ${isCenter ? 'center-tab' : ''}`;
      (btn as HTMLElement).dataset.tab = tab.id;
      btn.innerHTML = `
        <span class="nav-icon" data-lucide="${tab.icon}"></span>
        <span class="nav-label">${tab.label}</span>
      `;
      btn.addEventListener('click', () => this.switchTab(tab.id));
      this.navElement!.appendChild(btn);
    });

    document.body.appendChild(this.navElement);

    // Высота меню меняется вместе с иконками, шрифтом и поворотом экрана
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._publishSpace());
      this._resizeObserver.observe(this.navElement);
    }
    window.addEventListener('resize', () => this._publishSpace());
    this._publishSpace();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
      this._publishSpace();
    }, 50);
  }

  /** Вкладка меню — корневой раздел (история сбрасывается); другой модуль — переход с историей */
  switchTab(tabId: string): void {
    if (this.tabs.some((t) => t.id === tabId)) {
      if (navigationState.currentModule === tabId) return;
      (window as any).closeDrawer?.({ instant: true });
      void navigationState.switchRoot(tabId);
      return;
    }
    (window as any).closeDrawer?.({ instant: true });
    void navigationState.navigate(tabId, {}, { addToHistory: true });
  }

  /** Подсветка вкладки текущего модуля (у модуля без вкладки подсветки нет) */
  setActive(moduleName: string): void {
    this.activeTab = moduleName;
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      const element = btn as HTMLElement;
      element.classList.toggle('active', element.dataset.tab === moduleName);
    });
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this.navElement?.classList.toggle('hidden', !visible);
    this._publishSpace();
  }

  hide(): void {
    this.setVisible(false);
  }

  show(): void {
    this.setVisible(true);
  }

  getActive(): string {
    return this.activeTab;
  }

  /** --app-nav-space: сколько места снизу занимает меню (0, когда оно скрыто) */
  private _publishSpace(): void {
    let space = 0;
    if (this._visible && this.navElement && !this.navElement.classList.contains('hidden')) {
      const rect = this.navElement.getBoundingClientRect();
      if (rect.height > 0) {
        const bottomGap = Math.max(0, window.innerHeight - rect.bottom);
        space = Math.ceil(rect.height + bottomGap + NAV_CONTENT_GAP);
      }
    }
    document.documentElement.style.setProperty('--app-nav-space', `${space}px`);
  }
}

export const navigation = new Navigation();
