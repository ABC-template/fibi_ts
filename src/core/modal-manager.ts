// ============================================
// src/core/modal-manager.ts
// Универсальный менеджер модалок
// Версия: 4.1.0 - добавлены window.showModal/closeModal
// ============================================

import { eventBus } from './event-bus';
import { navigationState } from './navigation-state';

export interface IModalOptions {
    title?: string;
    content?: string;
    footer?: string;
    modalId?: string;
    showFooter?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
    onSave?: () => void;
    onCancel?: () => void;
}

export class ModalManager {
    private modal: HTMLElement | null = null;
    private overlay: HTMLElement | null = null;
    private content: HTMLElement | null = null;
    private title: HTMLElement | null = null;
    private body: HTMLElement | null = null;
    private footer: HTMLElement | null = null;
    private closeBtn: HTMLElement | null = null;
    private eventBus = eventBus;
    private navigationState = navigationState;

    private _isOpen: boolean = false;
    private _callbacks: any = {};
    private _modalId: string | null = null;
    private _wasDrawerOpen: boolean = false;
    private _isClosing: boolean = false;

    constructor() {
        this._initElements();
        this._initEvents();
        console.log('✅ ModalManager v4.1.0 инициализирован');
    }

    private _initElements(): void {
        this.modal = document.getElementById('universal-modal');
        this.overlay = document.getElementById('modal-overlay');
        this.content = document.getElementById('modal-content');
        this.title = document.getElementById('modal-title');
        this.body = document.getElementById('modal-body');
        this.footer = document.getElementById('modal-footer');
        this.closeBtn = document.getElementById('modal-close');
    }

    private _initEvents(): void {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
            });
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    e.stopPropagation();
                    this.close();
                }
            });
        }

        if (this.content) {
            this.content.addEventListener('click', (e) => e.stopPropagation());
        }
        if (this.title) {
            this.title.addEventListener('click', (e) => e.stopPropagation());
        }
        if (this.body) {
            this.body.addEventListener('click', (e) => e.stopPropagation());
        }
        if (this.footer) {
            this.footer.addEventListener('click', (e) => e.stopPropagation());
        }

        this.eventBus.on('modal:state_changed', (data) => {
            if (data && data.action === 'back' && data.isOpen === false) {
                this._handleBackClose();
            }
        }, this);
    }

    private _handleBackClose(): void {
        if (this._isOpen && !this._isClosing) {
            console.log('📱 Модалка закрыта через кнопку "Назад"');
            this.close();
        }
    }

    open(options: IModalOptions = {}): void {
        const {
            title = 'Заголовок',
            content = '',
            footer = '',
            onOpen = null,
            onClose = null,
            onSave = null,
            onCancel = null,
            showFooter = false,
            modalId = 'default'
        } = options;

        this._isClosing = false;
        this._callbacks = { onOpen, onClose, onSave, onCancel };
        this._modalId = modalId;

        const drawer = document.getElementById('drawer');
        this._wasDrawerOpen = drawer?.classList.contains('active') || false;

        if (this._wasDrawerOpen && drawer) {
            drawer.style.pointerEvents = 'none';
            drawer.style.opacity = '0.5';
            document.body.style.overflow = '';
        }

        if (this.title) this.title.textContent = title;
        if (this.body) this.body.innerHTML = content;

        if (showFooter && footer && this.footer) {
            this.footer.innerHTML = footer;
            this.footer.classList.remove('hidden');

            const saveBtn = this.footer.querySelector('#modal-save-btn');
            const cancelBtn = this.footer.querySelector('#modal-cancel-btn');

            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this._callbacks.onSave) {
                        this._callbacks.onSave();
                    }
                });
            }

            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this._callbacks.onCancel) {
                        this._callbacks.onCancel();
                    }
                    this.close();
                });
            }
        } else if (this.footer) {
            this.footer.innerHTML = '';
            this.footer.classList.add('hidden');
        }

        if (this.modal) {
            this.modal.style.display = 'flex';
            this.modal.style.visibility = 'visible';
            this.modal.style.opacity = '1';
            this.modal.classList.remove('hidden');
        }

        if (this.content) {
            this.content.style.transition = 'none';
            this.content.style.transform = 'scale(0.95) translateY(20px)';
            this.content.style.opacity = '0';

            requestAnimationFrame(() => {
                if (this.content) {
                    this.content.style.transition = 'all 0.3s cubic-bezier(0.1, 0.8, 0.25, 1)';
                    this.content.style.transform = 'scale(1) translateY(0)';
                    this.content.style.opacity = '1';
                }
            });
        }

        this._isOpen = true;
        this.eventBus.emit('modal:open', { modalId: this._modalId });

        if (this.navigationState) {
            this.navigationState.toggleModal(true, this._modalId);
        }

        setTimeout(() => {
            if (typeof (window as any).lucide !== 'undefined') {
                (window as any).lucide.createIcons();
            }
        }, 100);

        if (this._callbacks.onOpen) {
            this._callbacks.onOpen();
        }

        console.log(`📱 Модалка открыта: ${title} (id: ${this._modalId})`);
    }

    close(): void {
        if (this._isClosing || !this._isOpen) return;
        this._isClosing = true;

        if (this.content) {
            this.content.style.transition = 'all 0.25s cubic-bezier(0.1, 0.8, 0.25, 1)';
            this.content.style.transform = 'scale(0.95) translateY(20px)';
            this.content.style.opacity = '0';
        }

        setTimeout(() => {
            if (this.modal) {
                this.modal.style.display = 'none';
                this.modal.style.visibility = 'hidden';
                this.modal.style.opacity = '0';
                this.modal.classList.add('hidden');
            }

            const drawer = document.getElementById('drawer');
            if (drawer) {
                drawer.style.pointerEvents = 'auto';
                drawer.style.opacity = '1';
            }

            document.body.style.overflow = '';

            this._isOpen = false;
            this._isClosing = false;

            this.eventBus.emit('modal:close', {
                modalId: this._modalId,
                action: 'close'
            });

            if (this.navigationState) {
                this.navigationState.toggleModal(false, this._modalId);
            }

            if (this.body) this.body.innerHTML = '';
            if (this.footer) {
                this.footer.innerHTML = '';
                this.footer.classList.add('hidden');
            }

            if (this._callbacks.onClose) {
                this._callbacks.onClose();
            }

            this._callbacks = {};
            this._modalId = null;

            console.log('📱 Модалка закрыта');
        }, 300);
    }

    isOpen(): boolean {
        return this._isOpen;
    }

    getModalId(): string | null {
        return this._modalId;
    }

    updateContent(content: string): void {
        if (this._isOpen && this.body) {
            this.body.innerHTML = content;
            setTimeout(() => {
                if (typeof (window as any).lucide !== 'undefined') {
                    (window as any).lucide.createIcons();
                }
            }, 100);
        }
    }

    updateTitle(title: string): void {
        if (this._isOpen && this.title) {
            this.title.textContent = title;
        }
    }

    updateFooter(footer: string): void {
        if (this._isOpen && this.footer) {
            if (footer) {
                this.footer.innerHTML = footer;
                this.footer.classList.remove('hidden');

                const saveBtn = this.footer.querySelector('#modal-save-btn');
                const cancelBtn = this.footer.querySelector('#modal-cancel-btn');

                if (saveBtn) {
                    saveBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (this._callbacks.onSave) {
                            this._callbacks.onSave();
                        }
                    });
                }

                if (cancelBtn) {
                    cancelBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (this._callbacks.onCancel) {
                            this._callbacks.onCancel();
                        }
                        this.close();
                    });
                }
            } else {
                this.footer.innerHTML = '';
                this.footer.classList.add('hidden');
            }
        }
    }

    forceClose(): void {
        if (this._isOpen) {
            if (this.modal) {
                this.modal.style.display = 'none';
                this.modal.style.visibility = 'hidden';
                this.modal.style.opacity = '0';
                this.modal.classList.add('hidden');
            }

            const drawer = document.getElementById('drawer');
            if (drawer) {
                drawer.style.pointerEvents = 'auto';
                drawer.style.opacity = '1';
            }

            document.body.style.overflow = '';
            this._isOpen = false;
            this._isClosing = false;

            if (this.body) this.body.innerHTML = '';
            if (this.footer) {
                this.footer.innerHTML = '';
                this.footer.classList.add('hidden');
            }
            this._callbacks = {};

            this.eventBus.emit('modal:close', {
                modalId: this._modalId,
                action: 'force'
            });

            if (this.navigationState) {
                this.navigationState.toggleModal(false, this._modalId);
            }

            this._modalId = null;

            console.log('📱 Модалка принудительно закрыта');
        }
    }
}

// Создаем экземпляр
export const modalManager = new ModalManager();

// ==========================================
// ✅ ПРИСВАИВАЕМ ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ==========================================

(window as any).showModal = modalManager.open.bind(modalManager);
(window as any).closeModal = modalManager.close.bind(modalManager);

console.log('✅ ModalManager v4.1.0 загружен');
