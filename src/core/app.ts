// ============================================
// src/core/app.ts
// Инициализация приложения
// Версия: 8.4.0 - ДОБАВЛЕНА РЕГИСТРАЦИЯ МОДУЛЕЙ
// ============================================

import './config';
import { moduleLoader } from './module-loader';
import { navigationState } from './navigation-state';
import { navigation } from './navigation';
import { backButtonManager } from './back-button-manager';
import { modalManager } from './modal-manager';
import { headerManager } from './header-manager';
import { themeManager } from './theme-manager';
import { eventBus } from './event-bus';
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { organizerStore } from '@/store/OrganizerStore';
import { tasksStore } from '@/store/TasksStore';
import { authService } from '@/services/auth';
import { syncService } from '@/services/sync';
import { chatService } from '@/services/chats';
import { messageService } from '@/services/messages';
import { uiRenderer } from '@/modules/ui/renderer';
import { chatUI } from '@/modules/ui/chat-ui';
import { profileUI } from '@/modules/ui/profile-ui';
import { organizerUI } from '@/modules/ui/organizer-ui';

// ✅ ИМПОРТ ВСЕХ МОДУЛЕЙ ДЛЯ РЕГИСТРАЦИИ
import { DashboardModule } from '@/modules/dashboard/DashboardModule';
import { ChatListModule } from '@/modules/chat-list/ChatListModule';
import { ChatModule } from '@/modules/chat/ChatModule';
import { OrganizerModule } from '@/modules/organizer/OrganizerModule';
import { ProfileModule } from '@/modules/profile/ProfileModule';
import { TasksModule } from '@/modules/tasks/TasksModule';
import { GamesModule } from '@/modules/games/GamesModule';

// ✅ ТИПЫ
import type { TopicId, IChat } from '@types';

console.log('🚀 App v8.4.0 начал загрузку');

// ==========================================
// ✅ 1. РЕГИСТРАЦИЯ ВСЕХ МОДУЛЕЙ
// ==========================================

function registerModules(): void {
    console.log('📦 Регистрируем модули...');
    
    moduleLoader.register('dashboard', DashboardModule);
    moduleLoader.register('organizer', OrganizerModule);
    moduleLoader.register('chat-list', ChatListModule);
    moduleLoader.register('chat', ChatModule);
    moduleLoader.register('games', GamesModule);
    moduleLoader.register('tasks', TasksModule);
    moduleLoader.register('profile', ProfileModule);
    
    console.log('✅ Все модули зарегистрированы');
}

// ==========================================
// ✅ 2. ПРИВЯЗКА UI К WINDOW
// ==========================================

function bindUIToWindow(): void {
    console.log('🔗 Привязываем UI к window...');
    
    // UI экземпляры
    window.uiRenderer = uiRenderer;
    window.chatUI = chatUI;
    window.profileUI = profileUI;
    window.organizerUI = organizerUI;
    
    // Store экземпляры
    window.chatStore = chatStore;
    window.userStore = userStore;
    window.organizerStore = organizerStore;
    window.tasksStore = tasksStore;
    
    window.chatSend = chatSend;
    
    // Service экземпляры
    window.authService = authService;
    window.chatService = chatService;
    window.messageService = messageService;
    window.syncService = syncService;
    
    // Core экземпляры (уже есть, но на всякий случай)
    window.moduleLoader = moduleLoader;
    window.navigationState = navigationState;
    window.navigation = navigation;
    window.backButtonManager = backButtonManager;
    window.modalManager = modalManager;
    window.headerManager = headerManager;
    window.themeManager = themeManager;
    window.eventBus = eventBus;
    
    console.log('✅ UI привязан к window');
}

// ==========================================
// ПРОВЕРКА: ОТКРЫТО ЛИ В TELEGRAM?
// ==========================================

function isTelegramWebApp(): boolean {
    try {
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        const initDataUnsafe = tg?.initDataUnsafe || {};
        return !!(initData && initData.length > 0 && initDataUnsafe?.user?.id);
    } catch (e) {
        return false;
    }
}

// ==========================================
// ПОКАЗАТЬ ЗАГЛУШКУ (ВНЕ TELEGRAM)
// ==========================================

function showTelegramRequiredScreen(): void {
    const appScreen = document.getElementById('app-screen');
    const header = document.getElementById('header');
    if (header) header.classList.add('hidden');
    if (appScreen) appScreen.style.display = 'none';

    let wrapper = document.getElementById('telegram-required-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'telegram-required-wrapper';
        wrapper.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: var(--app-bg-primary, #0A0A0A); padding: 32px; box-sizing: border-box;
            z-index: 10000; text-align: center; font-family: var(--app-font-family, -apple-system, sans-serif);
        `;
        wrapper.innerHTML = `
            <div style="max-width: 380px; width: 100%;">
                <div style="font-size: 64px; margin-bottom: 16px;">📱</div>
                <h1 style="font-size: 24px; font-weight: 700; color: var(--app-text-primary, #FFFFFF); margin: 0 0 8px 0;">
                    Вероятно, вы ищете наш бот
                </h1>
                <p style="font-size: 16px; color: var(--app-text-secondary, #E8E0D0); margin: 0 0 6px 0; line-height: 1.5;">
                    Это приложение работает <strong>только внутри Telegram</strong>.
                </p>
                <p style="font-size: 14px; color: var(--app-text-tertiary, #A89880); margin: 0 0 24px 0; line-height: 1.5;">
                    Пожалуйста, откройте его через Telegram Mini App.
                </p>
                <a href="https://t.me/versatile_ai_bot"
                   style="display: inline-block; padding: 14px 32px; border-radius: 12px;
                          background: var(--app-gradient-primary, linear-gradient(135deg, #D4AF37 0%, #C5A059 50%, #A88830 100%));
                          color: #1A1A0A; font-weight: 600; font-size: 16px; text-decoration: none;
                          box-shadow: 0 4px 20px rgba(212,175,55,0.3); transition: transform 0.15s ease;">
                    📲 Открыть в Telegram
                </a>
                <div style="margin-top: 24px; font-size: 12px; color: var(--app-text-tertiary, #A89880);">
                    Версия 8.4.0
                </div>
            </div>
        `;
        document.body.prepend(wrapper);
    } else {
        wrapper.style.display = 'flex';
    }
}

// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ==========================================

window.showGuest = function(data: { msg: string; joke: string }): void {
    const guestScreen = document.getElementById('guest-screen');
    const errorTitle = document.getElementById('error-title');
    const jokeText = document.getElementById('joke-text');
    const appScreen = document.getElementById('app-screen');

    if (guestScreen) {
        guestScreen.classList.remove('hidden');
        guestScreen.style.display = 'flex';
    }
    if (appScreen) {
        appScreen.style.display = 'none';
    }
    if (errorTitle) errorTitle.textContent = `⚠️ ${data.msg || 'Доступ ограничен'}`;
    if (jokeText) jokeText.textContent = data.joke || 'Пожалуйста, подпишитесь на канал для доступа.';
};

window.refreshSyncToken = async function(): Promise<string | null> {
    try {
        const result = await authService.checkSubscription();
        if (result.syncToken) {
            localStorage.setItem('sync_token', result.syncToken);
            console.log(`✅ sync_token обновлен: ${result.syncToken.substring(0, 8)}...`);
            return result.syncToken;
        }
        return null;
    } catch (err) {
        console.error('❌ Ошибка обновления sync_token:', err);
        return null;
    }
};

window.initExportButtons = function(): void {
    const exportContainer = document.getElementById('export-buttons-container');
    if (!exportContainer) {
        const profileTab = document.getElementById('tab-profile');
        if (profileTab) {
            const container = document.createElement('div');
            container.id = 'export-buttons-container';
            container.style.cssText = 'margin-top: 16px; display: flex; flex-direction: column; gap: 8px;';
            container.innerHTML = `
                <button class="btn btn-secondary" onclick="window.exportLocalArchive()" style="width:100%;">
                    💾 Экспорт локального архива
                </button>
                <button class="btn btn-secondary" id="cloud-export-btn" onclick="window.exportCloudArchive()" style="width:100%;">
                    ☁️ Экспорт облачного архива (PRO)
                </button>
            `;
            profileTab.appendChild(container);
        }
    }

    const cloudBtn = document.getElementById('cloud-export-btn');
    if (cloudBtn) {
        if (userStore.canSync()) {
            cloudBtn.style.display = 'block';
            cloudBtn.textContent = '☁️ Экспорт облачного архива (PRO)';
            cloudBtn.style.opacity = '1';
        } else {
            cloudBtn.style.display = 'block';
            cloudBtn.textContent = '🔒 Облачный архив (доступен по PRO подписке)';
            cloudBtn.style.opacity = '0.6';
        }
    }
};

window.updateRealtimeIndicator = function(status: string): void {
    const indicator = document.getElementById('realtime-indicator');
    if (!indicator) return;

    const statusMap: Record<string, { emoji: string; text: string; className: string }> = {
        'connected': { emoji: '🟢', text: 'Синхр.', className: 'online' },
        'connecting': { emoji: '🟡', text: 'Подкл.', className: 'connecting' },
        'offline': { emoji: '🔴', text: 'Офлайн', className: 'offline' },
        'syncing': { emoji: '🔄', text: 'Синхр.', className: 'connecting' },
    };

    const state = statusMap[status] || statusMap.offline;
    indicator.textContent = state.emoji;
    indicator.className = `realtime-indicator ${state.className}`;
    indicator.title = state.text;
};

window.showBetaAlert = function(): void {
    const message = window.getLangString ?
        window.getLangString('beta_alert') :
        'Данная функция находится в разработке (Beta) и появится в ближайших обновлениях приложения!';

    if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
    } else {
        alert(message);
    }
};

window.getCurrentActiveChat = function() {
    return chatStore.getActiveChat();
};

// ==========================================
// ОБРАБОТКА ОФЛАЙН/ОНЛАЙН
// ==========================================

let offlineBanner: HTMLElement | null = null;
let offlineStartTime: number | null = null;

window.showOfflineBanner = function(message: string = 'Нет интернета. Просмотр доступен, изменения невозможны.'): void {
    if (offlineBanner) return;

    offlineBanner = document.createElement('div');
    offlineBanner.id = 'offline-banner';
    offlineBanner.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        background: var(--app-accent-danger, #e74c3c); color: white;
        padding: 12px 16px; text-align: center; font-size: 13px; font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2); animation: slideDown 0.3s ease;
        font-family: var(--app-font-family, -apple-system, sans-serif);
    `;
    offlineBanner.textContent = `⚠️ ${message}`;
    document.body.prepend(offlineBanner);

    if (!document.getElementById('offline-banner-styles')) {
        const style = document.createElement('style');
        style.id = 'offline-banner-styles';
        style.textContent = `
            @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
            @keyframes slideUp { from { transform: translateY(0); } to { transform: translateY(-100%); } }
        `;
        document.head.appendChild(style);
    }
};

window.hideOfflineBanner = function(): void {
    if (!offlineBanner) return;
    offlineBanner.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => {
        if (offlineBanner) { offlineBanner.remove(); offlineBanner = null; }
    }, 300);
};

window.addEventListener('offline', () => {
    console.log('📴 Интернет потерян');
    offlineStartTime = Date.now();
    window.showOfflineBanner();
});

window.addEventListener('online', () => {
    console.log('🌐 Интернет восстановлен');
    const duration = Date.now() - (offlineStartTime || 0);
    const OFFLINE_THRESHOLD = 30 * 1000;

    if (duration < OFFLINE_THRESHOLD) {
        console.log('🌐 Короткий обрыв (< 30 сек), возобновляем Realtime');
        if (syncService.isActive()) {
            if (window.chatListModule) {
                window.chatListModule.show();
            }
        } else {
            const userId = userStore.userId;
            if (userId && syncService) syncService.subscribe(userId);
        }
    } else {
        console.log('🌐 Долгий обрыв (> 30 сек), проверяем токен');
        handleLongOffline();
    }
    window.hideOfflineBanner();
    offlineStartTime = null;
});

async function handleLongOffline(): Promise<void> {
    try {
        const result = await authService.checkSubscription();
        const syncToken = result.syncToken;
        let localToken = localStorage.getItem('sync_token');

        if (syncToken !== localToken) {
            console.log('🔄 Токен изменился за время обрыва → полная перезапись');
            localStorage.setItem('sync_token', syncToken || '');
            await window.fullDataReload();
        } else {
            console.log('✅ Токен актуален, просто обновляем UI');
            if (window.chatListModule) {
                window.chatListModule.show();
            }
        }

        const isPro = result.role === 'pro' || result.role === 'premium' || result.role === 'admin' || result.role === 'creator';
        if (isPro && syncService) {
            const userId = userStore.userId;
            if (userId) syncService.subscribe(userId);
        }
    } catch (err) {
        console.error('❌ Ошибка обработки восстановления интернета:', err);
    }
}

// ==========================================
// ПОЛНАЯ ПЕРЕЗАГРУЗКА ДАННЫХ
// ==========================================

window.fullDataReload = async function(): Promise<boolean> {
    console.log('🔄 [fullDataReload] Полная перезагрузка данных...');
    try {
        if (chatService) {
            const result = await chatService.fullReload();
            if (result) {
                console.log('✅ [fullDataReload] Данные обновлены');

                window.renderChatsInDrawer();
                window.updateDrawerUserInfo();
                window.updateDrawerCoins();
                window.updateCoinsDisplay();

                if (window.chatListModule) {
                    window.chatListModule.show();
                }

                if (profileUI && typeof profileUI.renderHistoryChatsList === 'function') {
                    profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
                }

                if (uiRenderer) {
                    uiRenderer.showToast('🔄 Данные синхронизированы', 'success', 1500);
                }

                return true;
            }
        }
        return false;
    } catch (err) {
        console.error('❌ [fullDataReload] Ошибка:', err);
        return false;
    }
};

// ==========================================
// УПРАВЛЕНИЕ САЙДБАРОМ
// ==========================================

window.openDrawer = function(): void {
    const overlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('drawer');
    if (!overlay || !drawer) return;

    if (modalManager.isOpen()) {
        return;
    }

    window.renderChatsInDrawer();
    window.updateDrawerCoins();

    overlay.classList.add('active');
    drawer.classList.add('active');
    drawer.classList.remove('drawer-anim-out');
    drawer.classList.add('drawer-anim-in');
    document.body.style.overflow = 'hidden';

    if (navigationState) {
        navigationState.toggleDrawer(true);
    }

    eventBus.emit('drawer:state_changed', { isOpen: true });
};

window.closeDrawer = function(options: { instant?: boolean } = {}): void {
    const { instant = false } = options;
    const overlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('drawer');
    if (!overlay || !drawer) return;

    drawer.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';

    drawer.classList.remove('drawer-anim-in');
    if (!instant) {
        drawer.classList.add('drawer-anim-out');
    }

    if (navigationState) {
        navigationState.toggleDrawer(false);
    }

    eventBus.emit('drawer:state_changed', { isOpen: false });

    if (!instant) {
        setTimeout(() => {
            drawer.classList.remove('drawer-anim-out');
        }, 300);
    } else {
        drawer.classList.remove('drawer-anim-out');
    }
};

document.addEventListener('click', function(e: MouseEvent) {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    const headerGlass = document.querySelector('.header-glass');
    if (!drawer || !overlay) return;

    if (overlay.classList.contains('active')) {
        const target = e.target as HTMLElement;
        if (target === overlay || (!drawer.contains(target) && !headerGlass?.contains(target))) {
            window.closeDrawer();
        }
    }
});

// ==========================================
// ОТКРЫТИЕ ЧАТА
// ==========================================

window.openChat = function(chatId: string, topic: string): void {
    console.log(`📂 [openChat] Открываем чат: ${chatId} (${topic})`);

    const validTopic = isValidTopic(topic) ? topic as TopicId : 'code';

    if (eventBus) {
        eventBus.emit('navigation:open_chat', { chatId, topic: validTopic });
    } else {
        console.error('❌ EventBus не найден');
    }
};

function isValidTopic(topic: string): boolean {
    const allowed: TopicId[] = ['code', 'creative', 'fast', 'kitchen', 'analytics'];
    return allowed.includes(topic as TopicId);
}

// ==========================================
// ВОЗВРАТ В СПИСОК ЧАТОВ
// ==========================================

window.goToChatList = function(): void {
    console.log('📂 [goToChatList] Возврат в ChatListModule');

    if (eventBus) {
        eventBus.emit('navigation:go_back');
    } else if (navigationState) {
        navigationState.goToChatList();
    } else if (moduleLoader) {
        moduleLoader.load('chat-list');
    }
};

// ==========================================
// ПЕРЕХОД В ПРОФИЛЬ
// ==========================================

window.goToProfile = function(): void {
    console.log('👤 [goToProfile] Переход в профиль');
    window.closeDrawer();

    if (eventBus) {
        eventBus.emit('navigation:open_profile');
    } else if (moduleLoader) {
        moduleLoader.load('profile');
    }
};

// ==========================================
// ПЕРЕХОД В ЗАДАНИЯ
// ==========================================

window.goToTasks = function(): void {
    console.log('🪙 [goToTasks] Переход в задания');

    window.closeDrawer({ instant: true });

    if (navigationState) {
        navigationState.navigate('tasks', {}, { addToHistory: true });
    } else if (moduleLoader) {
        moduleLoader.load('tasks');
    }

    if (navigation) {
        navigation.setActive('tasks');
    }
};

// ==========================================
// ОБНОВЛЕНИЕ КНОПКИ НАЗАД
// ==========================================

window.refreshBackButton = function(): void {
    if (backButtonManager) {
        backButtonManager.refresh();
    }
};

// ==========================================
// ТЕКУЩИЙ ФИЛЬТР ДЛЯ САЙДБАРА
// ==========================================

let drawerFilter: string = 'all';

// ==========================================
// РЕНДЕРИНГ ЧАТОВ В САЙДБАРЕ
// ==========================================

window.renderChatsInDrawer = function(): void {
    const container = document.getElementById('drawer-chats-list');
    if (!container) return;

    const existingNav = container.querySelector('.drawer-nav-bottom');
    container.innerHTML = '';

    const filtersContainer = document.createElement('div');
    filtersContainer.className = 'drawer-filters';
    filtersContainer.style.cssText = `
        padding: 0 16px 12px 16px;
        border-bottom: 1px solid rgba(212,175,55,0.08);
        margin-bottom: 12px;
        flex-shrink: 0;
    `;

    const topics = [
        { id: 'all', label: 'Все' },
        { id: 'code', label: '#кодинг' },
        { id: 'creative', label: '#креатив' },
        { id: 'fast', label: '#флуд' },
        { id: 'kitchen', label: '#кухня' },
        { id: 'analytics', label: '#аналитика' }
    ];

    const chipsWrapper = document.createElement('div');
    chipsWrapper.style.cssText = `
        display: flex;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 4px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
    `;
    (chipsWrapper as HTMLElement).style.setProperty('ms-overflow-style', 'none');

    const style = document.createElement('style');
    style.textContent = `
        .drawer-filters-scroll::-webkit-scrollbar {
            display: none;
            width: 0;
            height: 0;
        }
    `;
    chipsWrapper.appendChild(style);
    chipsWrapper.className = 'drawer-filters-scroll';

    for (const topic of topics) {
        const chip = document.createElement('button');
        chip.className = `drawer-filter-chip ${drawerFilter === topic.id ? 'active' : ''}`;
        chip.textContent = topic.label;
        chip.dataset.topic = topic.id;
        chip.style.cssText = `
            padding: 4px 14px;
            border-radius: 16px;
            border: 1px solid ${drawerFilter === topic.id ? 'var(--app-accent-primary, #D4AF37)' : 'var(--app-border-color, rgba(212,175,55,0.15))'};
            background: ${drawerFilter === topic.id ? 'var(--app-accent-primary, #D4AF37)' : 'var(--app-bg-tertiary, rgba(40,40,40,0.6))'};
            color: ${drawerFilter === topic.id ? 'var(--app-text-inverse, #1A1A0A)' : 'var(--app-text-secondary, #E8E0D0)'};
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: var(--app-font-family, -apple-system, sans-serif);
            user-select: none;
            -webkit-tap-highlight-color: transparent;
            white-space: nowrap;
            flex-shrink: 0;
        `;
        chip.onclick = (e) => {
            e.stopPropagation();
            drawerFilter = topic.id;
            window.renderChatsInDrawer();
        };
        chipsWrapper.appendChild(chip);
    }

    filtersContainer.appendChild(chipsWrapper);
    container.appendChild(filtersContainer);

    const allChats: any[] = [];
    const pinnedChats: any[] = [];
    const unpinnedChats: any[] = [];

    const histories = chatStore.histories || {};
    const entries = Object.entries(histories) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
        if (!chats) continue;
        for (const chat of chats) {
            if (chat.deleted_at) continue;
            if (!chat.messages || chat.messages.length === 0) continue;

            if (drawerFilter !== 'all' && chat.topic !== drawerFilter) continue;

            const chatData = {
                id: chat.id,
                title: chat.title || 'Без названия',
                topic: topic,
                updated_at: chat.updated_at || chat.created_at,
                lastMessage: chat.messages[chat.messages.length - 1]?.text || '',
                pinned: chat.pinned || false,
                messages: chat.messages
            };
            if (chatData.pinned) {
                pinnedChats.push(chatData);
            } else {
                unpinnedChats.push(chatData);
            }
        }
    }

    pinnedChats.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    unpinnedChats.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    const sortedChats = [...pinnedChats, ...unpinnedChats];

    const listWrapper = document.createElement('div');
    listWrapper.style.cssText = 'flex: 1; overflow-y: auto; min-height: 0;';

    if (sortedChats.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 20px; text-align: center; color: var(--app-text-tertiary); font-size: 13px;';
        empty.textContent = drawerFilter === 'all' ? 'Нет чатов' : 'Нет чатов в этом разделе';
        listWrapper.appendChild(empty);
        container.appendChild(listWrapper);

        if (existingNav) {
            container.appendChild(existingNav);
        } else {
            window.appendDrawerNav(container);
        }
        return;
    }

    const listEl = document.createElement('div');
    listEl.className = 'drawer-chats-section';
    listEl.style.cssText = 'padding: 0;';

    for (const chat of sortedChats) {
        const item = document.createElement('div');
        item.className = `drawer-chat-item ${chat.pinned ? 'pinned' : ''}`;
        item.dataset.chatId = chat.id;
        item.dataset.topic = chat.topic;
        item.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px;
            cursor: pointer;
            transition: all 0.15s ease;
            position: relative;
            ${chat.pinned ? 'background: rgba(212,175,55,0.04); border-left: 3px solid var(--app-accent-primary, #D4AF37);' : ''}
        `;

        const preview = chat.lastMessage ? chat.lastMessage.substring(0, 40) + (chat.lastMessage.length > 40 ? '...' : '') : 'Пустой чат';

        item.addEventListener('click', function(e) {
            if ((e.target as HTMLElement).closest('.chat-menu-container')) return;
            window.openChat(chat.id, chat.topic);
        });

        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = 'font-size: 16px; flex-shrink: 0; width: 24px; text-align: center;';
        iconSpan.textContent = chat.pinned ? '📌' : '💬';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'chat-info';
        infoDiv.style.cssText = 'flex: 1; min-width: 0;';
        infoDiv.innerHTML = `
            <div class="chat-title" style="font-size: 14px; font-weight: 500; color: var(--app-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${chat.title}</div>
            <div class="chat-preview" style="font-size: 12px; color: var(--app-text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${preview}</div>
        `;

        const menuContainer = document.createElement('div');
        menuContainer.className = 'chat-menu-container';
        menuContainer.style.cssText = 'position: relative; display: inline-block; flex-shrink: 0;';

        const moreBtn = document.createElement('button');
        moreBtn.className = 'chat-more-btn';
        moreBtn.style.cssText = `
            background: transparent;
            border: none;
            color: var(--app-text-tertiary);
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 6px;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        `;
        moreBtn.innerHTML = `<i data-lucide="more-vertical" style="width:18px;height:18px;"></i>`;
        moreBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            window.toggleChatMenu(chat.id, menuContainer);
        });

        menuContainer.appendChild(moreBtn);

        const menu = document.createElement('div');
        menu.className = 'chat-menu';
        menu.dataset.chatId = chat.id;
        menu.style.cssText = `
            position: absolute;
            right: 0;
            top: calc(100% + 4px);
            background: var(--app-bg-secondary);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-radius: var(--app-radius-md, 12px);
            box-shadow: var(--app-shadow-lg, 0 12px 40px rgba(0,0,0,0.8));
            border: 1px solid var(--app-border-color-light, rgba(212,175,55,0.08));
            min-width: 180px;
            padding: 6px 0;
            z-index: 10;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-8px) scale(0.96);
            transition: all 0.2s cubic-bezier(0.1, 0.8, 0.25, 1);
            pointer-events: none;
        `;
        menu.innerHTML = `
            <button class="chat-menu-item" data-action="pin" style="display: flex; align-items: center; gap: 10px; padding: 8px 16px; color: var(--app-text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif);">
                <i data-lucide="pin" style="width:16px;height:16px;"></i> ${chat.pinned ? 'Открепить' : 'Закрепить'}
            </button>
            <button class="chat-menu-item" data-action="rename" style="display: flex; align-items: center; gap: 10px; padding: 8px 16px; color: var(--app-text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif);">
                <i data-lucide="edit-2" style="width:16px;height:16px;"></i> Редактировать
            </button>
            <button class="chat-menu-item" data-action="context" style="display: flex; align-items: center; gap: 10px; padding: 8px 16px; color: var(--app-text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif);">
                <i data-lucide="brain" style="width:16px;height:16px;"></i> Память чата
            </button>
            <button class="chat-menu-item danger" data-action="delete" style="display: flex; align-items: center; gap: 10px; padding: 8px 16px; color: var(--app-accent-danger, #E74C3C); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif);">
                <i data-lucide="trash-2" style="width:16px;height:16px;"></i> Удалить
            </button>
        `;

        menu.querySelectorAll('.chat-menu-item').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const action = (this as HTMLElement).dataset.action;
                window.handleChatAction(action, chat.id, chat.title, chat.pinned);
                window.closeAllChatMenus();
            });
        });

        menuContainer.appendChild(menu);

        item.appendChild(iconSpan);
        item.appendChild(infoDiv);
        item.appendChild(menuContainer);
        listEl.appendChild(item);
    }

    listWrapper.appendChild(listEl);
    container.appendChild(listWrapper);

    if (existingNav) {
        container.appendChild(existingNav);
    } else {
        window.appendDrawerNav(container);
    }

    setTimeout(() => {
        if (typeof (window as any).lucide !== 'undefined') {
            (window as any).lucide.createIcons();
        }
    }, 50);
};

// ==========================================
// НИЖНЯЯ ЧАСТЬ САЙДБАРА
// ==========================================

window.appendDrawerNav = function(container: HTMLElement): void {
    if (container.querySelector('.drawer-nav-bottom')) return;

    const nav = document.createElement('div');
    nav.className = 'drawer-nav-bottom';
    nav.style.cssText = `
        flex-shrink: 0;
        border-top: 1px solid rgba(212,175,55,0.08);
        padding: 8px 0;
        background: var(--app-bg-secondary);
    `;

    nav.innerHTML = `
        <div class="drawer-nav-item" id="drawer-favorites" style="display: flex; align-items: center; gap: 14px; padding: 8px 20px; color: var(--app-text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif); -webkit-tap-highlight-color: transparent;">
            <i data-lucide="star" style="width:20px;height:20px;"></i> Избранное
        </div>
        <div class="drawer-nav-item" id="drawer-trash" style="display: flex; align-items: center; gap: 14px; padding: 8px 20px; color: var(--app-text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif); -webkit-tap-highlight-color: transparent;">
            <i data-lucide="trash-2" style="width:20px;height:20px;"></i> Корзина
            <span id="drawer-trash-count" style="margin-left: auto; font-size: 11px; background: var(--app-accent-danger, #E74C3C); color: white; padding: 1px 8px; border-radius: 12px; font-weight: 600; display: none;">0</span>
        </div>
        <div style="height: 1px; background: rgba(212,175,55,0.08); margin: 4px 20px;"></div>
        <div class="drawer-nav-item" id="drawer-profile" style="display: flex; align-items: center; gap: 14px; padding: 8px 20px; color: var(--app-text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif); -webkit-tap-highlight-color: transparent;">
            <i data-lucide="settings" style="width:20px;height:20px;"></i> Настройки    </div>
        <div class="drawer-nav-item" id="drawer-theme-toggle" style="display: flex; align-items: center; gap: 14px; padding: 8px 20px; color: var(--app-text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif); -webkit-tap-highlight-color: transparent;">
            <i data-lucide="palette" style="width:20px;height:20px;"></i> Тема: <span id="drawer-theme-label" style="color: var(--app-text-primary);">Светлая</span>
        </div>
        <div class="drawer-nav-item" id="drawer-clear-cache" style="display: flex; align-items: center; gap: 14px; padding: 8px 20px; color: var(--app-text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--app-font-family, -apple-system, sans-serif); -webkit-tap-highlight-color: transparent;">
            <i data-lucide="trash" style="width:20px;height:20px;"></i> Очистить кэш
        </div>
        <div style="padding: 8px 20px 4px 20px; font-size: 11px; color: var(--app-text-tertiary); text-align: center;">Версия 8.4.0</div>
    `;

    container.appendChild(nav);

    const favoritesItem = nav.querySelector('#drawer-favorites');
    if (favoritesItem) {
        favoritesItem.addEventListener('click', function() {
            window.showFavoritesModal();
        });
    }

    const trashItem = nav.querySelector('#drawer-trash');
    if (trashItem) {
        trashItem.addEventListener('click', function() {
            window.showTrashModal();
        });
    }

    const profileItem = nav.querySelector('#drawer-profile');
    if (profileItem) {
        profileItem.addEventListener('click', function() {
            window.goToProfile();
        });
    }

    const themeToggle = nav.querySelector('#drawer-theme-toggle');
    const themeLabel = nav.querySelector('#drawer-theme-label');
    if (themeToggle && themeLabel) {
        themeToggle.addEventListener('click', function() {
            const currentTheme = themeManager.getCurrentTheme();
            const themes: ('light' | 'amoled')[] = ['light', 'amoled'];
            const currentIndex = themes.indexOf(currentTheme);
            const nextTheme = themes[(currentIndex + 1) % themes.length];
            themeManager.setTheme(nextTheme);
            window.updateThemeLabel(nextTheme);
        });
    }

    const clearCacheItem = nav.querySelector('#drawer-clear-cache');
    if (clearCacheItem) {
        clearCacheItem.addEventListener('click', function() {
            const confirmMsg = 'Очистить локальный кэш приложения?\n\n' +
                '⚠️ Ваши НЕСИНХРОНИЗИРОВАННЫЕ данные (TRIAL) будут потеряны.\n' +
                '☁️ Синхронизированные данные (PRO) восстановятся из облака.';

            const doClear = (): void => {
                if (tasksStore) {
                    tasksStore._data = {} as any;
                    tasksStore.save();
                    tasksStore.clearJWT();
                }
                if (chatStore) {
                    chatStore._data = {} as any;
                    chatStore.save();
                    chatStore.clearJWT();
                }
                if (userStore) {
                    userStore._data = {} as any;
                    userStore.save();
                    userStore.clearJWT();
                }
                if (organizerStore) {
                    organizerStore._data = {} as any;
                    organizerStore.save();
                    organizerStore.clearJWT();
                }

                localStorage.removeItem('sync_token');

                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('sync_token_') && key !== 'sync_token') {
                        localStorage.removeItem(key);
                    }
                }

                localStorage.removeItem('last_user_id');

                if (uiRenderer) {
                    uiRenderer.showToast('🧹 Кэш и токен очищены', 'success', 1500);
                }

                window.closeDrawer();
                setTimeout(() => location.reload(), 1000);
            };

            if (window.Telegram?.WebApp?.showConfirm) {
                window.Telegram.WebApp.showConfirm(confirmMsg, (ok: boolean) => { if (ok) doClear(); });
            } else if (confirm(confirmMsg)) {
                doClear();
            }
        });
    }
};

// ==========================================
// УПРАВЛЕНИЕ МЕНЮ ЧАТА
// ==========================================

let activeChatMenu: HTMLElement | null = null;

window.toggleChatMenu = function(chatId: string, container: HTMLElement): void {
    const menu = container.querySelector('.chat-menu') as HTMLElement;
    if (!menu) return;
    window.closeAllChatMenus();
    menu.classList.toggle('open');
    if (menu.classList.contains('open')) {
        menu.style.opacity = '1';
        menu.style.visibility = 'visible';
        menu.style.transform = 'translateY(0) scale(1)';
        menu.style.pointerEvents = 'auto';
        activeChatMenu = menu;
    } else {
        menu.style.opacity = '0';
        menu.style.visibility = 'hidden';
        menu.style.transform = 'translateY(-8px) scale(0.96)';
        menu.style.pointerEvents = 'none';
        activeChatMenu = null;
    }
};

window.closeAllChatMenus = function(): void {
    document.querySelectorAll('.chat-menu').forEach(m => {
        (m as HTMLElement).style.opacity = '0';
        (m as HTMLElement).style.visibility = 'hidden';
        (m as HTMLElement).style.transform = 'translateY(-8px) scale(0.96)';
        (m as HTMLElement).style.pointerEvents = 'none';
    });
    activeChatMenu = null;
};

document.addEventListener('click', function(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.chat-menu-container')) {
        window.closeAllChatMenus();
    }
});

// ==========================================
// ДЕЙСТВИЯ С ЧАТАМИ
// ==========================================

window.handleChatAction = function(action: string, chatId: string, chatTitle: string, isPinned: boolean): void {
    switch (action) {
        case 'pin':
            window.togglePinChat(chatId, !isPinned);
            break;
        case 'rename':
            window.renameChatFromDrawer(chatId, chatTitle);
            break;
        case 'context':
            window.showContextModal(chatId);
            break;
        case 'delete':
            window.deleteChatFromDrawer(chatId);
            break;
        default:
            break;
    }
};

window.togglePinChat = function(chatId: string, pinned: boolean): void {
    const found = chatStore.findChatById(chatId);
    if (!found) return;
    found.chat.pinned = pinned;
    chatStore.save();
    window.renderChatsInDrawer();
    if (uiRenderer) {
        uiRenderer.showToast(pinned ? '📌 Чат закреплен' : '📌 Чат откреплен', 'success', 1500);
    }
};

window.renameChatFromDrawer = function(chatId: string, currentTitle: string): void {
    const newTitle = prompt('Введите новое название для чата:', currentTitle);
    if (newTitle === null) return;
    if (newTitle.trim().length === 0) {
        if (window.Telegram?.WebApp?.showAlert) {
            window.Telegram.WebApp.showAlert('Название чата не может быть пустым.');
        }
        return;
    }
    const trimmed = newTitle.trim();
    chatStore.renameChat(chatId, trimmed);
    window.renderChatsInDrawer();
    if (profileUI && typeof profileUI.updateChatTitle === 'function') {
        profileUI.updateChatTitle(chatId, trimmed);
    }
    if (uiRenderer) {
        uiRenderer.showToast('✏️ Чат переименован', 'success', 1500);
    }
};

window.deleteChatFromDrawer = function(chatId: string): void {
    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_chat') : 'Удалить чат в корзину?';

    const action = (): void => {
        chatStore.deleteChat(chatId);
        if (userStore.canSync() && chatService) {
            chatService.deleteChat(chatId).catch(err => {
                console.error('❌ Ошибка синхронизации удаления:', err);
            });
        }
        window.renderChatsInDrawer();
        if (profileUI && typeof profileUI.renderHistoryChatsList === 'function') {
            profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
        }
        if (window.updateTrashCount) {
            setTimeout(window.updateTrashCount, 300);
        }
        if (uiRenderer) {
            uiRenderer.showToast('🗑️ Чат отправлен в корзину', 'info', 1500);
        }
    };

    if (window.Telegram?.WebApp?.showConfirm) {
        window.Telegram.WebApp.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
        action();
    }
};

// ==========================================
// ОБНОВЛЕНИЕ МОНЕТ
// ==========================================

window.updateDrawerCoins = function(): void {
    const balance = tasksStore.getBalance() || 0;
    const coinEl = document.getElementById('drawer-coins-amount');
    if (coinEl) coinEl.textContent = String(balance);
};

window.updateCoinsDisplay = function(): void {
    const balance = tasksStore.getBalance() || 0;
    const headerCoinEl = document.querySelector('.coin-amount');
    if (headerCoinEl) (headerCoinEl as HTMLElement).textContent = String(balance);
    window.updateDrawerCoins();
};

// ==========================================
// ОБНОВЛЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ
// ==========================================

window.updateDrawerUserInfo = function(): void {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const drawerAvatar = document.getElementById('drawer-avatar') as HTMLImageElement;
    const drawerName = document.getElementById('drawer-user-name');
    const drawerUsername = document.getElementById('drawer-user-username');

    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
        if (drawerAvatar) drawerAvatar.src = avatarUrl;
        if (drawerName) drawerName.textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        if (drawerUsername) drawerUsername.textContent = user.username ? '@' + user.username : '';
    }
};

window.updateDrawerRole = function(role: string): void {
    const roleEl = document.getElementById('drawer-user-role');
    if (!roleEl) return;
    const roleMap: Record<string, string> = {
        'trial': '🔓 Бесплатный',
        'premium': '⭐ PRO',
        'admin': '👑 Админ',
        'creator': '👑 Создатель'
    };
    roleEl.textContent = roleMap[role] || role;
};

window.updateThemeLabel = function(theme: 'light' | 'amoled'): void {
    const label = document.getElementById('drawer-theme-label');
    if (!label) return;
    const names = { 'light': 'Светлая', 'amoled': 'AMOLED' };
    label.textContent = names[theme] || 'Светлая';
};

// ==========================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ МОДАЛОК
// ==========================================

window.showFavoritesModal = function(): void {
    if (profileUI && typeof profileUI.showFavoritesModal === 'function') {
        profileUI.showFavoritesModal();
    }
};

window.showTrashModal = function(): void {
    if (profileUI && typeof profileUI.showTrashModal === 'function') {
        profileUI.showTrashModal();
    }
};

window.showContextModal = function(chatId: string): void {
    if (profileUI && typeof profileUI.showContextModal === 'function') {
        profileUI.showContextModal(chatId);
    }
};

// ==========================================
// ОБНОВЛЕНИЕ СЧЁТЧИКА КОРЗИНЫ
// ==========================================

window.updateDrawerTrashCount = function(): void {
    const badge = document.getElementById('drawer-trash-count');
    if (!badge) return;

    try {
        const trash = chatStore.getTrash();
        const total = trash.chats.length;

        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : String(total);
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch (err) {
        console.error('Ошибка обновления счетчика корзины в сайдбаре:', err);
        badge.style.display = 'none';
    }
};

// ==========================================
// ИНИЦИАЛИЗАЦИЯ САЙДБАРА
// ==========================================

function initDrawer(): void {
    if (!document.getElementById('drawer')) {
        const drawerHTML = `
            <div id="drawer-overlay"></div>
            <div id="drawer" style="border-radius: 0 var(--app-radius-xl) var(--app-radius-xl) 0; display: flex; flex-direction: column; height: 100dvh;">
                <div class="drawer-header" style="padding: calc(var(--tg-content-safe-area-top, 0px) + 20px) 20px 16px 20px; border-bottom: 1px solid rgba(212,175,55,0.08); flex-shrink: 0; display: flex; align-items: center; gap: 14px;">
                    <div class="drawer-avatar-wrapper" style="position: relative; flex-shrink: 0;">
                        <img id="drawer-avatar" src="" alt="Аватар" class="drawer-avatar" style="width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--app-accent-primary, #D4AF37); object-fit: cover;">
                    </div>
                    <div class="drawer-user-info" style="flex: 1; min-width: 0;">
                        <div class="drawer-user-name" id="drawer-user-name" style="font-size: 16px; font-weight: 600; color: var(--app-text-primary); line-height: 1.3;">Пользователь</div>
                        <div class="drawer-user-username" id="drawer-user-username" style="font-size: 13px; color: var(--app-text-tertiary);">@username</div>
                        <div class="drawer-user-status" style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                            <span class="drawer-user-role" id="drawer-user-role" style="font-size: 11px; font-weight: 600; color: var(--app-accent-primary, #D4AF37);">🔓 Бесплатный</span>
                            <span class="drawer-coins-badge" id="drawer-coins-badge" onclick="window.goToTasks()" style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--app-text-primary); cursor: pointer; padding: 2px 10px 2px 6px; border-radius: 16px; background: rgba(212,175,55,0.08); transition: all 0.15s ease;">
                                <i data-lucide="coins" style="width:16px;height:16px;color:var(--app-accent-primary);"></i>
                                <span class="coin-amount" id="drawer-coins-amount" style="color: var(--app-accent-primary, #D4AF37);">0</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div id="drawer-chats-list" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;"></div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHTML);
        window.renderChatsInDrawer();
    }
}

// ==========================================
// ГЛОБАЛЬНЫЕ ПОДПИСКИ НА СОБЫТИЯ
// ==========================================

function setupGlobalEventSubscriptions(): void {
    if (!eventBus) {
        console.warn('⚠️ EventBus не найден, глобальные подписки не настроены');
        return;
    }

    eventBus.on('tasks:balance_changed', (data) => {
        document.querySelectorAll('.coin-amount, #drawer-coins-amount, #header-coins-amount').forEach(el => {
            if (el) (el as HTMLElement).textContent = String(data.newBalance || 0);
        });
    });

    eventBus.on('user:role_changed', (data) => {
        const roleMap: Record<string, string> = {
            'trial': '🔓 Бесплатный',
            'premium': '⭐ PRO',
            'admin': '👑 Админ',
            'creator': '👑 Создатель'
        };
        const roleEl = document.getElementById('drawer-user-role');
        if (roleEl) {
            roleEl.textContent = roleMap[data.newRole] || data.newRole;
        }
    });

    eventBus.on('sync:token_updated', () => {
        window.updateRealtimeIndicator('connected');
    });

    eventBus.on('sync:token_cleared', () => {
        window.updateRealtimeIndicator('offline');
    });

    eventBus.on('chat:all_updated', () => {
        window.renderChatsInDrawer();
        window.updateDrawerTrashCount();
    });

    eventBus.on('chat:created', () => {
        window.renderChatsInDrawer();
        window.updateDrawerTrashCount();
    });

    eventBus.on('chat:deleted', () => {
        window.renderChatsInDrawer();
        window.updateDrawerTrashCount();
    });

    eventBus.on('chat:restored', () => {
        window.renderChatsInDrawer();
        window.updateDrawerTrashCount();
    });

    eventBus.on('chat:renamed', () => {
        window.renderChatsInDrawer();
    });

    eventBus.on('chat:trash_cleared', () => {
        window.updateDrawerTrashCount();
    });

    console.log('📡 Глобальные подписки настроены');
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ==========================================

async function initApp(): Promise<void> {
    console.log('🔧 Начало инициализации приложения...');

    if (!isTelegramWebApp()) {
        console.log('🚫 Приложение открыто вне Telegram → показываем заглушку');
        showTelegramRequiredScreen();
        return;
    }

    // ✅ РЕГИСТРИРУЕМ МОДУЛИ
    registerModules();

    // ✅ ПРИВЯЗЫВАЕМ UI К WINDOW
    bindUIToWindow();

    setupGlobalEventSubscriptions();

    const tg = window.Telegram?.WebApp;
    if (tg) {
        try {
            tg.ready();
            tg.expand();
            if (tg.themeParams && tg.themeParams.bg_color) {
                tg.setHeaderColor(tg.themeParams.bg_color);
            }
        } catch (e) {
            console.error('Ошибка активации Telegram SDK:', e);
        }
    }

    function setTelegramInsets(): void {
        const root = document.documentElement;
        try {
            if (!tg) {
                root.style.setProperty('--tg-content-safe-area-top', '0px');
                root.style.setProperty('--tg-safe-bottom', '0px');
                return;
            }
            const initDataStr = tg?.initData || '';
            const isMiniApp = !!(initDataStr && initDataStr.length > 0);
            const isMobilePlatform = tg?.platform === 'ios' || tg?.platform === 'android';
            let topInset = 0;
            if (isMiniApp && isMobilePlatform) {
                topInset = tg?.contentSafeAreaInset?.top || tg?.safeAreaInset?.top || 0;
                if (topInset < 50) topInset = 75;
            } else {
                topInset = 0;
            }
            const bottomInset = isMiniApp ? (tg?.safeAreaInset?.bottom || 0) : 0;
            root.style.setProperty('--tg-content-safe-area-top', `${topInset}px`);
            root.style.setProperty('--tg-safe-bottom', `${bottomInset}px`);
        } catch (err) {
            console.error('Сбой расчета безопасных зон:', err);
            root.style.setProperty('--tg-content-safe-area-top', '0px');
            root.style.setProperty('--tg-safe-bottom', '0px');
        }
    }

    setTelegramInsets();
    setTimeout(setTelegramInsets, 150);
    setTimeout(setTelegramInsets, 450);

    initDrawer();
    window.updateDrawerUserInfo();

    const user = tg?.initDataUnsafe?.user;
    const chatStoreInstance = chatStore;
    const userStoreInstance = userStore;

    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
        const avatarEl = document.getElementById('user-avatar') as HTMLImageElement;
        if (avatarEl) avatarEl.src = avatarUrl;
    }

    chatStoreInstance.load();
    userStoreInstance.load();
    organizerStore.load();
    tasksStore.load();

    if (chatUI) {
        const cleaned = chatUI.cleanupAllEmptyChats();
        if (cleaned > 0) console.log(`🧹 При загрузке очищено ${cleaned} пустых чатов`);
    }

    const uid = user?.id;
    if (!uid) {
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            appScreen.classList.remove('hidden');
            if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
        }
        return;
    }

    window.updateCoinsDisplay();
    window.updateDrawerTrashCount();

    const header = document.getElementById('header');
    if (header) {
        header.classList.remove('hidden');
        header.style.display = 'flex';
    }

    if (headerManager) {
        headerManager.reset();
    }

    if (authService) {
        try {
            const result = await authService.checkSubscription();
            const isPro = result.role === 'pro' || result.role === 'premium' || result.role === 'admin' || result.role === 'creator';

            const needFullReload = authService.needFullReload(result.syncToken);

            window.updateDrawerRole(result.role);

            if (needFullReload) {
                console.log('🔄 [initApp] sync_token не совпадает → полная перезапись');

                if (result.syncToken) {
                    localStorage.setItem('sync_token', result.syncToken);
                    console.log(`✅ sync_token сохранен после сверки: ${result.syncToken.substring(0, 8)}...`);
                }

                await window.fullDataReload();
            } else {
                console.log('✅ [initApp] sync_token совпадает → используем кеш');
            }

            window.renderChatsInDrawer();
            window.updateDrawerUserInfo();
            window.updateDrawerCoins();
            window.updateCoinsDisplay();
            window.updateDrawerTrashCount();

            const previousRole = localStorage.getItem('user_role');
            const isFirstTimePro = isPro && result.syncToken === null;

            if (isFirstTimePro && previousRole === 'trial') {
                console.log('🔄 TRIAL → PRO: загружаем локальные данные в облако');
                const hasLocalData = Object.keys(chatStoreInstance.histories).length > 0;
                if (hasLocalData && chatService) {
                    await chatService.uploadLocalDataToCloud();
                }
                const newToken = await window.refreshSyncToken?.() || result.syncToken;
                localStorage.setItem('sync_token', newToken);
                if (uiRenderer) {
                    uiRenderer.showToast('🎉 Добро пожаловать в PRO! Ваши чаты синхронизированы.', 'success', 3000);
                }
            }

            const isTrial = result.role === 'trial';
            if (isTrial && previousRole !== 'trial' && (previousRole === 'pro' || previousRole === 'premium')) {
                console.log('⚠️ PRO → TRIAL: подписка истекла');
                if (syncService) syncService.unsubscribe();
                if (result.dataDeadline) {
                    const daysLeft = Math.ceil((new Date(result.dataDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (uiRenderer) {
                        uiRenderer.showToast(`⚠️ Подписка истекла. Данные будут удалены через ${daysLeft} дней. Скачайте архив.`, 'warning', 5000);
                    }
                }
            }

            localStorage.setItem('user_role', result.role || 'trial');

            if (result.isMember || result.role === 'admin' || result.role === 'creator') {
                console.log(`👤 Пользователь авторизован: ${result.role}`);

                if (isPro) {
                    console.log('🔄 Синхронизация включена (PRO)');
                    if (syncService) {
                        const userId = userStoreInstance.userId;
                        console.log('📡 Подписываемся на Realtime для userId:', userId);
                        if (userId) syncService.subscribe(userId);
                    }
                    if (window.initExportButtons) window.initExportButtons();
                }
                if (chatUI) {
                    setTimeout(() => chatUI.cleanupAllEmptyChats(), 5000);
                }
            } else {
                if (window.showGuest) {
                    window.showGuest({
                        msg: '403',
                        joke: 'Для доступа к ИИ необходимо подписаться на канал!'
                    });
                }
            }

        } catch (err) {
            console.error('Ошибка проверки подписки:', err);
        }
    } else {
        console.warn('AuthService не найден, работа в офлайн-режиме');
    }

    if (tg) {
        tg.onEvent('message', async (message: any) => {
            console.log('📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:', message);
            if (message.text === '🔄' && userStoreInstance.canSync()) {
                console.log('✅ СИГНАЛ ОБНОВЛЕНИЯ РАСПОЗНАН!');
                if (uiRenderer) uiRenderer.showSyncStatus('syncing');
                if (window.chatListModule) {
                    window.chatListModule.show();
                }
                if (uiRenderer) uiRenderer.showSyncStatus('success');
            }
        });
        console.log('📨 Push-подписка активирована');
    }

    // ✅ ЗАГРУЖАЕМ СТАРТОВЫЙ МОДУЛЬ
    if (moduleLoader) {
        await moduleLoader.load('chat-list', {}, { silent: true });
    } else {
        console.error('❌ ModuleLoader не найден');
    }

    // ✅ ИНИЦИАЛИЗИРУЕМ НИЖНЮЮ НАВИГАЦИЮ
    if (navigation) {
        navigation.render();
    }

    // Автоматическая очистка пустых чатов
    setInterval(() => {
        if (chatUI) {
            chatUI.cleanupAllEmptyChats();
        }
        if (window.updateTrashCount) window.updateTrashCount();
        window.updateDrawerTrashCount();
        window.updateCoinsDisplay();
    }, 5 * 60 * 1000);

    // Новый чат
    window.handleNewChatClick = function(): void {
        const activeFilter = (window as any).profileUI?.currentFilter || 'all';
        if (activeFilter === 'all') {
            const card = document.getElementById('profile-card');
            if (card) card.classList.add('hidden');
            if (chatUI) {
                const newChat = chatUI.createNewChat();
                if (newChat) {
                    window.openChat(newChat.id, newChat.topic);
                }
            }
            return;
        }
        const topicMap: Record<string, string> = {
            'code': 'code', 'creative': 'creative', 'fast': 'fast',
            'kitchen': 'kitchen', 'analytics': 'analytics'
        };
        const topic = topicMap[activeFilter] || 'code';
        const card = document.getElementById('profile-card');
        if (card) card.classList.add('hidden');
        if (chatStoreInstance) {
            chatStoreInstance.currentTopic = topic as TopicId;
            const newChat = chatStoreInstance.createTempChat(topic as TopicId);
            if (newChat) {
                window.openChat(newChat.id, topic);
            }
        }
    };

    const appScreen = document.getElementById('app-screen');
    if (appScreen) {
        appScreen.classList.remove('hidden');
        if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
    }

    if (window.updateTrashCount) setTimeout(window.updateTrashCount, 1000);
    if (!navigator.onLine) window.showOfflineBanner();

    const currentTheme = themeManager.getCurrentTheme();
    window.updateThemeLabel(currentTheme);

    console.log('✅ Приложение v8.4.0 успешно загружено');
}

// ==========================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    if (!isTelegramWebApp()) {
        showTelegramRequiredScreen();
    }
    initApp().catch(err => {
        console.error('❌ Критический сбой инициализации:', err);
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            appScreen.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;">
                    <h2 style="color:var(--app-accent-danger);font-size:24px;margin-bottom:16px;">⚠️ Ошибка загрузки</h2>
                    <p style="color:var(--app-text-secondary);font-size:16px;margin-bottom:24px;">${(err as Error).message || 'Неизвестная ошибка'}</p>
                    <button onclick="location.reload()" class="btn" style="padding:12px 32px;border-radius:12px;font-size:16px;">🔄 Перезагрузить</button>
                </div>
            `;
            appScreen.style.display = 'flex';
        }
    });
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (document.getElementById('app-screen')) {
            initApp().catch(err => console.error('❌ Критический сбой инициализации:', err));
        }
    }, 100);
}

if (window.Telegram?.WebApp?.requestFullscreen) {
    try {
        window.Telegram.WebApp.requestFullscreen();
    } catch (e) {
        console.log('ℹ️ requestFullscreen не поддерживается в этой версии Telegram WebApp');
    }
}

// ==========================================
// LUCIDE ИКОНКИ
// ==========================================

function initLucideIcons(): boolean {
    if (typeof (window as any).lucide !== 'undefined') {
        try {
            (window as any).lucide.createIcons();
            console.log('✅ Lucide иконки созданы');
            return true;
        } catch (e) {
            console.warn('⚠️ Ошибка создания иконок:', e);
            return false;
        }
    }
    console.warn('⚠️ Lucide не найден');
    return false;
}

setTimeout(initLucideIcons, 300);
window.addEventListener('load', initLucideIcons);
setTimeout(initLucideIcons, 1000);

console.log('✅ app.ts v8.4.0 полностью загружен');
