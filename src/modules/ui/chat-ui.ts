// ============================================
// src/modules/ui/chat-ui.ts
// Управление чатами (компактная версия)
// Версия: 4.1.1 - FIXED TYPES
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { eventBus } from '@/core/event-bus';
import type { IChat, TopicId, UUID } from '@types';

export class ChatUI {
    private chatStore = chatStore;
    private eventBus = eventBus;
    private currentTopic: TopicId = 'code';
    private _subscriptions: Array<() => void> = [];

    constructor() {
        this._subscribeToEvents();
        console.log('✅ ChatUI v4.1.1 загружен');
    }

    private _subscribeToEvents(): void {
        const update = () => this._updateLists();

        const unsub1 = this.eventBus.on('chat:message_added', update, this);
        this._subscriptions.push(unsub1);

        const unsub2 = this.eventBus.on('chat:all_updated', update, this);
        this._subscriptions.push(unsub2);

        const unsub3 = this.eventBus.on('chat:renamed', update, this);
        this._subscriptions.push(unsub3);

        const unsub4 = this.eventBus.on('chat:deleted', () => {
            if ((window as any).updateTrashCount) setTimeout((window as any).updateTrashCount, 300);
            this._updateLists();
        }, this);
        this._subscriptions.push(unsub4);

        const unsub5 = this.eventBus.on('chat:restored', () => {
            if ((window as any).updateTrashCount) setTimeout((window as any).updateTrashCount, 300);
            this._updateLists();
        }, this);
        this._subscriptions.push(unsub5);
    }

    private _updateLists(): void {
        if ((window as any).renderChatsInDrawer) (window as any).renderChatsInDrawer();
        if ((window as any).chatListModule) {
            (window as any).chatListModule._renderRecentChats();
        }
        if ((window as any).profileUI?.renderHistoryChatsList) {
            (window as any).profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
        }
    }

    createNewChat(): IChat | null {
        this._deleteEmptyCurrentChat();
        const chat = this.chatStore.createTempChat();
        chat.synced = false;
        this.chatStore.save();
        this._updateLists();
        return chat;
    }

    private _deleteEmptyCurrentChat(): boolean {
        const active = this.chatStore.getActiveChat();
        if (!active || this.chatStore.hasRealMessages(active)) return false;
        const topic = (active as any).topic || this.currentTopic;
        this.chatStore.deleteChat(active.id);
        this.chatStore.save();
        return true;
    }

    cleanupAllEmptyChats(): number {
        let cleaned = 0;
        for (const [topic, chats] of Object.entries(this.chatStore.histories || {})) {
            if (!chats) continue;
            for (const chat of chats) {
                if (!this.chatStore.hasRealMessages(chat)) {
                    const topicChats = this.chatStore.getChats(topic as TopicId);
                    if (topicChats.length > 1) {
                        this.chatStore.deleteChat(chat.id);
                        cleaned++;
                    }
                }
            }
        }
        if (cleaned > 0) this.chatStore.save();
        return cleaned;
    }

    showChatInterface(): void {
        // Заглушка для совместимости
    }

    refreshUI(): void {
        this._updateLists();
    }

    loadActiveChatMessages(): void {
        // Заглушка для совместимости
    }

    destroy(): void {
        for (const unsub of this._subscriptions) {
            try {
                unsub();
            } catch (e) {
                console.warn('Ошибка отписки ChatUI:', e);
            }
        }
        this._subscriptions = [];
        console.log('📡 ChatUI отписан от событий');
    }
}

// Создаем экземпляр
export const chatUI = new ChatUI();

// ==========================================
// ✅ ПРИСВАИВАЕМ ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ==========================================

/**
 * Переименовать чат (глобальная функция)
 */
(window as any).renameChat = function(event: Event, chatId: UUID): void {
    if (event) event.stopPropagation();
    if (!navigator.onLine) {
        if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Нет интернета. Переименование недоступно.');
        return;
    }
    const found = chatStore.findChatById(chatId);
    if (!found) {
        if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Чат не найден');
        return;
    }
    const newTitle = prompt('Введите новое название:', found.chat.title || 'Без названия');
    if (newTitle?.trim()) {
        const trimmed = newTitle.trim();
        if (chatStore.renameChat(chatId, trimmed)) {
            (window as any).chatUI?._updateLists();
            if (userStore.canSync() && (window as any).chatService) {
                (window as any).chatService.renameChat(chatId, trimmed);
            }
            if ((window as any).uiRenderer) (window as any).uiRenderer.showToast('✏️ Чат переименован', 'success', 1500);
        }
    }
};

/**
 * Удалить чат (глобальная функция)
 */
(window as any).deleteChat = async function(event: Event, chatId: UUID): Promise<void> {
    if (event) event.stopPropagation();
    if (!navigator.onLine) {
        if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Нет интернета. Удаление недоступно.');
        return;
    }
    const found = chatStore.findChatById(chatId);
    if (!found || found.chat.deleted_at) return;
    const confirmMsg = (window as any).getLangString ? (window as any).getLangString('confirm_del_chat') : 'Удалить чат в корзину?';
    const action = async () => {
        if (!chatStore.deleteChat(chatId)) {
            if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Не удалось удалить чат');
            return;
        }
        if (userStore.canSync() && (window as any).chatService) {
            await (window as any).chatService.deleteChat(chatId);
        }
        (window as any).chatUI?._updateLists();
        if ((window as any).updateTrashCount) setTimeout((window as any).updateTrashCount, 300);
        if ((window as any).uiRenderer) (window as any).uiRenderer.showToast('🗑️ Чат отправлен в корзину', 'info', 1500);
        const active = chatStore.getActiveChat();
        if (!active || !chatStore.hasRealMessages(active)) {
            if ((window as any).moduleLoader) {
                (window as any).moduleLoader.load('chat-list');
            }
        }
    };
    if ((window as any).tg?.showConfirm) {
        (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
        action();
    }
};

/**
 * Получить текущий активный чат (глобальная функция)
 */
(window as any).getCurrentActiveChat = function(): IChat | null {
    return chatStore.getActiveChat();
};

console.log('✅ ChatUI v4.1.1 загружен (глобальные функции)');
