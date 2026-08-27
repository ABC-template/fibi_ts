// ============================================
// src/services/network.ts
// Обработка офлайн/онлайн
// Версия: 1.0.0
// ============================================

import { syncService } from './sync';
import { authService } from './auth';
import { userStore } from '@/store/UserStore';

let offlineBanner: HTMLElement | null = null;
let offlineStartTime: number | null = null;

export function showOfflineBanner(message: string = 'Нет интернета. Просмотр доступен, изменения невозможны.'): void {
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
}

export function hideOfflineBanner(): void {
    if (!offlineBanner) return;
    offlineBanner.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => {
        if (offlineBanner) { offlineBanner.remove(); offlineBanner = null; }
    }, 300);
}

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

export function setupNetworkListeners(): void {
    window.addEventListener('offline', () => {
        console.log('📴 Интернет потерян');
        offlineStartTime = Date.now();
        showOfflineBanner();
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
        hideOfflineBanner();
        offlineStartTime = null;
    });
}
