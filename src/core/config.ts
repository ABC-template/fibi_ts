// ============================================
// src/core/config.ts
// Запуск Telegram WebApp (expand / ready) и window.tg
// Версия: 9.0.0 - удалены неиспользуемые глобальные переменные (window.config, currentTopic,
//                 currentModel, currentFilter, usedToday, allUserKeys, mediaRecorder, audioChunks,
//                 topicShortNames, welcomeTexts, modelNames); window.topicNames — импорт из
//                 config/topics в местах использования
//          8.1.0 - FIXED: убрано переопределение цвета хедера
// ============================================

const tg = (window as any).Telegram?.WebApp;
if (tg) {
    try {
        tg.expand();
        tg.ready();
        // Цвет хедера задаётся в index.html (инлайн-скрипт) — без серого мелькания
    } catch (e) {
        console.error('Ошибка инициализации Telegram:', e);
    }
}

(window as any).tg = tg;

/** Идёт отправка голосового сообщения (voice.ts) — кнопка записи ждёт */
(window as any).isSendingMessage = false;

export {};
