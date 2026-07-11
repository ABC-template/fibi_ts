// ============================================
// src/core/navigation.ts
// Нижняя навигация с иконками Lucide
// Версия: 3.1.0 - FIXED
// ============================================

export interface INavTab {
  id: string;
  icon: string;
  label: string;
}

export class Navigation {
  private tabs: INavTab[] = [
    { id: 'dashboard', icon: 'home', label: 'Главная' },
    { id: 'organizer', icon: 'layout-dashboard', label: 'Органайзер' },
    { id: 'chat-list', icon: 'message-square', label: 'Versatile AI' },
    { id: 'games', icon: 'gamepad-2', label: 'Игры' },
    { id: 'tasks', icon: 'trophy', label: 'Задания' },
  ];
  private activeTab: string = 'dashboard';
  private navElement: HTMLElement | null = null;
  private _isSwitching: boolean = false;

  constructor() {
    console.log('✅ Navigation v3.1.0 загружен');
  }

  render(): void {
    if (document.getElementById('bottom-nav')) return;

    this.navElement = document.createElement('div');
    this.navElement.id = 'bottom-nav';
    this.navElement.className = 'bottom-nav';

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

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 50);

    console.log('📱 Навигация инициализирована');
  }

  switchTab(tabId: string): void {
    if (this.activeTab === tabId) {
      console.log(`📱 Уже в разделе ${tabId}, переключение не требуется`);
      return;
    }

    if (this._isSwitching) return;
    this._isSwitching = true;

    if (!this.tabs.find(t => t.id === tabId)) {
      console.warn(`⚠️ Вкладка ${tabId} не найдена`);
      this._isSwitching = false;
      return;
    }

    this.setActive(tabId);

    // Закрываем сайдбар мгновенно
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer?.classList.contains('active')) {
      console.log('📂 Закрываем сайдбар мгновенно (переключение вкладки)');
      
      drawer.classList.remove('active');
      drawer.classList.remove('drawer-anim-in');
      drawer.classList.remove('drawer-anim-out');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
      
      if ((window as any).navigationState) {
        (window as any).navigationState.toggleDrawer(false);
      }
      if ((window as any).eventBus) {
        (window as any).eventBus.emit('drawer:state_changed', { isOpen: false });
      }
    }

    if ((window as any).moduleLoader) {
      (window as any).moduleLoader.load(tabId).finally(() => {
        this._isSwitching = false;
      });
    } else {
      this._isSwitching = false;
    }

    console.log(`📱 Переключение на: ${tabId}`);
  }

  setActive(tabId: string): void {
    this.activeTab = tabId;
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      const element = btn as HTMLElement;
      const isActive = element.dataset.tab === tabId;
      element.classList.toggle('active', isActive);
      if (isActive) {
        setTimeout(() => {
          if (typeof (window as any).lucide !== 'undefined') {
            (window as any).lucide.createIcons();
          }
        }, 50);
      }
    });
  }

  hide(): void {
    if (this.navElement) this.navElement.classList.add('hidden');
  }

  show(): void {
    if (this.navElement) this.navElement.classList.remove('hidden');
  }

  getActive(): string {
    return this.activeTab;
  }
}

// Создаем экземпляр
export const navigation = new Navigation();
console.log('✅ Navigation v3.1.0 загружен');
