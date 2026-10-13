// ============================================
// src/utils/validators.ts
// Клиентские валидации
// Версия: 2.2.0 - sanitizeHTML через utils/html (общие правила, без style/id/img);
//                 длина сообщения до 100 000 (как на сервере)
//          2.1.0 - добавлены window
// ============================================

import { escapeHtml, sanitizeRichHtml } from './html';

/**
 * Проверка UUID
 */
export function isValidUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
}

/**
 * Проверка топика
 */
export function isValidTopic(topic: string): boolean {
    const allowed = ['code', 'creative', 'fast', 'kitchen', 'analytics'];
    return allowed.includes(topic);
}

/**
 * Проверка длины сообщения
 */
export function isValidMessageLength(text: string, maxLength: number = 100000): boolean {
    if (!text || typeof text !== 'string') return false;
    const length = text.trim().length;
    return length > 0 && length <= maxLength;
}

/**
 * Проверка email
 */
export function isValidEmail(email: string): boolean {
    if (!email) return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

/**
 * Проверка URL
 */
export function isValidURL(url: string): boolean {
    if (!url) return false;
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Проверка размера файла
 */
export function isValidFileSize(bytes: number, maxMB: number = 5): boolean {
    const maxBytes = maxMB * 1024 * 1024;
    return bytes <= maxBytes;
}

/**
 * Проверка Base64 изображения
 */
export function isValidImageBase64(str: string): boolean {
    if (!str) return false;
    return str.startsWith('data:image/') && str.includes(';base64,');
}

/**
 * Санитайзинг HTML (клиентский)
 */
export function sanitizeHTML(html: string): string {
    const clean = sanitizeRichHtml(html);
    // Без DOMPurify — HTML показывается как текст
    return clean === null ? escapeHtml(html) : clean;
}

// ==========================================
// ✅ ПРИСВАИВАЕМ ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ==========================================

(window as any).isValidUUID = isValidUUID;
(window as any).isValidTopic = isValidTopic;
(window as any).isValidMessageLength = isValidMessageLength;
(window as any).isValidEmail = isValidEmail;
(window as any).isValidURL = isValidURL;
(window as any).isValidFileSize = isValidFileSize;
(window as any).isValidImageBase64 = isValidImageBase64;
(window as any).sanitizeHTML = sanitizeHTML;

console.log('✅ Validators v2.1.0 загружен');
