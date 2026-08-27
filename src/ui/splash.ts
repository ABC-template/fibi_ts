// ============================================
// src/ui/splash.ts
// Управление кастомной заставкой
// Версия: 1.0.0 - чистая версия, без костылей
// ============================================
import './splash.css';

let splashScreen: HTMLElement | null = null;
let progressBar: HTMLElement | null = null;
let statusText: HTMLElement | null = null;

const SPLASH_STATUSES = [
    '🔮 Инициализация...',
    '⚡ Загрузка модулей...',
    '🎨 Настройка интерфейса...',
    '🧠 Активация нейросетей...',
    '📊 Подготовка данных...',
    '✨ Почти готово...',
];

export function initSplash(): void {
    splashScreen = document.getElementById('splash-screen');
    progressBar = document.getElementById('splash-progress-bar');
    statusText = document.getElementById('splash-status-text');
    console.log('🎬 Заставка инициализирована');
}

export function updateSplashProgress(percent: number, status?: string): void {
    if (progressBar) {
        const clamped = Math.min(Math.max(percent, 0), 100);
        progressBar.style.width = `${clamped}%`;
    }
    if (status && statusText) {
        statusText.textContent = status;
    }
}

export function updateSplashStatus(index: number): void {
    if (statusText && index < SPLASH_STATUSES.length) {
        statusText.textContent = SPLASH_STATUSES[index];
    }
}

export function hideSplash(): void {
    if (!splashScreen) {
        console.warn('⚠️ splashScreen не найден');
        return;
    }

    const tg = (window as any).Telegram?.WebApp;
    if (tg && typeof tg.hideLoading === 'function') {
        try {
            tg.hideLoading();
        } catch (e) {
            console.log('ℹ️ hideLoading не поддерживается');
        }
    }

    splashScreen.classList.add('hidden');
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.display = 'none';
        }
    }, 600);

    console.log('✅ Заставка скрыта');
}
