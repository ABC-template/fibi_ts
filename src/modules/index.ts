// ============================================
// src/modules/index.ts
// Единый экспорт всех модулей
// Версия: 3.1.0 - удален SponsorsModule
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

// Chat подмодули
export * from './chat/send';
export * from './chat/stream';
export * from './chat/voice';
export * from './chat/media';

// Вспомогательные
export * from './trash';
export * from './export-local';

// Новые модули
export * from './coins/CoinsModule';
export * from './referral/ReferralModule';
export * from './admin/AdminModule';
