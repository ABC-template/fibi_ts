// ============================================
// src/core/app.ts
// ТОЧКА ВХОДА — ТОЛЬКО ОРКЕСТРАЦИЯ
// Версия: 10.2.0 - исправлены questsStore и questsModule
// ============================================

import './config';
import { moduleLoader } from './module-loader';
import { navigationState } from './navigation-state';
import { navigation } from './navigation';
import { backButtonManager } from './back-button-manager';
import { inputManager } from './input-manager';
import { modalManager } from './modal-manager';
import { headerManager } from './header-manager';
import { themeManager } from './theme-manager';
import { eventBus } from './event-bus';

// ✅ UI
import { initSplash, updateSplashProgress, hideSplash } from '@/ui/splash';
import { initDrawer, renderChatsInDrawer, updateDrawerTrashCount, setupDrawerEventListeners, updateThemeLabel } from '@/ui/drawer';
import { updateCoinsDisplay, updateDrawerUserInfo, updateDrawerRole, setupHeaderSubscriptions } from '@/ui/header';
import { initExportButtons } from '@/ui/modals';
import { setupNetworkListeners, showOfflineBanner } from '@/services/network';
import { setupGlobalFunctions } from '@/utils/global';

// ✅ STORES
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { organizerStore } from '@/store/OrganizerStore';
import { questsStore } from '@/store/QuestsStore';

// ✅ SERVICES
import { authService } from '@/services/auth';
import { syncService } from '@/services/sync';
import { chatService } from '@/services/chats';
import { messageService } from '@/services/messages';

// ✅ UI RENDERERS
import { uiRenderer } from '@/modules/ui/renderer';
import { chatUI } from '@/modules/ui/chat-ui';
import { profileUI } from '@/modules/ui/profile-ui';
import { organizerUI } from '@/modules/ui/organizer-ui';

// ✅ CHAT SEND
import { chatSend } from '@/modules/chat/send';

// ✅ МОДУЛИ
import { DashboardModule } from '@/modules/dashboard/DashboardModule';
import { ChatListModule } from '@/modules/chat-list/ChatListModule';
import { ChatModule } from '@/modules/chat/ChatModule';
import { OrganizerModule } from '@/modules/organizer/OrganizerModule';
import { ProfileModule } from '@/modules/profile/ProfileModule';
import { QuestsModule } from '@/modules/quests/QuestsModule';
import { GamesModule } from '@/modules/games/GamesModule';

console.log('🚀 App v10.2.0 начал загрузку');

// ==========================================
// 1. РЕГИСТРАЦИЯ МОДУЛЕЙ
// ==========================================

function registerModules(): void {
    console.log('📦 Регистрируем модули...');
    moduleLoader.register('dashboard', DashboardModule);
    moduleLoader.register('organizer', OrganizerModule);
    moduleLoader.register('chat-list', ChatListModule);
    moduleLoader.register('chat', ChatModule);
    moduleLoader.register('games', GamesModule);
    moduleLoader.register('quests', QuestsModule);
    moduleLoader.register('profile', ProfileModule);
    console.log('✅ Все модули зарегистрированы');
}

// ==========================================
// 2. ПРИВЯЗКА К WINDOW
// ==========================================

function bindUIToWindow(): void {
    console.log('🔗 Привязываем UI к window...');

    window.uiRenderer = uiRenderer;
    window.chatUI = chatUI;
    window.profileUI = profileUI;
    window.organizerUI = organizerUI;

    window.chatStore = chatStore;
    window.userStore = userStore;
    window.organizerStore = organizerStore;
    window.questsStore = questsStore;

    window.authService = authService;
    window.chatService = chatService;
    window.messageService = messageService;
    window.syncService = syncService;

    window.moduleLoader = moduleLoader;
    window.navigationState = navigationState;
    window.navigation = navigation;
    window.backButtonManager = backButtonManager;
    window.modalManager = modalManager;
    window.headerManager = headerManager;
    window.inputManager = inputManager;
    window.themeManager = themeManager;
    window.eventBus = eventBus;

    window.chatSend = chatSend;

    console.log('✅ UI привязан к window');
}

// ==========================================
// 3. ПРОВЕРКА TELEGRAM
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

function showTelegramRequiredScreen(): void {
    const appScreen = document.getElementById('app-screen');
    const header = document.getElementById('header');
    if (header) header.classList.add('hidden');
    if (appScreen) appScreen.style.display = 'none';

    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.classList.add('hidden');
        splash.style.display = 'none';
    }

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
                    Версия 10.2.0
                </div>
            </div>
        `;
        document.body.prepend(wrapper);
    } else {
        wrapper.style.display = 'flex';
    }
}

// ==========================================
// 4. АКТИВАЦИЯ ERUDA
// ==========================================

function initEruda(role: string): void {
    if (role !== 'admin' && role !== 'creator') {
        console.log('ℹ️ Eruda доступна только для admin/creator');
        return;
    }

    if (typeof (window as any).eruda !== 'undefined') {
        try {
            (window as any).eruda.init();
            console.log(`🛠️ Eruda активирована для ${role}`);

            if (uiRenderer) {
                uiRenderer.showToast(`🛠️ Eruda активирована (${role})`, 'info', 3000);
            }
        } catch (err) {
            console.error('❌ Ошибка инициализации Eruda:', err);
        }
    } else {
        console.warn('⚠️ Eruda не загружена (проверьте index.html)');
    }
}

// ==========================================
// 5. НАСТРОЙКА ОТСТУПОВ
// ==========================================

function setTelegramInsets(): void {
    const root = document.documentElement;
    const tg = window.Telegram?.WebApp;
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

// ==========================================
// 6. НАСТРОЙКА TELEGRAM WEBAPP
// ==========================================

function setupTelegramWebApp(): void {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    try {
        tg.ready();

        if (typeof tg.expand === 'function') {
            tg.expand();
        }

        if (tg.themeParams && tg.themeParams.bg_color) {
            tg.setBackgroundColor(tg.themeParams.bg_color);
        }

        if (typeof tg.requestFullscreen === 'function') {
            try {
                tg.requestFullscreen();
            } catch (e) {
                console.log('ℹ️ requestFullscreen не поддерживается');
            }
        }

        if (typeof tg.showLoading === 'function') {
            tg.showLoading();
        }

        console.log('✅ Telegram WebApp настроен');
    } catch (e) {
        console.error('Ошибка настройки Telegram WebApp:', e);
    }
}

// ==========================================
// 7. ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ
// ==========================================

async function initApp(): Promise<void> {
    console.log('🔧 Начало инициализации приложения...');

    initSplash();
    updateSplashProgress(0, '🔮 Инициализация...');

    if (!isTelegramWebApp()) {
        console.log('🚫 Приложение открыто вне Telegram → показываем заглушку');
        showTelegramRequiredScreen();
        return;
    }

    // ✅ ШАГ 0: НАСТРОЙКА TELEGRAM
    setupTelegramWebApp();

    // ✅ ШАГ 1
    updateSplashProgress(10, '📦 Регистрация модулей...');
    registerModules();

    // ✅ ШАГ 2
    updateSplashProgress(20, '🔗 Привязка UI...');
    bindUIToWindow();

    // ✅ ШАГ 3
    updateSplashProgress(25, '🌐 Настройка глобальных функций...');
    setupGlobalFunctions();

    // ✅ ШАГ 4
    updateSplashProgress(30, '📡 Настройка событий...');
    setupEventSubscriptions();

    // ✅ ШАГ 5
    updateSplashProgress(35, '📐 Настройка отступов...');
    setTelegramInsets();
    setTimeout(setTelegramInsets, 150);
    setTimeout(setTelegramInsets, 450);

    // ✅ ШАГ 6
    updateSplashProgress(40, '📂 Инициализация сайдбара...');
    initDrawer();
    updateDrawerUserInfo();
    setupDrawerEventListeners();

    // ✅ ШАГ 7
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
        const avatarEl = document.getElementById('user-avatar') as HTMLImageElement;
        if (avatarEl) avatarEl.src = avatarUrl;
    }

    // ✅ ШАГ 8
    updateSplashProgress(50, '💾 Загрузка данных...');
    chatStore.load();
    userStore.load();
    organizerStore.load();
    questsStore.load();

    const cleaned = chatStore.cleanupAllEmptyChats();
    if (cleaned > 0) {
        console.log(`🧹 При загрузке очищено ${cleaned} пустых чатов`);
    }

    const uid = user?.id;
    if (!uid) {
        const appScreen = document.getElementById('app-screen');
        if (appScreen) {
            appScreen.classList.remove('hidden');
            if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
        }
        hideSplash();
        if (tg && typeof tg.hideLoading === 'function') {
            try { tg.hideLoading(); } catch (e) {}
        }
        return;
    }

    updateCoinsDisplay();
    updateDrawerTrashCount();

    const header = document.getElementById('header');
    if (header) {
        header.classList.remove('hidden');
        header.style.display = 'flex';
    }
    if (headerManager) headerManager.reset();

    // ✅ ШАГ 9: АУТЕНТИФИКАЦИЯ
    updateSplashProgress(60, '🔐 Авторизация...');
    if (authService) {
        try {
            const result = await authService.checkSubscription();
            updateSplashProgress(70, '🔐 Проверка подписки...');

            const isPro = result.role === 'pro' || result.role === 'premium' || result.role === 'admin' || result.role === 'creator';
            const needFullReload = authService.needFullReload(result.syncToken);

            updateDrawerRole(result.role);
            updateSplashProgress(75, '📂 Загрузка чатов...');

            if (needFullReload) {
                console.log('🔄 [initApp] sync_token не совпадает → полная перезапись');
                if (result.syncToken) {
                    localStorage.setItem('sync_token', result.syncToken);
                    console.log(`✅ sync_token сохранен: ${result.syncToken.substring(0, 8)}...`);
                }
                await window.fullDataReload();
            } else {
                console.log('✅ [initApp] sync_token совпадает → используем кеш');
            }

            updateSplashProgress(85, '🎨 Обновление интерфейса...');
            renderChatsInDrawer();
            updateDrawerUserInfo();
            updateCoinsDisplay();
            updateDrawerTrashCount();

            // TRIAL → PRO
            const previousRole = localStorage.getItem('user_role');
            const isFirstTimePro = isPro && result.syncToken === null;
            if (isFirstTimePro && previousRole === 'trial') {
                console.log('🔄 TRIAL → PRO: загружаем локальные данные в облако');
                const hasLocalData = Object.keys(chatStore.histories).length > 0;
                if (hasLocalData && chatService) {
                    await chatService.uploadLocalDataToCloud();
                }
                const newToken = await window.refreshSyncToken?.() || result.syncToken;
                localStorage.setItem('sync_token', newToken);
                if (uiRenderer) {
                    uiRenderer.showToast('🎉 Добро пожаловать в PRO! Ваши чаты синхронизированы.', 'success', 3000);
                }
            }

            // PRO → TRIAL
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
                        const userId = userStore.userId;
                        if (userId) syncService.subscribe(userId);
                    }
                    initExportButtons();
                }
                if (chatUI) {
                    setTimeout(() => {
                        const cleaned2 = chatStore.cleanupAllEmptyChats();
                        if (cleaned2 > 0) {
                            console.log(`🧹 При загрузке (отложенной) очищено ${cleaned2} пустых чатов`);
                        }
                    }, 5000);
                }
            } else {
                if (window.showGuest) {
                    window.showGuest({
                        msg: '403',
                        joke: 'Для доступа к ИИ необходимо подписаться на канал!'
                    });
                }
            }

            // ✅ АКТИВАЦИЯ ERUDA ДЛЯ ADMIN/CREATOR
            initEruda(result.role);

            // ✅ ИНИЦИАЛИЗАЦИЯ ЭКОНОМИЧЕСКОГО ЯДРА
            try {
                const { economyManager, economyStore } = await import('@/economy');
                window.economyManager = economyManager;
                window.economyStore = economyStore;

                if (economyStore) {
                    await economyStore.loadBalance();
                    console.log('💰 Баланс загружен в EconomyStore');
                }
                console.log('✅ Экономическое ядро инициализировано');
            } catch (err) {
                console.warn('⚠️ Не удалось инициализировать экономическое ядро:', err);
            }

            // ✅ СИНХРОНИЗАЦИЯ ЗАДАНИЙ
            try {
                await questsStore.sync();
                console.log('✅ Задания синхронизированы');
            } catch (err) {
                console.warn('⚠️ Не удалось синхронизировать задания:', err);
            }

            updateSplashProgress(95, '🎬 Завершение...');
        } catch (err) {
            console.error('Ошибка проверки подписки:', err);
        }
    }

    // ✅ ШАГ 10
    if (tg) {
        tg.onEvent('message', async (message: any) => {
            console.log('📨 ВХОДЯЩЕЕ СООБЩЕНИЕ ОТ БОТА:', message);
            if (message.text === '🔄' && userStore.canSync()) {
                console.log('✅ СИГНАЛ ОБНОВЛЕНИЯ РАСПОЗНАН!');
                if (uiRenderer) uiRenderer.showSyncStatus('syncing');
                if (window.questsModule) window.questsModule.show();
                if (uiRenderer) uiRenderer.showSyncStatus('success');
            }
        });
        console.log('📨 Push-подписка активирована');
    }

    // ✅ ШАГ 11
    updateSplashProgress(98, '🚀 Загрузка интерфейса...');
    if (moduleLoader) {
        await moduleLoader.load('chat-list', {}, { silent: true });
    }

    // ✅ ШАГ 12
    if (navigation) {
        navigation.render();
    }

    // ✅ ШАГ 13
    setInterval(() => {
        const cleaned3 = chatStore.cleanupAllEmptyChats();
        if (cleaned3 > 0) {
            console.log(`🧹 Периодическая очистка: удалено ${cleaned3} пустых чатов`);
        }
        if (window.updateTrashCount) window.updateTrashCount();
        updateDrawerTrashCount();
        updateCoinsDisplay();
    }, 5 * 60 * 1000);

    // ✅ ШАГ 14
    const appScreen = document.getElementById('app-screen');
    if (appScreen) {
        appScreen.classList.remove('hidden');
        if (appScreen.style.display === 'none') appScreen.style.display = 'flex';
    }

    if (window.updateTrashCount) setTimeout(window.updateTrashCount, 1000);
    if (!navigator.onLine) showOfflineBanner();

    const currentTheme = themeManager.getCurrentTheme();
    updateThemeLabel(currentTheme);

    // ✅ ФИНАЛ
    updateSplashProgress(100, '✅ Готово! Добро пожаловать!');
    setTimeout(() => {
        hideSplash();
        console.log('✅ Приложение v10.2.0 успешно загружено (с единой системой заданий)');
    }, 500);
}

// ==========================================
// 8. ПОДПИСКИ НА СОБЫТИЯ
// ==========================================

function setupEventSubscriptions(): void {
    if (!eventBus) {
        console.warn('⚠️ EventBus не найден');
        return;
    }

    setupHeaderSubscriptions();

    const updateDrawer = () => {
        renderChatsInDrawer();
        updateDrawerTrashCount();
    };

    eventBus.on('chat:all_updated', updateDrawer);
    eventBus.on('chat:created', updateDrawer);
    eventBus.on('chat:deleted', updateDrawer);
    eventBus.on('chat:restored', updateDrawer);
    eventBus.on('chat:renamed', () => renderChatsInDrawer());
    eventBus.on('chat:trash_cleared', () => updateDrawerTrashCount());

    // ✅ НОВОЕ: подписка на обновление баланса для UI
    eventBus.on('economy:balance:updated', (data) => {
        document.querySelectorAll('.coin-amount, .balance-display').forEach(el => {
            (el as HTMLElement).textContent = String(data.newBalance);
        });
    });

    // ✅ НОВОЕ: автоматическое обновление заданий
    eventBus.on('chat:message_added', () => {
        questsStore.updateProgress('send_message_1').catch(() => {});
        questsStore.updateProgress('send_message_5').catch(() => {});
    });

    eventBus.on('organizer:todo_added', () => {
        questsStore.updateProgress('add_todo').catch(() => {});
    });

    eventBus.on('organizer:todo_toggled', (data) => {
        if (data.isCompleted) {
            questsStore.updateProgress('complete_todo_3').catch(() => {});
        }
    });

    eventBus.on('organizer:reminder_added', () => {
        questsStore.updateProgress('create_reminder').catch(() => {});
    });

    // Достижения
    eventBus.on('chat:created', () => {
        questsStore.updateProgress('first_chat').catch(() => {});
    });

    eventBus.on('chat:message_added', () => {
        questsStore.updateProgress('chat_100').catch(() => {});
    });

    eventBus.on('organizer:todo_added', () => {
        questsStore.updateProgress('todo_50').catch(() => {});
    });

    eventBus.on('organizer:reminder_added', () => {
        questsStore.updateProgress('reminder_10').catch(() => {});
    });

    // Стрик через ежедневный бонус
    eventBus.on('quests:quest_completed', (data) => {
        if (data.questId === 'daily_login') {
            // Стрик обновляется через RPC
        }
    });

    // Монеты
    eventBus.on('economy:balance:updated', (data) => {
        if (data.newBalance >= 100) {
            questsStore.updateProgress('coins_100').catch(() => {});
        }
    });

    setupNetworkListeners();

    console.log('📡 Глобальные подписки настроены');
}

// ==========================================
// 9. ЗАПУСК (ТОЛЬКО ОДИН РАЗ!)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    if (!isTelegramWebApp()) {
        showTelegramRequiredScreen();
        return;
    }
    initApp().catch(err => {
        console.error('❌ Критический сбой инициализации:', err);
        hideSplash();
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

// ==========================================
// 10. LUCIDE
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
    return false;
}

setTimeout(initLucideIcons, 300);
window.addEventListener('load', initLucideIcons);
setTimeout(initLucideIcons, 1000);

console.log('✅ app.ts v10.2.0 полностью загружен (с единой системой заданий)');
