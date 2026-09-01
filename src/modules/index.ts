// ============================================
// src/modules/index.ts
// Единый экспорт всех модулей
// Версия: 4.1.0 — добавлен AgentsModule
// ============================================

// UI модули (рендереры)
export * from './ui';

// Основные модули
export * from './dashboard/DashboardModule';
export * from './chat-list/ChatListModule';
export * from './chat/ChatModule';
export * from './organizer/OrganizerModule';
export * from './profile/ProfileModule';
export * from './quests/QuestsModule';
export * from './games/GamesModule';

// ✅ НОВЫЙ МОДУЛЬ: Агенты
export * from './agents/AgentsModule';

// Экономика
export * from './economy/EconomyModule';

// Chat подмодули
export * from './chat/send';
export * from './chat/stream';
export * from './chat/voice';
export * from './chat/media';

// Вспомогательные
export * from './trash';
export * from './export-local';

// Модули
export * from './referral/ReferralModule';
export * from './admin/AdminModule';
