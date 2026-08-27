// ============================================
// src/ui/header.ts
// Управление хедером, монетами, пользователем
// Версия: 1.2.0 - используем questsStore.getBalance()
// ============================================

import './header.css';
import { questsStore } from '@/store/QuestsStore';
import { userStore } from '@/store/UserStore';
import { eventBus } from '@/core/event-bus';

export function updateCoinsDisplay(): void {
    const balance = questsStore.getBalance() || 0;
    const headerCoinEl = document.querySelector('.coin-amount');
    if (headerCoinEl) (headerCoinEl as HTMLElement).textContent = String(balance);
    
    const drawerCoinsEl = document.getElementById('drawer-coins-amount');
    if (drawerCoinsEl) drawerCoinsEl.textContent = String(balance);
}

export function updateHeaderUserInfo(): void {
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const avatarEl = document.getElementById('user-avatar') as HTMLImageElement;
    
    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
        if (avatarEl) avatarEl.src = avatarUrl;
    }
}

export function updateDrawerUserInfo(): void {
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const drawerAvatar = document.getElementById('drawer-avatar') as HTMLImageElement;
    const drawerName = document.getElementById('drawer-user-name');
    const drawerUsername = document.getElementById('drawer-user-username');

    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
        if (drawerAvatar) drawerAvatar.src = avatarUrl;
        if (drawerName) drawerName.textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        if (drawerUsername) drawerUsername.textContent = user.username ? '@' + user.username : '';
    }
}

export function updateDrawerRole(role: string): void {
    const roleEl = document.getElementById('drawer-user-role');
    if (!roleEl) return;
    const roleMap: Record<string, string> = {
        'trial': '🔓 Бесплатный',
        'premium': '⭐ PRO',
        'admin': '👑 Админ',
        'creator': '👑 Создатель'
    };
    roleEl.textContent = roleMap[role] || role;
}

export function updateRealtimeIndicator(status: string): void {
    const indicator = document.getElementById('realtime-indicator');
    if (!indicator) return;

    const statusMap: Record<string, { emoji: string; text: string; className: string }> = {
        'connected': { emoji: '🟢', text: 'Синхр.', className: 'online' },
        'connecting': { emoji: '🟡', text: 'Подкл.', className: 'connecting' },
        'offline': { emoji: '🔴', text: 'Офлайн', className: 'offline' },
        'syncing': { emoji: '🔄', text: 'Синхр.', className: 'connecting' },
    };

    const state = statusMap[status] || statusMap.offline;
    indicator.textContent = state.emoji;
    indicator.className = `realtime-indicator ${state.className}`;
    indicator.title = state.text;
}

// Подписка на обновления баланса
export function setupHeaderSubscriptions(): () => void {
    const unsub = eventBus.on('tasks:balance_changed', (data) => {
        document.querySelectorAll('.coin-amount, #drawer-coins-amount, #header-coins-amount').forEach(el => {
            if (el) (el as HTMLElement).textContent = String(data.newBalance || 0);
        });
    });
    return unsub;
}
