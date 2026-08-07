// ============================================
// src/ui/drawer.ts
// ВСЁ о сайдбаре
// Версия: 1.2.0 - исправлен импорт
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
    listWrapper.style.cssText = 'flex: 1; overflow-y: auto; min-height: 0;';

    if (sortedChats.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 20px; text-align: center; color: var(--app-text-tertiary); font-size: 13px;';
        empty.textContent = drawerFilter === 'all' ? 'Нет чатов' : 'Нет чатов в этом разделе';
        listWrapper.appendChild(empty);
        container.appendChild(listWrapper);
        appendDrawerNav(container);

        setTimeout(() => updateDrawerTrashCount(), 50);
        return;
    }

    const listEl = document.createElement('div');
    listEl.className = 'drawer-chats-section';
    listEl.style.cssText = 'padding: 0;';

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
    container.style.cssText = `
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

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        display: flex;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 4px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
    `;
    (wrapper as HTMLElement).style.setProperty('ms-overflow-style', 'none');

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

    return [...pinnedChats, ...unpinnedChats];
}

function sortChats(chats: any[]): any[] {
    return chats.sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
}

function createChatItem(chat: any): HTMLElement {
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

    const preview = chat.lastMessage
        ? chat.lastMessage.substring(0, 40) + (chat.lastMessage.length > 40 ? '...' : '')
        : 'Пустой чат';

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

    const menuContainer = createChatMenu(chat.id, chat.title, chat.pinned);

    item.appendChild(iconSpan);
    item.appendChild(infoDiv);
    item.appendChild(menuContainer);
    return item;
}

function createChatMenu(chatId: string, chatTitle: string, isPinned: boolean): HTMLElement {
    const container = document.createElement('div');
    container.className = 'chat-menu-container';
    container.style.cssText = 'position: relative; display: inline-block; flex-shrink: 0;';

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
        toggleChatMenu(chatId, container);
    });

    const menu = document.createElement('div');
    menu.className = 'chat-menu';
    menu.dataset.chatId = chatId;
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
}

export function closeAllChatMenus(): void {
    document.querySelectorAll('.chat-menu').forEach(m => {
        (m as HTMLElement).style.opacity = '0';
        (m as HTMLElement).style.visibility = 'hidden';
        (m as HTMLElement).style.transform = 'translateY(-8px) scale(0.96)';
        (m as HTMLElement).style.pointerEvents = 'none';
    });
    activeChatMenu = null;
}

// ==========================================
// ДЕЙСТВИЯ С ЧАТАМИ
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

export function togglePinChat(chatId: string, pinned: boolean): void {
    const found = chatStore.findChatById(chatId);
    if (!found) return;
    found.chat.pinned = pinned;
    chatStore.save();
    renderChatsInDrawer();
    if (uiRenderer) {
        uiRenderer.showToast(pinned ? '📌 Чат закреплен' : '📌 Чат откреплен', 'success', 1500);
    }
}

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
// НИЖНЯЯ ЧАСТЬ САЙДБАРА (НАВИГАЦИЯ)
// ==========================================

export function appendDrawerNav(container: HTMLElement): void {
    if (container.querySelector('.drawer-nav-bottom')) return;

    const currentTheme = window.themeManager?.getCurrentTheme() || 'light';
    const themeNames = { 'light': 'Светлая', 'amoled': 'AMOLED' };
    const themeLabel = themeNames[currentTheme] || 'Светлая';

    const nav = document.createElement('div');
    nav.className = 'drawer-nav-bottom';
    nav.style.cssText = `
        flex-shrink: 0;
        border-top: 1px solid rgba(212,175,55,0.08);
        padding: 8px 0;
        background: var(--app-bg-secondary);
    `;

    // === Пункты меню ===
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
        {
            id: 'drawer-coins',
            icon: '💰',
            label: 'Кошелёк',
            action: () => {
                closeDrawer();
                window.moduleLoader.load('coins');
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

    // === Разделитель перед настройками ===
    const divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: rgba(212,175,55,0.08); margin: 4px 20px;';
    nav.appendChild(divider);

    // === Настройки ===
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
        el.style.cssText = `
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 20px;
            color: var(--app-text-secondary);
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            border: none;
            background: transparent;
            width: 100%;
            text-align: left;
            font-family: var(--app-font-family);
            -webkit-tap-highlight-color: transparent;
        `;
        el.innerHTML = `
            <span class="nav-icon" style="font-size: 18px; width: 28px; text-align: center; flex-shrink: 0;">${item.icon}</span>
            ${item.label}
            ${item.id === 'drawer-trash' ? `
                <span id="drawer-trash-count" style="
                    margin-left: auto;
                    font-size: 11px;
                    background: var(--app-accent-danger, #E74C3C);
                    color: white;
                    padding: 1px 8px;
                    border-radius: 12px;
                    font-weight: 600;
                    display: none;
                ">0</span>
            ` : ''}
        `;
        el.addEventListener('click', item.action);
        nav.appendChild(el);
    }

    const divider2 = document.createElement('div');
    divider2.style.cssText = 'height: 1px; background: rgba(212,175,55,0.08); margin: 4px 20px;';
    nav.appendChild(divider2);

    for (const item of settingsItems) {
        if (!item.show) continue;

        const el = document.createElement('div');
        el.className = 'drawer-nav-item';
        el.id = item.id;
        el.style.cssText = `
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 20px;
            color: var(--app-text-secondary);
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            border: none;
            background: transparent;
            width: 100%;
            text-align: left;
            font-family: var(--app-font-family);
            -webkit-tap-highlight-color: transparent;
        `;

        if (item.id === 'drawer-theme-toggle') {
            el.innerHTML = `
                <span class="nav-icon" style="font-size: 18px; width: 28px; text-align: center; flex-shrink: 0;">${item.icon}</span>
                Тема: <span id="drawer-theme-label">${themeLabel}</span>
            `;
        } else {
            el.innerHTML = `
                <span class="nav-icon" style="font-size: 18px; width: 28px; text-align: center; flex-shrink: 0;">${item.icon}</span>
                ${item.label}
            `;
        }

        el.addEventListener('click', item.action);
        nav.appendChild(el);
    }

    const version = document.createElement('div');
    version.style.cssText = 'padding: 8px 20px 4px 20px; font-size: 11px; color: var(--app-text-tertiary); text-align: center;';
    version.textContent = 'Версия 9.0.0';
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
// ИНИЦИАЛИЗАЦИЯ
// ==========================================

export function initDrawer(): void {
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
(window as any).appendDrawerNav = appendDrawerNav;
(window as any).toggleChatMenu = toggleChatMenu;
(window as any).closeAllChatMenus = closeAllChatMenus;
(window as any).handleChatAction = handleChatAction;
(window as any).togglePinChat = togglePinChat;
(window as any).renameChatFromDrawer = renameChatFromDrawer;
(window as any).deleteChatFromDrawer = deleteChatFromDrawer;

console.log('✅ drawer.ts v1.2.0 загружен');
