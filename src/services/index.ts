// ============================================
// src/services/index.ts
// Единый экспорт всех сервисов
// ============================================

export * from './api';
export * from './auth';
export * from './chats';
export * from './messages';
export * from './organizer';
export * from './sync';
export * from './device';

// Экспорты экземпляров
export { apiClient } from './api';
export { authService } from './auth';
export { chatService } from './chats';
export { messageService } from './messages';
export { organizerService } from './organizer';
export { syncService } from './sync';
export { deviceService } from './device';
