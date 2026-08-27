// ============================================
// src/core/header-manager.ts
// Управление динамическим хедером
// Версия: 5.1.0 - добавлены window.updateHeader, updateChatTitle, getDefaultHeader
// ============================================

import { eventBus } from './event-bus';

export interface IHeaderAction {
    id: string;
    icon: string;
    title?: string;
    onClick?: () => void;
}

export interface IHeaderConfig {
    center?: {
        html?: string;
        title?: string;
    };
    right?: {
        html?: string;
        actions?: IHeaderAction[];
    };
}

export class HeaderManager {
    private eventBus = eventBus;
    private _subscriptions: Array<() => void> = [];
    private _currentTitle: string | null = null;
    private _currentActions: IHeaderAction[] = [];

    constructor() {
        console.log('✅ HeaderManager v5.1.0 загружен');
    }

    // ==========================================
    // ОСНОВНЫЕ МЕТОДЫ
    // ==========================================

    /**
     * Установить заголовок
     */
    setTitle(title: string | null): void {
        const centerEl = document.getElementById('header-center');
        if (!centerEl) return;

        this._currentTitle = title;

        if (title && title.trim().length > 0) {
            centerEl.innerHTML = `
                <span id="header-title-text" style="
                    font-weight: 600;
                    font-size: 16px;
                    color: var(--app-text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: block;
                    max-width: 100%;
                    text-align: left;
                ">
                    ${title}
                </span>
            `;
            centerEl.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: flex-start;
                flex: 1;
                min-width: 0;
                overflow: hidden;
                padding: 0 8px;
            `;
        } else {
            centerEl.innerHTML = '';
            centerEl.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: flex-start;
                flex: 1;
                min-width: 0;
                overflow: hidden;
                padding: 0 8px;
            `;
        }
    }

    /**
     * Установить меню действий
     */
    setActions(actions: IHeaderAction[] = []): void {
        const rightEl = document.getElementById('header-right');
        if (!rightEl) return;

        this._currentActions = actions;

        rightEl.innerHTML = '';
        rightEl.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';

        if (!actions || actions.length === 0) {
            return;
        }

        for (const action of actions) {
            const btn = document.createElement('button');
            btn.className = 'header-action-btn';
            btn.dataset.action = action.id;
            btn.title = action.title || '';

            const icon = this._createIcon(action.icon);
            btn.appendChild(icon);

            if (action.onClick) {
                btn.addEventListener('click', action.onClick);
            }

            rightEl.appendChild(btn);
        }

        setTimeout(() => {
            if (typeof (window as any).lucide !== 'undefined') {
                (window as any).lucide.createIcons();
            }
        }, 50);
    }

    /**
     * Очистить меню действий
     */
    clearActions(): void {
        this.setActions([]);
    }

    /**
     * Сбросить всё
     */
    reset(): void {
        this.setTitle(null);
        this.setActions([]);
    }

    // ==========================================
    // ВСПОМОГАТЕЛЬНЫЕ
    // ==========================================

    private _createIcon(name: string): HTMLElement {
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', name);
        return icon;
    }

    /**
     * Универсальное обновление (для обратной совместимости)
     */
    updateHeader(config: IHeaderConfig): void {
        if (config.center?.html) {
            const centerEl = document.getElementById('header-center');
            if (centerEl) {
                centerEl.innerHTML = config.center.html;
                centerEl.style.cssText = 'display:flex;align-items:center;justify-content:flex-start;flex:1;min-width:0;overflow:hidden;padding:0 8px;';
            }
        }
        if (config.center?.title) {
            this.setTitle(config.center.title);
        }
        if (config.right?.html) {
            const rightEl = document.getElementById('header-right');
            if (rightEl) {
                rightEl.innerHTML = config.right.html;
                rightEl.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
            }
        }
        if (config.right?.actions) {
            this.setActions(config.right.actions);
        }
        setTimeout(() => {
            if (typeof (window as any).lucide !== 'undefined') {
                (window as any).lucide.createIcons();
            }
        }, 50);
    }

    // ==========================================
    // ОЧИСТКА ПОДПИСОК
    // ==========================================

    destroy(): void {
        for (const unsub of this._subscriptions) {
            try {
                unsub();
            } catch (e) {
                console.warn('Ошибка отписки HeaderManager:', e);
            }
        }
        this._subscriptions = [];
        console.log('📡 HeaderManager отписан от событий');
    }
}

// Создаем экземпляр
export const headerManager = new HeaderManager();

// ==========================================
// ✅ ПРИСВАИВАЕМ ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ==========================================

(window as any).updateHeader = headerManager.updateHeader.bind(headerManager);
(window as any).updateChatTitle = headerManager.setTitle.bind(headerManager);
(window as any).getDefaultHeader = (tabId: string) => ({ center: '', right: '' });

console.log('✅ HeaderManager v5.1.0 загружен');
