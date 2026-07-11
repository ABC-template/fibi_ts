// ============================================
// src/modules/index.ts
// Единый экспорт всех модулей
// ============================================

// UI модули (рендереры)
export * from './ui';

// Основные модули
export * from './dashboard/DashboardModule';
export * from './chat-list/ChatListModule';
export * from './chat/ChatModule';
export * from './organizer/OrganizerModule';
export * from './profile/ProfileModule';
export * from './tasks/TasksModule';
export * from './games/GamesModule';

// Chat подмодули
export * from './chat/send';
export * from './chat/stream';
export * from './chat/voice';
export * from './chat/media';

// Вспомогательные
export * from './trash';
export * from './export-local';
export * from './ui-footer';
