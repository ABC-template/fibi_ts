// ============================================
// src/core/config.ts
// Глобальная конфигурация приложения
// Версия: 8.0.0 - FIXED
// ============================================

console.log('✅ Config v8.0.0 загружен');

// ==========================================
// TELEGRAM INIT
// ==========================================

const tg = (window as any).Telegram?.WebApp;
if (tg) {
    try {
        tg.expand();
        tg.ready();
        if (tg.themeParams && tg.themeParams.bg_color) {
            tg.setHeaderColor(tg.themeParams.bg_color);
            tg.setBackgroundColor(tg.themeParams.bg_color);
        }
    } catch (e) {
        console.error('Ошибка инициализации Telegram:', e);
    }
}

(window as any).tg = tg;

// ==========================================
// КОНФИГУРАЦИЯ
// ==========================================

(window as any).config = {
    dailyLimit: 0,
    role: 'trial',
    serverModels: {},
    syncEnabled: false
};

// Текущие топики
(window as any).currentTopic = 'code';
(window as any).currentModel = 'gemini';
(window as any).currentFilter = 'all';

// Счетчики
(window as any).usedToday = 0;
(window as any).allUserKeys = {};

// Состояния
(window as any).isSendingMessage = false;
(window as any).isVoiceRecording = false;
(window as any).mediaRecorder = null;
(window as any).audioChunks = [];

// ==========================================
// НАЗВАНИЯ ТОПИКОВ
// ==========================================

(window as any).topicNames = {
    code: '#кодинг',
    creative: '#креатив',
    fast: '#флуд',
    kitchen: '#кухня',
    analytics: '#аналитика'
};

(window as any).topicShortNames = {
    code: '#кодинг',
    creative: '#креатив',
    fast: '#флуд',
    kitchen: '#кухня',
    analytics: '#аналитика'
};

// ==========================================
// ПРИВЕТСТВИЯ
// ==========================================

(window as any).welcomeTexts = {
    code: 'Привет! Я Versatile AI в режиме Кодинга. Помогу написать чистый код, исправить баги или спроектировать архитектуру. Какой проект разберем? 💻',
    creative: 'Привет! Режим Креатива активирован. Готов написать текст, сценарий, рекламный пост или сгенерировать идеи. Какая задача? ✨',
    fast: 'Йоу! Я Versatile AI в режиме Флуда. Короткие и емкие ответы без лишней воды. Спрашивай! ⚡',
    kitchen: 'Добро пожаловать на кухню Versatile AI! Помогу с рецептами, меню или секретами шеф-поваров. Что готовим? 🍳',
    analytics: 'Режим Аналитики. Готов к разбору задач, анализу данных и документов. 📊'
};

// ==========================================
// НАЗВАНИЯ МОДЕЛЕЙ
// ==========================================

(window as any).modelNames = {
    gemini: 'Gemini 2.5',
    deepseek: 'DeepSeek V3',
    gpt: 'GPT-4o',
    claude: 'Claude 3.5',
    grok: 'Grok 4.3'
};

console.log('✅ config.ts загружен');

// ✅ ДОБАВЛЯЕМ ЭКСПОРТ
export {};
