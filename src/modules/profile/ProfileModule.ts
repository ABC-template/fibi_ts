// ============================================
// src/modules/profile/ProfileModule.ts
// Полноценная страница профиля
// Версия: 4.0.0 - TypeScript
// ============================================

import { headerManager } from '@/core/header-manager';
import { navigationState } from '@/core/navigation-state';
import { eventBus } from '@/core/event-bus';
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { tasksStore } from '@/store/TasksStore';
import { themeManager } from '@/core/theme-manager';
import type { ThemeType } from '@/core/theme-manager';

export class ProfileModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _subscriptions: Array<() => void> = [];
  private headerManager = headerManager;
  private navigationState = navigationState;
  private eventBus = eventBus;
  private chatStore = chatStore;
  private userStore = userStore;
  private tasksStore = tasksStore;
  private themeManager = themeManager;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    this.headerManager.setTitle('⚙️ Настройки');
    this.headerManager.setActions([]);

    this.container.innerHTML = `
      <div style="
        padding: 16px 16px 100px 16px;
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--app-border-color-light);
        ">
          <h2 style="
            font-size: 20px;
            font-weight: 700;
            margin: 0;
            color: var(--app-text-primary);
          ">
            ⚙️ Настройки
          </h2>
        </div>

        <!-- БЛОК 1: ПОЛЬЗОВАТЕЛЬ -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 20px;
          border: 1px solid var(--app-border-color-light);
          display: flex;
          align-items: center;
          gap: 16px;
        ">
          <img id="profile-avatar" src="" alt="Аватар" style="
            width: 64px;
            height: 64px;
            border-radius: 50%;
            border: 3px solid var(--app-accent-primary);
            object-fit: cover;
            flex-shrink: 0;
          ">
          <div style="flex:1;min-width:0;">
            <div id="profile-name" style="
              font-size: 18px;
              font-weight: 600;
              color: var(--app-text-primary);
            ">Загрузка...</div>
            <div id="profile-username" style="
              font-size: 14px;
              color: var(--app-text-tertiary);
            ">@username</div>
            <div style="
              display: flex;
              align-items: center;
              gap: 8px;
              margin-top: 4px;
            ">
              <span id="profile-role" style="
                font-size: 12px;
                font-weight: 600;
                color: var(--app-accent-primary);
                background: var(--app-accent-glow);
                padding: 2px 12px;
                border-radius: 12px;
              ">🔓 Бесплатный</span>
              <span class="drawer-coins-badge" onclick="window.goToTasks()" style="
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 13px;
                font-weight: 600;
                color: var(--app-text-primary);
                cursor: pointer;
                padding: 2px 10px 2px 6px;
                border-radius: 16px;
                background: rgba(212,175,55,0.08);
                transition: all 0.15s ease;
              ">
                <i data-lucide="coins" style="width:16px;height:16px;color:var(--app-accent-primary);"></i>
                <span id="profile-coins" style="color: var(--app-accent-primary);">0</span>
              </span>
            </div>
          </div>
        </div>

        <!-- БЛОК 2: СТАТИСТИКА -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 16px;
          border: 1px solid var(--app-border-color-light);
        ">
          <div style="
            font-size: 14px;
            font-weight: 600;
            color: var(--app-text-primary);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <i data-lucide="bar-chart-3" style="width:18px;height:18px;"></i>
            Ваша статистика
          </div>
          <div style="
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
          ">
            <div style="
              text-align: center;
              padding: 12px 8px;
              background: var(--app-bg-tertiary);
              border-radius: 10px;
            ">
              <div id="profile-stat-chats" style="
                font-size: 20px;
                font-weight: 700;
                color: var(--app-accent-primary);
              ">0</div>
              <div style="
                font-size: 11px;
                color: var(--app-text-tertiary);
              ">Чатов</div>
            </div>
            <div style="
              text-align: center;
              padding: 12px 8px;
              background: var(--app-bg-tertiary);
              border-radius: 10px;
            ">
              <div id="profile-stat-messages" style="
                font-size: 20px;
                font-weight: 700;
                color: var(--app-accent-primary);
              ">0</div>
              <div style="
                font-size: 11px;
                color: var(--app-text-tertiary);
              ">Сообщений</div>
            </div>
            <div style="
              text-align: center;
              padding: 12px 8px;
              background: var(--app-bg-tertiary);
              border-radius: 10px;
            ">
              <div id="profile-stat-favorites" style="
                font-size: 20px;
                font-weight: 700;
                color: var(--app-accent-primary);
              ">0</div>
              <div style="
                font-size: 11px;
                color: var(--app-text-tertiary);
              ">Избранных</div>
            </div>
          </div>

          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--app-border-color-light);">
            <div style="
              display: flex;
              justify-content: space-between;
              font-size: 12px;
              color: var(--app-text-secondary);
              margin-bottom: 4px;
            ">
              <span>Ежедневный лимит</span>
              <span id="profile-limit-text">0/0</span>
            </div>
            <div style="
              width: 100%;
              height: 6px;
              background: var(--app-bg-tertiary);
              border-radius: 3px;
              overflow: hidden;
            ">
              <div id="profile-limit-bar" style="
                width: 0%;
                height: 100%;
                background: var(--app-gradient-primary);
                border-radius: 3px;
                transition: width 0.3s ease;
              "></div>
            </div>
          </div>
        </div>

        <!-- БЛОК 3: НАСТРОЙКИ -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 16px;
          border: 1px solid var(--app-border-color-light);
          overflow: hidden;
        ">
          <div style="
            padding: 14px 16px;
            border-bottom: 1px solid var(--app-border-color-light);
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <span style="
              font-size: 14px;
              font-weight: 500;
              color: var(--app-text-primary);
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <i data-lucide="palette" style="width:18px;height:18px;"></i>
              Тема оформления
            </span>
            <div style="display:flex; gap:6px;">
              <button class="theme-selector-btn" data-theme-btn="light" onclick="window.themeManager.setTheme('light')" style="
                padding: 4px 14px;
                border-radius: 8px;
                border: 2px solid ${this.themeManager.getCurrentTheme() === 'light' ? 'var(--app-accent-primary)' : 'var(--app-border-color)'};
                background: ${this.themeManager.getCurrentTheme() === 'light' ? 'var(--app-accent-glow)' : 'transparent'};
                cursor: pointer;
                font-size: 12px;
                color: var(--app-text-primary);
                transition: all 0.2s ease;
              ">
                <i data-lucide="sun" style="width:14px;height:14px;"></i> Светлая
              </button>
              <button class="theme-selector-btn" data-theme-btn="amoled" onclick="window.themeManager.setTheme('amoled')" style="
                padding: 4px 14px;
                border-radius: 8px;
                border: 2px solid ${this.themeManager.getCurrentTheme() === 'amoled' ? 'var(--app-accent-primary)' : 'var(--app-border-color)'};
                background: ${this.themeManager.getCurrentTheme() === 'amoled' ? 'var(--app-accent-glow)' : 'transparent'};
                cursor: pointer;
                font-size: 12px;
                color: var(--app-text-primary);
                transition: all 0.2s ease;
              ">
                <i data-lucide="moon" style="width:14px;height:14px;"></i> AMOLED
              </button>
            </div>
          </div>
        </div>

        <!-- БЛОК 4: ДАННЫЕ -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 16px;
          border: 1px solid var(--app-border-color-light);
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">
          <div style="
            font-size: 14px;
            font-weight: 600;
            color: var(--app-text-primary);
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <i data-lucide="download" style="width:18px;height:18px;"></i>
            Экспорт данных
          </div>
          <button class="btn btn-secondary" onclick="window.exportLocalArchive()" style="
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            font-size: 14px;
            background: var(--app-bg-tertiary);
            border: 1px solid var(--app-border-color-light);
            cursor: pointer;
            color: var(--app-text-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
          ">
            <i data-lucide="folder-down" style="width:18px;height:18px;"></i>
            💾 Экспорт локального архива
          </button>
          <button class="btn btn-secondary" id="cloud-export-btn" onclick="window.exportCloudArchive()" style="
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            font-size: 14px;
            background: var(--app-bg-tertiary);
            border: 1px solid var(--app-border-color-light);
            cursor: pointer;
            color: var(--app-text-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
            ${!this.userStore.canSync() ? 'opacity: 0.5; pointer-events: none;' : ''}
          ">
            <i data-lucide="cloud" style="width:18px;height:18px;"></i>
            ☁️ Экспорт облачного архива ${!this.userStore.canSync() ? '(🔒 PRO)' : ''}
          </button>
        </div>

        <!-- БЛОК 5: БЕЗОПАСНОСТЬ -->
        <div style="
          background: var(--app-bg-secondary);
          border-radius: 16px;
          padding: 16px;
          border: 1px solid var(--app-border-color-light);
        ">
          <button onclick="window.clearCacheFromProfile()" style="
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            font-size: 14px;
            background: rgba(231,76,60,0.08);
            border: 1px solid rgba(231,76,60,0.2);
            cursor: pointer;
            color: #e74c3c;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
          ">
            <i data-lucide="trash" style="width:18px;height:18px;"></i>
            🧹 Очистить кэш
          </button>
        </div>

        <div style="
          text-align: center;
          font-size: 12px;
          color: var(--app-text-tertiary);
          padding: 8px 0;
        ">
          Версия 8.0.0
        </div>
      </div>
    `;

    this.updateProfileData();
    this.updateStats();
    this._subscribeToEvents();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ ProfileModule v4.0.0 инициализирован');
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToEvents(): void {
    const unsubBalance = this.eventBus.on('tasks:balance_changed', (data) => {
      const coinsEl = document.getElementById('profile-coins');
      if (coinsEl) coinsEl.textContent = String(data.newBalance || 0);
    }, this);
    this._subscriptions.push(unsubBalance);

    const unsubRole = this.eventBus.on('user:role_changed', (data) => {
      this._updateRole(data.newRole);
      this.updateStats();
    }, this);
    this._subscriptions.push(unsubRole);

    const unsubUsage = this.eventBus.on('user:usage_incremented', (data) => {
      this._updateLimits(data.used, data.limit);
    }, this);
    this._subscriptions.push(unsubUsage);

    const unsubChats = this.eventBus.on('chat:all_updated', () => {
      this.updateStats();
    }, this);
    this._subscriptions.push(unsubChats);

    const unsubFav = this.eventBus.on('chat:favorite_toggled', () => {
      this.updateStats();
    }, this);
    this._subscriptions.push(unsubFav);

    console.log('📡 ProfileModule подписан на события');
  }

  // ==========================================
  // ОБНОВЛЕНИЕ ДАННЫХ
  // ==========================================

  updateProfileData(): void {
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const avatarEl = document.getElementById('profile-avatar') as HTMLImageElement;
    const nameEl = document.getElementById('profile-name');
    const usernameEl = document.getElementById('profile-username');
    const roleEl = document.getElementById('profile-role');
    const coinsEl = document.getElementById('profile-coins');

    if (user) {
      if (avatarEl) avatarEl.src = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
      if (nameEl) nameEl.textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
      if (usernameEl) usernameEl.textContent = user.username ? '@' + user.username : '';
    }

    this._updateRole(this.userStore.role);

    if (coinsEl) {
      coinsEl.textContent = String(this.tasksStore.getBalance() || 0);
    }

    this._updateLimits(this.userStore.usedToday || 0, this.userStore.dailyLimit || 0);
  }

  private _updateRole(role: string): void {
    const roleEl = document.getElementById('profile-role');
    if (!roleEl) return;
    const roleMap: Record<string, string> = {
      'trial': '🔓 Бесплатный',
      'premium': '⭐ PRO',
      'admin': '👑 Админ',
      'creator': '👑 Создатель'
    };
    roleEl.textContent = roleMap[role] || role;
  }

  private _updateLimits(used: number, limit: number): void {
    const limitText = document.getElementById('profile-limit-text');
    const limitBar = document.getElementById('profile-limit-bar');

    if (limitText) {
      if (limit >= 9999) {
        limitText.textContent = '∞ (безлимит)';
      } else {
        limitText.textContent = `${used}/${limit}`;
      }
    }

    if (limitBar) {
      const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
      limitBar.style.width = limit >= 9999 ? '100%' : `${percent}%`;
    }
  }

  updateStats(): void {
    const allChats: any[] = [];
    for (const [topic, chats] of Object.entries(this.chatStore.histories || {})) {
      if (!chats) continue;
      for (const chat of chats) {
        if (chat.deleted_at) continue;
        if (!this.chatStore.hasRealMessages(chat)) continue;
        allChats.push(chat);
      }
    }

    let totalMessages = 0;
    let activeChats = 0;
    for (const chat of allChats) {
      const messages = chat.messages?.filter((m: any) => !m.deleted_at) || [];
      if (messages.length > 0) activeChats++;
      totalMessages += messages.length;
    }

    const favorites = this.chatStore.getFavorites();

    const chatsEl = document.getElementById('profile-stat-chats');
    const msgEl = document.getElementById('profile-stat-messages');
    const favEl = document.getElementById('profile-stat-favorites');

    if (chatsEl) chatsEl.textContent = String(activeChats || 0);
    if (msgEl) msgEl.textContent = String(totalMessages);
    if (favEl) favEl.textContent = String(favorites.length || 0);
  }

  // ==========================================
  // УПРАВЛЕНИЕ МОДУЛЕМ
  // ==========================================

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle('⚙️ Настройки');
    this.headerManager.setActions([]);

    this.updateProfileData();
    this.updateStats();

    if ((window as any).navigation) {
      (window as any).navigation.hide();
    }

    console.log('📱 ProfileModule показан');
  }

  hide(): void {
    this.container.classList.add('hidden');
    this.container.style.display = 'none';

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }

    console.log('📱 ProfileModule скрыт');
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки ProfileModule:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 ProfileModule отписан от событий');
  }
}

// Экспортируем класс в глобальный объект
(window as any).ProfileModule = ProfileModule;

// Глобальные функции
(window as any).goBackFromProfile = function(): void {
  console.log('🔙 Возврат из профиля');

  if ((window as any).navigationState) {
    (window as any).navigationState.back();
  } else if ((window as any).eventBus) {
    (window as any).eventBus.emit('navigation:go_back');
  } else {
    if ((window as any).moduleLoader) {
      (window as any).moduleLoader.load('dashboard');
    }
  }
};

(window as any).clearCacheFromProfile = function(): void {
  const confirmMsg = 'Очистить локальный кэш приложения?\n\n' +
    '⚠️ Ваши НЕСИНХРОНИЗИРОВАННЫЕ данные (TRIAL) будут потеряны.\n' +
    '☁️ Синхронизированные данные (PRO) восстановятся из облака.';

  const doClear = (): void => {
    if ((window as any).tasksStore) {
      (window as any).tasksStore._data = {};
      (window as any).tasksStore.save();
      (window as any).tasksStore.clearJWT();
    }
    if ((window as any).chatStore) {
      (window as any).chatStore._data = {};
      (window as any).chatStore.save();
      (window as any).chatStore.clearJWT();
    }
    if ((window as any).userStore) {
      (window as any).userStore._data = {};
      (window as any).userStore.save();
      (window as any).userStore.clearJWT();
    }
    if ((window as any).organizerStore) {
      (window as any).organizerStore._data = {};
      (window as any).organizerStore.save();
      (window as any).organizerStore.clearJWT();
    }

    localStorage.removeItem('sync_token');

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sync_token_') && key !== 'sync_token') {
        localStorage.removeItem(key);
      }
    }

    localStorage.removeItem('last_user_id');

    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast('🧹 Кэш и токен очищены', 'success', 1500);
    }

    (window as any).goBackFromProfile();
    setTimeout(() => location.reload(), 1000);
  };

  if ((window as any).tg?.showConfirm) {
    (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) doClear(); });
  } else if (confirm(confirmMsg)) {
    doClear();
  }
};

console.log('✅ ProfileModule v4.0.0 загружен');
