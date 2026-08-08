// ============================================
// src/utils/global.ts
// Глобальные функции для window
// Версия: 1.2.0 - добавлен questsStore
// ============================================

import type { TopicId } from '@types';
import { chatStore } from '@/store/ChatStore';
import { questsStore } from '@/store/QuestsStore';
import { userStore } from '@/store/UserStore';
import { organizerStore } from '@/store/OrganizerStore';
import { chatService } from '@/services/chats';
import { authService } from '@/services/auth';
import { syncService } from '@/services/sync';
import { uiRenderer } from '@/modules/ui/renderer';
import { profileUI } from '@/modules/ui/profile-ui';
import { chatUI } from '@/modules/ui/chat-ui';
import { organizerUI } from '@/modules/ui/organizer-ui';
import { eventBus } from '@/core/event-bus';
import { moduleLoader } from '@/core/module-loader';
import { navigationState } from '@/core/navigation-state';
import { navigation } from '@/core/navigation';
import { backButtonManager } from '@/core/back-button-manager';
import { modalManager } from '@/core/modal-manager';
import { headerManager } from '@/core/header-manager';
import { inputManager } from '@/core/input-manager';
import { themeManager } from '@/core/theme-manager';

import { openDrawer, closeDrawer, renderChatsInDrawer, updateDrawerCoins, updateDrawerTrashCount } from '@/ui/drawer';
import { updateCoinsDisplay, updateDrawerUserInfo, updateDrawerRole, updateRealtimeIndicator } from '@/ui/header';
import { updateThemeLabel } from '@/ui/drawer';
import { showFavoritesModal, showTrashModal, showContextModal, initExportButtons } from '@/ui/modals';
import { showOfflineBanner, hideOfflineBanner } from '@/services/network';
import { hideSplash } from '@/ui/splash';

export function setupGlobalFunctions(): void {
    // ==========================================
    // CORE
    // ==========================================
    window.moduleLoader = moduleLoader;
    window.navigationState = navigationState;
    window.navigation = navigation;
    window.backButtonManager = backButtonManager;
    window.modalManager = modalManager;
    window.headerManager = headerManager;
    window.inputManager = inputManager;
    window.themeManager = themeManager;
    window.eventBus = eventBus;

    // ==========================================
    // STORES
    // ==========================================
    window.chatStore = chatStore;
    window.userStore = userStore;
    window.organizerStore = organizerStore;
    window.questsStore = questsStore;

    // ==========================================
    // SERVICES
    // ==========================================
    window.authService = authService;
    window.chatService = chatService;
    window.syncService = syncService;
    window.messageService = window.messageService;

    // ==========================================
    // UI
    // ==========================================
    window.uiRenderer = uiRenderer;
    window.chatUI = chatUI;
    window.profileUI = profileUI;
    window.organizerUI = organizerUI;

    // ==========================================
    // DRAWER
    // ==========================================
    window.openDrawer = openDrawer;
    window.closeDrawer = closeDrawer;
    window.renderChatsInDrawer = renderChatsInDrawer;
    window.updateDrawerCoins = updateDrawerCoins;
    window.updateDrawerUserInfo = updateDrawerUserInfo;
    window.updateDrawerRole = updateDrawerRole;
    window.updateDrawerTrashCount = updateDrawerTrashCount;
    window.updateThemeLabel = updateThemeLabel;

    // ==========================================
    // HEADER
    // ==========================================
    window.updateCoinsDisplay = updateCoinsDisplay;
    window.updateRealtimeIndicator = updateRealtimeIndicator;

    // ==========================================
    // MODALS
    // ==========================================
    window.showFavoritesModal = showFavoritesModal;
    window.showTrashModal = showTrashModal;
    window.showContextModal = showContextModal;
    window.initExportButtons = initExportButtons;

    // ==========================================
    // NETWORK
    // ==========================================
    window.showOfflineBanner = showOfflineBanner;
    window.hideOfflineBanner = hideOfflineBanner;

    // ==========================================
    // GLOBAL
    // ==========================================
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

    window.fullDataReload = async function(): Promise<boolean> {
        console.log('🔄 [fullDataReload] Полная перезагрузка данных...');
        try {
            if (chatService) {
                const result = await chatService.fullReload();
                if (result) {
                    console.log('✅ [fullDataReload] Данные обновлены');
                    renderChatsInDrawer();
                    updateDrawerUserInfo();
                    updateDrawerCoins();
                    updateCoinsDisplay();

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

    window.refreshBackButton = function(): void {
        if (backButtonManager) {
            backButtonManager.refresh();
        }
    };

    // ==========================================
    // CHAT NAVIGATION
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

    window.goToProfile = function(): void {
        console.log('👤 [goToProfile] Переход в профиль');
        closeDrawer();
        if (eventBus) {
            eventBus.emit('navigation:open_profile');
        } else if (moduleLoader) {
            moduleLoader.load('profile');
        }
    };

    window.goToTasks = function(): void {
        console.log('🪙 [goToTasks] Переход в задания');
        closeDrawer({ instant: true });
        if (navigationState) {
            navigationState.navigate('quests', {}, { addToHistory: true });
        } else if (moduleLoader) {
            moduleLoader.load('quests');
        }
        if (navigation) {
            navigation.setActive('quests');
        }
    };

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
        if (chatStore) {
            chatStore.currentTopic = topic as TopicId;
            const newChat = chatStore.createTempChat(topic as TopicId);
            if (newChat) {
                window.openChat(newChat.id, topic);
            }
        }
    };

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
        
        hideSplash();
    };
}

function isValidTopic(topic: string): boolean {
    const allowed: TopicId[] = ['code', 'creative', 'fast', 'kitchen', 'analytics'];
    return allowed.includes(topic as TopicId);
}
