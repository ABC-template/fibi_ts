// ============================================
// src/ui/drawer.ts
// ВСЁ о сайдбаре (обновлен для экономики и агентов)
// Версия: 3.0.1 - без console.log с устаревшим номером версии
//          3.0.0 — фильтр чатов по агентам (список с сервера вместо зашитых тем, чаты —
//                  по agent_id); у агента без чатов — кнопка «Создать чат»; без чатов
//                  вообще — «Выбрать агента»; из меню убраны «ИИ-агенты» и «Задания»
//                  (есть в нижнем меню)
//          2.11.0 — разделы из сайдбара открываются через навигацию (как из нижнего меню):
//                  работают история и кнопка «Назад»; удаление открытого чата — переход
//                  к агентам без ручного hide() (его вызывает загрузчик модулей)
//          2.10.0 — очистка кэша через общую clearLocalCache (история чатов в IndexedDB)
//          2.9.0 — название и превью чата экранируются (XSS через название/текст сообщения)
//          2.8.0 — очистка кэша без clearJWT (JWT больше нет); пункт «Админ-панель» — по флагу сервера
//          2.7.0 — пункт «Админ-панель» показывается по Telegram ID (не по роли)
//          2.6.1 — нельзя удалить чат, пока в нём идёт генерация
//          2.6.0 — добавлен пункт "ИИ-агенты"
// ============================================

import './drawer.css';
import { chatStore } from '@/store/ChatStore';
import { clearLocalCache, confirmClearCache } from '@/utils/clear-cache';
import { userStore } from '@/store/UserStore';
import { questsStore } from '@/store/QuestsStore';
import { eventBus } from '@/core/event-bus';
import { CHAT_BUSY_DELETE_HINT } from '@/store/generation-live';
import { modalManager } from '@/core/modal-manager';
import { navigationState } from '@/core/navigation-state';
import { navigation } from '@/core/navigation';
import { uiRenderer } from '@/modules/ui/renderer';
import { profileUI } from '@/modules/ui/profile-ui';
import { escapeHtml } from '@/utils/html';
import { AGENT_MODALITY_EMOJI, getCachedAgents, loadAgentsCached, openNewAgentChat } from '@/services/agents';
import type { IPublicAgent } from '../../types/agents';
import type { TopicId, IChat } from '@app-types';

const MAX_PINNED_CHATS = 10;

/** Фильтр чатов: 'all' или id агента */
let drawerFilter: string = 'all';
/** Список агентов в фильтре уже отрисован по этим id (перерисовка — только при изменении) */
let renderedAgentKey = '';

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

export function renderChatsInDrawer(): void {
    const container = document.getElementById('drawer-chats-list');
    if (!container) return;

    container.innerHTML = '';

    const agents = filterAgents();
    renderedAgentKey = agents.map((a) => a.id).join(',');
    refreshAgentsInBackground();

    // Агента больше нет в списке — показываем все чаты
    if (drawerFilter !== 'all' && !agents.some((a) => a.id === drawerFilter)) drawerFilter = 'all';

    container.appendChild(createFilters(agents));

    const sortedChats = collectChats();

    const listWrapper = document.createElement('div');
    listWrapper.className = 'drawer-chats-wrapper';
    listWrapper.style.cssText = 'flex: 1; overflow-y: auto; min-height: 0;';

    if (sortedChats.length === 0) {
        listWrapper.appendChild(createEmptyState(agents.find((a) => a.id === drawerFilter) || null));
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

/**
 * Агенты для фильтра: доступные пользователю и те, с которыми уже есть чаты
 * (даже если доступ пропал — чтобы их чаты можно было найти)
 */
function filterAgents(): IPublicAgent[] {
    const agents = getCachedAgents() || [];
    const withChats = new Set<string>();
    for (const chats of Object.values(chatStore.histories || {}) as IChat[][]) {
        for (const chat of chats || []) {
            if (chat.agent_id && !chat.deleted_at && chat.messages?.length) withChats.add(chat.agent_id);
        }
    }
    return agents
        .filter((a) => a.has_access || withChats.has(a.id))
        .sort((a, b) => (a.sort_order || 100) - (b.sort_order || 100));
}

/** Свежий список агентов с сервера; если он изменился, а сайдбар открыт — перерисовать */
function refreshAgentsInBackground(): void {
    loadAgentsCached()
        .then(() => {
            const key = filterAgents().map((a) => a.id).join(',');
            const drawer = document.getElementById('drawer');
            if (key !== renderedAgentKey && drawer?.classList.contains('active')) renderChatsInDrawer();
        })
        .catch((err) => console.warn('⚠️ [drawer] Список агентов не загрузился:', err));
}

function createFilters(agents: IPublicAgent[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'drawer-filters';

    const options = [
        { id: 'all', label: 'Все' },
        ...agents.map((a) => ({
            id: a.id,
            label: `${AGENT_MODALITY_EMOJI[a.modality] || '🤖'} ${a.name?.ru || a.slug}`,
        })),
    ];

    const wrapper = document.createElement('div');
    wrapper.className = 'drawer-filter-wrapper';

    for (const option of options) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `drawer-filter-chip ${drawerFilter === option.id ? 'active' : ''}`;
        chip.textContent = option.label;
        chip.onclick = (e) => {
            e.stopPropagation();
            drawerFilter = option.id;
            renderChatsInDrawer();
        };
        wrapper.appendChild(chip);
    }

    container.appendChild(wrapper);

    // Выбранный фильтр — в зоне видимости (список прокручивается вбок)
    requestAnimationFrame(() => {
        wrapper.querySelector('.drawer-filter-chip.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    return container;
}

/** Пусто: для агента — «Создать чат» (или почему нельзя), для всех — «Выбрать агента» */
function createEmptyState(agent: IPublicAgent | null): HTMLElement {
    const box = document.createElement('div');
    box.className = 'drawer-empty';

    const text = document.createElement('div');
    text.className = 'drawer-empty-text';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'drawer-empty-btn';

    if (!agent) {
        text.textContent = 'Чатов пока нет';
        button.textContent = 'Выбрать агента';
        button.onclick = () => navigation.switchTab('agents');
    } else if (agent.has_access) {
        text.textContent = `С агентом «${agent.name?.ru || agent.slug}» чатов нет`;
        button.textContent = '＋ Создать чат';
        button.onclick = () => {
            closeDrawer({ instant: true });
            if (!openNewAgentChat(agent)) uiRenderer.showToast('⚠️ Не удалось создать чат', 'error', 1500);
        };
    } else {
        text.textContent = `Агент «${agent.name?.ru || agent.slug}» недоступен на вашем тарифе`;
        button.textContent = 'Подробнее';
        button.onclick = () => navigation.switchTab('agents');
    }

    box.append(text, button);
    return box;
}

function collectChats(): any[] {
    const pinnedChats: any[] = [];
    const unpinnedChats: any[] = [];

    const histories = chatStore.histories || {};
    const entries = Object.entries(histories) as [TopicId, IChat[]][];

    for (const [topic, chats] of entries) {
        if (!chats) continue;
        for (const chat of chats) {
            if (chat.deleted_at) continue;
            if (!chat.messages || chat.messages.length === 0) continue;
            if (drawerFilter !== 'all' && chat.agent_id !== drawerFilter) continue;

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
        <div class="chat-title">${escapeHtml(chat.title)}</div>
        <div class="chat-preview">${escapeHtml(preview)}</div>
    `;

    const menuContainer = createChatMenu(chat.id, chat.title, chat.pinned);

    item.appendChild(iconSpan);
    item.appendChild(infoDiv);
    item.appendChild(menuContainer);
    return item;
}

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
}

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
    if (chatStore.isChatBusy(chatId)) {
        uiRenderer?.showToast('⏳ ' + CHAT_BUSY_DELETE_HINT, 'warning', 2500);
        return;
    }
    const confirmMsg = window.getLangString ? window.getLangString('confirm_del_chat') : 'Удалить чат в корзину?';

    const action = (): void => {
        // Если удаляем открытый сейчас чат — после удаления уйдём к агентам
        const chatMod = (window as any).chatModule;
        const wasCurrentOpen =
            chatMod &&
            chatMod._isShowing &&
            String(chatMod._chatId) === String(chatId);

        chatStore.deleteChat(chatId);
        if (userStore.canSync() && window.chatService) {
            window.chatService.deleteChat(chatId).then(deleted => {
                if (!deleted) {
                    // Сервер отказал (например, в чате идёт запрос на другом устройстве) — чат возвращён
                    renderChatsInDrawer();
                    uiRenderer?.showToast('⚠️ Не удалось удалить чат', 'warning', 2500);
                }
            }).catch(err => {
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

        if (wasCurrentOpen) navigationState.goToAgents();
    };

    if (window.Telegram?.WebApp?.showConfirm) {
        window.Telegram.WebApp.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
        action();
    }
}

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
        {
            id: 'drawer-economy',
            icon: '💰',
            label: 'Экономика',
            action: () => navigation.switchTab('economy'),
            show: true,
        },
        {
            id: 'drawer-referral',
            icon: '🤝',
            label: 'Рефералы',
            action: () => navigation.switchTab('referral'),
            show: true,
        },
        {
            id: 'drawer-admin-item',
            icon: '👑',
            label: 'Админ-панель',
            action: () => navigation.switchTab('admin'),
            // По Telegram ID: роль владелец может переключать для тестов
            show: userStore.isCreator,
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
                confirmClearCache(() => {
                    closeDrawer();
                    void clearLocalCache();
                });
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

export function updateThemeLabel(theme: 'light' | 'amoled'): void {
    const label = document.getElementById('drawer-theme-label');
    if (!label) return;
    const names = { 'light': 'Светлая', 'amoled': 'AMOLED' };
    label.textContent = names[theme] || 'Светлая';
}

export function updateDrawerTheme(): void {
    const drawer = document.getElementById('drawer');
    if (!drawer) return;
    
    const currentTheme = window.themeManager?.getCurrentTheme() || 'light';
    drawer.setAttribute('data-theme', currentTheme);
    
    renderChatsInDrawer();
}

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
