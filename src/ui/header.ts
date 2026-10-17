// ============================================
// src/ui/header.ts
// Управление хедером, монетами, пользователем
// Версия: 2.0.0 - балансы в шапке двумя строками: монеты и энергия (компактно: до 9999 как
//                 есть, дальше 12,3K / 1,2M; ∞ — без ограничений), энергия обновляется по
//                 economy:tokens:updated; нажатие на балансы — раздел «Экономика»;
//                 высота шапки публикуется в --app-header-space (контент уходит под неё);
//                 роль в сайдбаре — с иконкой Lucide; удалён мёртвый updateRealtimeIndicator
//          1.2.1 - без неиспользуемых импортов и переменных
//          1.2.0 - используем questsStore.getBalance()
// ============================================

import './header.css';
import { questsStore } from '@/store/QuestsStore';
import { eventBus } from '@/core/event-bus';
import { economyStore } from '@/economy/EconomyStore';

/** Компактное число: до 9999 как есть, дальше 12,3K и 1,2M */
export function formatCompact(value: number): string {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    if (n <= 9999) return String(n);
    const [div, suffix] = n >= 1_000_000 ? [1_000_000, 'M'] : [1000, 'K'];
    const short = Math.floor((n / div) * 10) / 10;
    return `${String(short).replace('.', ',')}${suffix}`;
}

/** Энергия для показа: ∞ у админа/создателя (без ограничений), иначе компактно */
export function formatEnergy(): string {
    const tokens = economyStore.getTokenBalances();
    return tokens.bypass ? '∞' : formatCompact(tokens.total ?? 0);
}

export function updateEnergyDisplay(): void {
    const el = document.getElementById('header-energy-amount');
    if (el) el.textContent = formatEnergy();
}

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

/** Роль в сайдбаре: иконка Lucide и подпись */
export function updateDrawerRole(role: string): void {
    const roleEl = document.getElementById('drawer-user-role');
    if (!roleEl) return;
    const roleMap: Record<string, { icon: string; label: string }> = {
        'trial': { icon: 'user', label: 'Бесплатный' },
        'premium': { icon: 'star', label: 'PRO' },
        'admin': { icon: 'shield', label: 'Админ' },
        'creator': { icon: 'crown', label: 'Создатель' }
    };
    const item = roleMap[role] || { icon: 'user', label: role };
    roleEl.innerHTML = `<i data-lucide="${item.icon}"></i><span></span>`;
    (roleEl.querySelector('span') as HTMLElement).textContent = item.label;
    if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
    }
}

/** --app-header-space: где заканчивается шапка (контент начинается ниже, но прокручивается под ней) */
function publishHeaderSpace(header: HTMLElement): void {
    const rect = header.getBoundingClientRect();
    const space = header.classList.contains('hidden') || rect.height === 0 ? 0 : Math.ceil(rect.bottom);
    document.documentElement.style.setProperty('--app-header-space', `${space}px`);
}

// Подписки шапки: балансы, переход в Экономику, высота шапки
export function setupHeaderSubscriptions(): () => void {
    const unsubs: Array<() => void> = [];

    unsubs.push(eventBus.on('tasks:balance_changed', (data) => {
        document.querySelectorAll('.coin-amount, #drawer-coins-amount, #header-coins-amount').forEach(el => {
            if (el) (el as HTMLElement).textContent = String(data.newBalance || 0);
        });
    }));
    unsubs.push(eventBus.on('economy:tokens:updated', () => updateEnergyDisplay()));
    updateEnergyDisplay();

    const badge = document.getElementById('header-balance');
    const openEconomy = () => (window as any).goToEconomy?.();
    badge?.addEventListener('click', openEconomy);
    unsubs.push(() => badge?.removeEventListener('click', openEconomy));

    const header = document.getElementById('header');
    if (header) {
        const publish = () => publishHeaderSpace(header);
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
        observer?.observe(header);
        window.addEventListener('resize', publish);
        publish();
        unsubs.push(() => {
            observer?.disconnect();
            window.removeEventListener('resize', publish);
        });
    }

    return () => unsubs.forEach((unsub) => unsub());
}
