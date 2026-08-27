// ============================================
// src/modules/index.ts
// Единый экспорт всех модулей
// Версия: 4.0.0 - добавлен EconomyModule, удален CoinsModule
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

// Новый модуль экономики (заменяет CoinsModule)
export * from './economy/EconomyModule';

// Chat подмодули
export * from './chat/send';
export * from './chat/stream';
export * from './chat/voice';
export * from './chat/media';

// Вспомогательные
export * from './trash';
export * from './export-local';

// Модули (без coins - заменен на economy)
export * from './referral/ReferralModule';
export * from './admin/AdminModule';

// ❌ CoinsModule УДАЛЕН (заменен на EconomyModule)
