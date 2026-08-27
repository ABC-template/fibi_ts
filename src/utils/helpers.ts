// ============================================
// src/utils/helpers.ts
// Общие утилиты
// Версия: 2.1.0 - добавлены window
// ============================================

/**
 * Форматирование даты
 */
export function formatDate(dateStr: string): string {
    if (!dateStr) return 'неизвестно';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 0) {
        return 'сегодня ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff === 1) {
        return 'вчера ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7) {
        return diff + ' дня назад';
    } else {
        return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
    }
}

/**
 * Склонение слов
 */
export function pluralize(count: number, one: string, two: string, five: string): string {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
}

/**
 * Генерация UUID
 */
export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Задержка (Promise)
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Безопасный парсинг JSON
 */
export function safeJSONParse<T = any>(str: string, fallback: T | null = null): T | null {
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

/**
 * Транкейт строки
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + suffix;
}

/**
 * Проверка на пустой объект
 */
export function isEmptyObject(obj: any): boolean {
    if (!obj) return true;
    return Object.keys(obj).length === 0;
}

/**
 * Клонирование объекта
 */
export function cloneObject<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Дебаунс
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return function(...args: Parameters<T>) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}

/**
 * Троттлинг
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;
    return function(...args: Parameters<T>) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ==========================================
// ✅ ПРИСВАИВАЕМ ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ==========================================

(window as any).formatDate = formatDate;
(window as any).pluralize = pluralize;
(window as any).generateUUID = generateUUID;
(window as any).sleep = sleep;
(window as any).safeJSONParse = safeJSONParse;
(window as any).truncate = truncate;
(window as any).isEmptyObject = isEmptyObject;
(window as any).cloneObject = cloneObject;
(window as any).debounce = debounce;
(window as any).throttle = throttle;

console.log('✅ Helpers v2.1.0 загружен');
