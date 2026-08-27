// ============================================
// src/ui/drawer.ts
// ВСЁ о сайдбаре (обновлен для экономики)
// Версия: 2.5.0 - добавлена экономика, удален кошелек
// ============================================

import './drawer.css';
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { questsStore } from '@/store/QuestsStore';
import { eventBus } from '@/core/event-bus';
import { modalManager } from '@/core/modal-manager';
import { navigationState } from '@/core/navigation-state';
import { uiRenderer } from '@/modules/ui/renderer';
import { profileUI } from '@/modules/ui/profile-ui';
import type { TopicId, IChat } from '@types';

// ==========================================
// КОНСТАНТЫ
// ==========================================

const MAX_PINNED_CHATS = 10;

// ==========================================
// СОСТОЯНИЕ
// ==========================================

let drawerFilter: string = 'all';
let activeChatMenu: HTMLElement | null = null;

// ==========================================
// ОТКРЫТИЕ / ЗАКРЫТИЕ
// ==========================================

export function openDrawer(): void {
    const overlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('drawer');
    if (!overlay || !drawer) return;

    if (modalManager.isOpen()) return;

    renderChatsInDrawer();
    updateDrawerCoins();

    overlay.classList.add('active');
    drawer.classList.add('active');
    drawer.classList.remove('drawer-anim-out');
    drawer.classList.add('drawer-anim-in');
    document.body.style.overflow = 'hidden';

    if (navigationState) navigationState.toggleDrawer(true);
    eventBus.emit('drawer:state_changed', { isOpen: true });
}

export function closeDrawer(options: { instant?: boolean } = {}): void {
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

    if (navigationState) navigationState.toggleDrawer(false);
    eventBus.emit('drawer:state_changed', { isOpen: false });

    if (!instant) {
        setTimeout(() => {
            drawer.classList.remove('drawer-anim-out');
        }, 300);
    } else {
        drawer.classList.remove('drawer-anim-out');
    }
}

// ==========================================
// РЕНДЕРИНГ ЧАТОВ В САЙДБАРЕ
// ==========================================

export function renderChatsInDrawer(): void {
    const container = document.getElementById('drawer-chats-list');
    if (!container) return;

    const existingNav = container.querySelector('.drawer-nav-bottom');
    container.innerHTML = '';

    const filtersContainer = createFilters();
    container.appendChild(filtersContainer);

    const allChats = collectChats();
    const sortedChats = sortChats(allChats);

    const listWrapper = document.createElement('div');
    listWrapper.className = 'drawer-chats-wrapper';
    listWrapper.style.cssText = 'flex: 1; overflow-y: auto; min-height: 0;';

    if (sortedChats.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'drawer-empty';
        empty.textContent = drawerFilter === 'all' ? 'Нет чатов' : 'Нет чатов в этом разделе';
        listWrapper.appendChild(empty);
        container.appendChild(listWrapper);
        appendDrawerNav(container);

        setTimeout(() => updateDrawerTrashCount(), 50);
        return;
    }

    const listEl = document.createElement('div');
    listEl.className = 'drawer-chats-section';

    for (const chat of sortedChats) {
        const item = createChatItem(chat);
        listEl.appendChild(item);
    }

    listWrapper.appendChild(listEl);
    container.appendChild(listWrapper);
    appendDrawerNav(container);

    setTimeout(() => updateDrawerTrashCount(), 50);

    setTimeout(() => {
        if (typeof (window as any).lucide !== 'undefined') {
            (window as any).lucide.createIcons();
        }
    }, 50);
}

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РЕНДЕРИНГА
// ==========================================

function createFilters(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'drawer-filters';

    const topics = [
        { id: 'all', label: 'Все' },
        { id: 'code', label: '#кодинг' },
        { id: 'creative', label: '#креатив' },
        { id: 'fast', label: '#флуд' },
        { id: 'kitchen', label: '#кухня' },
        { id: 'analytics', label: '#аналитика' }
    ];

    const wrapper = document.createElement('div');
    wrapper.className = 'drawer-filter-wrapper';
    wrapper.style.cssText = `
        display: flex;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 4px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        ms-overflow-style: none;
    `;

    for (const topic of topics) {
        const chip = document.createElement('button');
        chip.className = `drawer-filter-chip ${drawerFilter === topic.id ? 'active' : ''}`;
        chip.textContent = topic.label;
        chip.dataset.topic = topic.id;
        chip.onclick = (e) => {
            e.stopPropagation();
            drawerFilter = topic.id;
            renderChatsInDrawer();
        };
        wrapper.appendChild(chip);
    }

    container.appendChild(wrapper);
    return container;
}

function collectChats(): any[] {
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

    const sortedPinned = pinnedChats.sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    const sortedUnpinned = unpinnedChats.sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    return [...sortedPinned, ...sortedUnpinned];
}

function sortChats(chats: any[]): any[] {
    return chats;
}

function createChatItem(chat: any): HTMLElement {
    const item = document.createElement('div');
    item.className = `drawer-chat-item ${chat.pinned ? 'pinned' : ''}`;
    item.dataset.chatId = chat.id;
    item.dataset.topic = chat.topic;

    const preview = chat.lastMessage
        ? chat.lastMessage.substring(0, 40) + (chat.lastMessage.length > 40 ? '...' : '')
        : 'Пустой чат';

    item.addEventListener('click', function(e) {
        if ((e.target as HTMLElement).closest('.chat-menu-container')) return;
        window.openChat(chat.id, chat.topic);
    });

    const iconSpan = document.createElement('span');
    iconSpan.className = 'chat-icon';
    iconSpan.textContent = chat.pinned ? '📌' : '💬';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'chat-info';
    infoDiv.innerHTML = `
        <div class="chat-title">${chat.title}</div>
        <div class="chat-preview">${preview}</div>
    `;

    const menuContainer = createChatMenu(chat.id, chat.title, chat.pinned);

    item.appendChild(iconSpan);
    item.appendChild(infoDiv);
    item.appendChild(menuContainer);
    return item;
}

// ==========================================
// УМНОЕ ПОЗИЦИОНИРОВАНИЕ МЕНЮ
// ==========================================

function positionChatMenu(button: HTMLElement, menu: HTMLElement): void {
    const buttonRect = button.getBoundingClientRect();
    const menuHeight = 200;
    
    const listContainer = document.getElementById('drawer-chats-list');
    if (!listContainer) return;
    
    const listRect = listContainer.getBoundingClientRect();
    const spaceBelow = listRect.bottom - buttonRect.bottom;
    const spaceAbove = buttonRect.top - listRect.top;
    
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.maxHeight = '';
    menu.style.overflowY = '';
    menu.style.transformOrigin = '';
    
    if (spaceBelow >= menuHeight) {
        menu.style.top = 'calc(100% + 4px)';
        menu.style.bottom = 'auto';
        menu.style.transformOrigin = 'top right';
    } else if (spaceAbove >= menuHeight) {
        menu.style.top = 'auto';
        menu.style.bottom = 'calc(100% + 4px)';
        menu.style.transformOrigin = 'bottom right';
    } else {
        menu.style.top = 'calc(100% + 4px)';
        menu.style.bottom = 'auto';
        menu.style.transformOrigin = 'top right';
        const maxHeight = Math.max(80, Math.min(spaceBelow - 10, 200));
        menu.style.maxHeight = maxHeight + 'px';
        menu.style.overflowY = 'auto';
    }
}

function createChatMenu(chatId: string, chatTitle: string, isPinned: boolean): HTMLElement {
    const container = document.createElement('div');
    container.className = 'chat-menu-container';

    const moreBtn = document.createElement('button');
    moreBtn.className = 'chat-more-btn';
    moreBtn.innerHTML = `<i data-lucide="more-vertical" style="width:18px;height:18px;"></i>`;
    moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const menu = container.querySelector('.chat-menu') as HTMLElement;
        if (menu) {
            const isOpen = menu.classList.contains('open');
            closeAllChatMenus();
            if (!isOpen) {
                menu.classList.add('open');
                positionChatMenu(this, menu);
                activeChatMenu = menu;
            }
        }
    });

    const menu = document.createElement('div');
    menu.className = 'chat-menu';
    menu.dataset.chatId = chatId;
    menu.innerHTML = `
        <button class="chat-menu-item" data-action="pin">${isPinned ? 'Открепить' : 'Закрепить'}</button>
        <button class="chat-menu-item" data-action="rename">Редактировать</button>
        <button class="chat-menu-item" data-action="context">Память чата</button>
        <button class="chat-menu-item danger" data-action="delete">Удалить</button>
    `;

    menu.querySelectorAll('.chat-menu-item').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const action = (this as HTMLElement).dataset.action;
            handleChatAction(action, chatId, chatTitle, isPinned);
            closeAllChatMenus();
        });
    });

    container.appendChild(moreBtn);
    container.appendChild(menu);
    return container;
}

// ==========================================
// УПРАВЛЕНИЕ МЕНЮ
// ==========================================

export function toggleChatMenu(chatId: string, container: HTMLElement): void {
    const menu = container.querySelector('.chat-menu') as HTMLElement;
    if (!menu) return;
    closeAllChatMenus();
    menu.classList.toggle('open');
    if (menu.classList.contains('open')) {
        const button = container.querySelector('.chat-more-btn') as HTMLElement;
        if (button) {
            positionChatMenu(button, menu);
        }
        activeChatMenu = menu;
    } else {
        activeChatMenu = null;
    }
}

export function closeAllChatMenus(): void {
    document.querySelectorAll('.chat-menu').forEach(m => {
        m.classList.remove('open');
        const el = m as HTMLElement;
        el.style.top = '';
        el.style.bottom = '';
        el.style.maxHeight = '';
        el.style.overflowY = '';
        el.style.transformOrigin = '';
    });
    activeChatMenu = null;
}

// ==========================================
// ДЕЙСТВИЯ С ЧАТАМИ (С СИНХРОНИЗАЦИЕЙ)
// ==========================================

export function handleChatAction(action: string, chatId: string, chatTitle: string, isPinned: boolean): void {
    switch (action) {
        case 'pin':
            togglePinChat(chatId, !isPinned);
            break;
        case 'rename':
            renameChatFromDrawer(chatId, chatTitle);
            break;
        case 'context':
            window.showContextModal(chatId);
            break;
        case 'delete':
            deleteChatFromDrawer(chatId);
            break;
        default:
            break;
    }
}

// ==========================================
// ЗАКРЕПЛЕНИЕ С ПРОВЕРКОЙ ЛИМИТА
// ==========================================

export async function togglePinChat(chatId: string, pinned: boolean): Promise<void> {
    const found = chatStore.findChatById(chatId);
    if (!found) return;

    if (pinned) {
        const allChats = collectChats();
        const pinnedCount = allChats.filter(c => c.pinned === true && c.id !== chatId).length;
        
        if (pinnedCount >= MAX_PINNED_CHATS) {
            if (uiRenderer) {
                uiRenderer.showToast(
                    `⚠️ Максимум ${MAX_PINNED_CHATS} закреплённых чатов. Открепите другой чат.`,
                    'error',
                    3000
                );
            }
            if (window.Telegram?.WebApp?.showAlert) {
                window.Telegram.WebApp.showAlert(
                    `Максимум ${MAX_PINNED_CHATS} закреплённых чатов. Открепите другой чат.`
                );
            }
            return;
        }
    }

    found.chat.pinned = pinned;
    chatStore.save();
    renderChatsInDrawer();

    if (uiRenderer) {
        uiRenderer.showToast(pinned ? '📌 Чат закреплён' : '📌 Чат откреплён', 'success', 1500);
    }

    if (userStore.canSync() && window.chatService) {
        try {
            await window.chatService.pinChat(chatId, pinned);
            console.log(`✅ Закрепление чата ${chatId} синхронизировано: ${pinned}`);
        } catch (err) {
            console.error('❌ Ошибка синхронизации закрепления:', err);
            found.chat.pinned = !pinned;
            chatStore.save();
            renderChatsInDrawer();
            if (uiRenderer) {
                uiRenderer.showToast('⚠️ Не удалось синхронизировать закрепление', 'error', 2000);
            }
        }
    }
}

// ==========================================
// ПЕРЕИМЕНОВАНИЕ С СИНХРОНИЗАЦИЕЙ
// ==========================================

export function renameChatFromDrawer(chatId: string, currentTitle: string): void {
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
    renderChatsInDrawer();
    if (profileUI && typeof profileUI.updateChatTitle === 'function') {
        profileUI.updateChatTitle(chatId, trimmed);
    }

    if (uiRenderer) {
        uiRenderer.showToast('✏️ Чат переименован', 'success', 1500);
    }

    if (userStore.canSync() && window.chatService) {
        window.chatService.renameChat(chatId, trimmed).catch(err => {
            console.error('❌ Ошибка синхронизации переименования:', err);
            chatStore.renameChat(chatId, currentTitle);
            renderChatsInDrawer();
            if (profileUI && typeof profileUI.updateChatTitle === 'function') {
                profileUI.updateChatTitle(chatId, currentTitle);
            }
            if (uiRenderer) {
                uiRenderer.showToast('⚠️ Не удалось синхронизировать переименование', 'error', 2000);
            }
        });
    }
}

export function deleteChatFromDrawer(chatId: string): void {
    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_chat') : 'Удалить чат в корзину?';

    const action = (): void => {
        chatStore.deleteChat(chatId);
        if (userStore.canSync() && window.chatService) {
            window.chatService.deleteChat(chatId).catch(err => {
                console.error('❌ Ошибка синхронизации удаления:', err);
            });
        }
        renderChatsInDrawer();
        if (profileUI && typeof profileUI.renderHistoryChatsList === 'function') {
            profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
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
}

// ==========================================
// НИЖНЯЯ ЧАСТЬ САЙДБАРА (НАВИГАЦИЯ) - ОБНОВЛЕНА
// ==========================================

export function appendDrawerNav(container: HTMLElement): void {
    if (container.querySelector('.drawer-nav-bottom')) return;

    const currentTheme = window.themeManager?.getCurrentTheme() || 'light';
    const themeNames = { 'light': 'Светлая', 'amoled': 'AMOLED' };
    const themeLabel = themeNames[currentTheme] || 'Светлая';

    const nav = document.createElement('div');
    nav.className = 'drawer-nav-bottom';

    const menuItems: Array<{
        id: string;
        icon: string;
        label: string;
        action: () => void;
        show: boolean;
    }> = [
        {
            id: 'drawer-favorites',
            icon: '⭐',
            label: 'Избранное',
            action: () => window.showFavoritesModal(),
            show: true,
        },
        {
            id: 'drawer-trash',
            icon: '🗑️',
            label: 'Корзина',
            action: () => window.showTrashModal(),
            show: true,
        },
        // ✅ НОВЫЙ ПУНКТ: ЭКОНОМИКА (заменяет кошелек)
        {
            id: 'drawer-economy',
            icon: '💰',
            label: 'Экономика',
            action: () => {
                closeDrawer();
                window.moduleLoader.load('economy');
            },
            show: true,
        },
        {
            id: 'drawer-referral',
            icon: '🤝',
            label: 'Рефералы',
            action: () => {
                closeDrawer();
                window.moduleLoader.load('referral');
            },
            show: true,
        },
        {
            id: 'drawer-sponsors',
            icon: '📋',
            label: 'Задания',
            action: () => {
                closeDrawer();
                window.moduleLoader.load('quests');
            },
            show: true,
        },
        {
            id: 'drawer-admin-item',
            icon: '👑',
            label: 'Админ-панель',
            action: () => {
                closeDrawer();
                window.moduleLoader.load('admin');
            },
            show: userStore.role === 'creator',
        },
    ];

    const divider = document.createElement('div');
    divider.className = 'drawer-divider';
    nav.appendChild(divider);

    const settingsItems: Array<{
        id: string;
        icon: string;
        label: string;
        action: () => void;
        show: boolean;
    }> = [
        {
            id: 'drawer-profile',
            icon: '⚙️',
            label: 'Настройки',
            action: () => window.goToProfile(),
            show: true,
        },
        {
            id: 'drawer-theme-toggle',
            icon: '🎨',
            label: `Тема: ${themeLabel}`,
            action: () => {
                const themeManager = window.themeManager;
                if (themeManager) {
                    const currentTheme = themeManager.getCurrentTheme();
                    const themes: ('light' | 'amoled')[] = ['light', 'amoled'];
                    const currentIndex = themes.indexOf(currentTheme);
                    const nextTheme = themes[(currentIndex + 1) % themes.length];
                    themeManager.setTheme(nextTheme);
                    updateThemeLabel(nextTheme);
                    const labelEl = document.getElementById('drawer-theme-label');
                    if (labelEl) {
                        const names = { 'light': 'Светлая', 'amoled': 'AMOLED' };
                        labelEl.textContent = names[nextTheme] || 'Светлая';
                    }
                }
            },
            show: true,
        },
        {
            id: 'drawer-clear-cache',
            icon: '🗑️',
            label: 'Очистить кэш',
            action: () => {
                const confirmMsg = 'Очистить локальный кэш приложения?\n\n' +
                    '⚠️ Ваши НЕСИНХРОНИЗИРОВАННЫЕ данные (TRIAL) будут потеряны.\n' +
                    '☁️ Синхронизированные данные (PRO) восстановятся из облака.';

                const doClear = (): void => {
                    if (window.questsStore) {
                        window.questsStore._data = {};
                        window.questsStore.save();
                        window.questsStore.clearJWT();
                    }
                    if (window.chatStore) {
                        window.chatStore._data = {};
                        window.chatStore.save();
                        window.chatStore.clearJWT();
                    }
                    if (window.userStore) {
                        window.userStore._data = {};
                        window.userStore.save();
                        window.userStore.clearJWT();
                    }
                    if (window.organizerStore) {
                        window.organizerStore._data = {};
                        window.organizerStore.save();
                        window.organizerStore.clearJWT();
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
                    closeDrawer();
                    setTimeout(() => location.reload(), 1000);
                };

                if (window.Telegram?.WebApp?.showConfirm) {
                    window.Telegram.WebApp.showConfirm(confirmMsg, (ok: boolean) => { if (ok) doClear(); });
                } else if (confirm(confirmMsg)) {
                    doClear();
                }
            },
            show: true,
        },
    ];

    for (const item of menuItems) {
        if (!item.show) continue;

        const el = document.createElement('div');
        el.className = 'drawer-nav-item';
        el.id = item.id;
        el.innerHTML = `
            <span class="nav-icon">${item.icon}</span>
            ${item.label}
            ${item.id === 'drawer-trash' ? `
                <span id="drawer-trash-count" class="nav-badge" style="display:none;">0</span>
            ` : ''}
        `;
        el.addEventListener('click', item.action);
        nav.appendChild(el);
    }

    const divider2 = document.createElement('div');
    divider2.className = 'drawer-divider';
    nav.appendChild(divider2);

    for (const item of settingsItems) {
        if (!item.show) continue;

        const el = document.createElement('div');
        el.className = 'drawer-nav-item';
        el.id = item.id;

        if (item.id === 'drawer-theme-toggle') {
            el.innerHTML = `
                <span class="nav-icon">${item.icon}</span>
                Тема: <span id="drawer-theme-label">${themeLabel}</span>
            `;
        } else {
            el.innerHTML = `
                <span class="nav-icon">${item.icon}</span>
                ${item.label}
            `;
        }

        el.addEventListener('click', item.action);
        nav.appendChild(el);
    }

    const version = document.createElement('div');
    version.className = 'drawer-version';
    version.textContent = 'Версия 12.0.0';
    nav.appendChild(version);

    container.appendChild(nav);

    setTimeout(() => updateDrawerTrashCount(), 100);
}

// ==========================================
// ОБНОВЛЕНИЕ СЧЕТЧИКОВ
// ==========================================

export function updateDrawerCoins(): void {
    const balance = questsStore.getBalance() || 0;
    const coinEl = document.getElementById('drawer-coins-amount');
    if (coinEl) coinEl.textContent = String(balance);
}

export function updateDrawerTrashCount(): void {
    const badge = document.getElementById('drawer-trash-count');
    if (!badge) {
        console.warn('⚠️ [updateDrawerTrashCount] Элемент #drawer-trash-count не найден');
        return;
    }

    try {
        const trash = chatStore.getTrash();
        const total = trash.chats.length;

        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : String(total);
            badge.style.display = 'inline-block';
            badge.classList.add('visible');
        } else {
            badge.style.display = 'none';
            badge.classList.remove('visible');
        }

        console.log(`📊 [updateDrawerTrashCount] Обновлен счетчик: ${total} чатов в корзине`);
    } catch (err) {
        console.error('❌ Ошибка обновления счетчика корзины:', err);
        badge.style.display = 'none';
        badge.classList.remove('visible');
    }
}

// ==========================================
// ОБНОВЛЕНИЕ НАДПИСИ ТЕМЫ
// ==========================================

export function updateThemeLabel(theme: 'light' | 'amoled'): void {
    const label = document.getElementById('drawer-theme-label');
    if (!label) return;
    const names = { 'light': 'Светлая', 'amoled': 'AMOLED' };
    label.textContent = names[theme] || 'Светлая';
}

// ==========================================
// ОБНОВЛЕНИЕ САЙДБАРА ПРИ СМЕНЕ ТЕМЫ
// ==========================================

export function updateDrawerTheme(): void {
    const drawer = document.getElementById('drawer');
    if (!drawer) return;
    
    const currentTheme = window.themeManager?.getCurrentTheme() || 'light';
    drawer.setAttribute('data-theme', currentTheme);
    
    renderChatsInDrawer();
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================

export function initDrawer(): void {
    if (!document.getElementById('drawer')) {
        const drawerHTML = `
            <div id="drawer-overlay"></div>
            <div id="drawer">
                <div class="drawer-header">
                    <div class="drawer-avatar-wrapper">
                        <img id="drawer-avatar" src="" alt="Аватар" class="drawer-avatar">
                    </div>
                    <div class="drawer-user-info">
                        <div class="drawer-user-name" id="drawer-user-name">Пользователь</div>
                        <div class="drawer-user-username" id="drawer-user-username">@username</div>
                        <div class="drawer-user-status">
                            <span class="drawer-user-role" id="drawer-user-role">🔓 Бесплатный</span>
                            <span class="drawer-coins-badge" id="drawer-coins-badge" onclick="window.goToTasks()">
                                <i data-lucide="coins" style="width:16px;height:16px;color:var(--app-accent-primary);"></i>
                                <span class="coin-amount" id="drawer-coins-amount">0</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div id="drawer-chats-list" class="drawer-chats-list"></div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHTML);
        renderChatsInDrawer();
    }
}

// ==========================================
// ОБРАБОТЧИКИ ГЛОБАЛЬНЫХ СОБЫТИЙ
// ==========================================

export function setupDrawerEventListeners(): void {
    document.addEventListener('click', function(e: MouseEvent) {
        const drawer = document.getElementById('drawer');
        const overlay = document.getElementById('drawer-overlay');
        const headerGlass = document.querySelector('.header-glass');
        if (!drawer || !overlay) return;

        if (overlay.classList.contains('active')) {
            const target = e.target as HTMLElement;
            if (target === overlay || (!drawer.contains(target) && !headerGlass?.contains(target))) {
                closeDrawer();
            }
        }
    });

    document.addEventListener('click', function(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (!target.closest('.chat-menu-container')) {
            closeAllChatMenus();
        }
    });
}

// ==========================================
// ПРИВЯЗКА К WINDOW
// ==========================================

(window as any).openDrawer = openDrawer;
(window as any).closeDrawer = closeDrawer;
(window as any).renderChatsInDrawer = renderChatsInDrawer;
(window as any).updateDrawerCoins = updateDrawerCoins;
(window as any).updateDrawerTrashCount = updateDrawerTrashCount;
(window as any).updateThemeLabel = updateThemeLabel;
(window as any).updateDrawerTheme = updateDrawerTheme;
(window as any).appendDrawerNav = appendDrawerNav;
(window as any).toggleChatMenu = toggleChatMenu;
(window as any).closeAllChatMenus = closeAllChatMenus;
(window as any).handleChatAction = handleChatAction;
(window as any).togglePinChat = togglePinChat;
(window as any).renameChatFromDrawer = renameChatFromDrawer;
(window as any).deleteChatFromDrawer = deleteChatFromDrawer;

console.log('✅ drawer.ts v2.5.0 загружен (экономика добавлена, кошелек удален)');
