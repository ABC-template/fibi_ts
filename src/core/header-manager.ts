// ============================================
// src/core/header-manager.ts
// Управление динамическим хедером
// Версия: 6.0.0 - название чата — в стеклянной «пилюле» (вид задаёт header.css, без
//                 inline-стилей); удалены неиспользуемые updateHeader / IHeaderConfig и
//                 глобальные window.updateHeader, updateChatTitle, getDefaultHeader
//          5.2.1 - без console.log с устаревшим номером версии
//          5.2.0 - заголовок (название чата) экранируется
// ============================================

import { escapeHtml } from '@/utils/html';

export interface IHeaderAction {
    id: string;
    icon: string;
    title?: string;
    onClick?: () => void;
}

export class HeaderManager {
    /**
     * Установить заголовок (пусто — без «пилюли»)
     */
    setTitle(title: string | null): void {
        const centerEl = document.getElementById('header-center');
        if (!centerEl) return;

        centerEl.innerHTML = title && title.trim().length > 0
            ? `<span id="header-title-text" class="header-title-pill">${escapeHtml(title)}</span>`
            : '';
    }

    /**
     * Установить кнопки справа (иконки Lucide)
     */
    setActions(actions: IHeaderAction[] = []): void {
        const rightEl = document.getElementById('header-right');
        if (!rightEl) return;

        rightEl.innerHTML = '';
        if (!actions || actions.length === 0) return;

        for (const action of actions) {
            const btn = document.createElement('button');
            btn.className = 'header-action-btn';
            btn.dataset.action = action.id;
            btn.title = action.title || '';

            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', action.icon);
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
        }, 0);
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
}

export const headerManager = new HeaderManager();
