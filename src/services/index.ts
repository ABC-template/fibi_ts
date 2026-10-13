// ============================================
// src/services/index.ts
// Единый экспорт всех сервисов
// Версия: 2.1.0 - убран device (регистрация устройств: таблицы и эндпоинта больше нет)
//          2.0.0 - добавлен network
// ============================================

export * from './api';
export * from './auth';
export * from './chats';
export * from './messages';
export * from './organizer';
export * from './sync';
export * from './network';

// Экспорты экземпляров
export { apiClient } from './api';
export { authService } from './auth';
export { chatService } from './chats';
export { messageService } from './messages';
export { organizerService } from './organizer';
export { syncService } from './sync';
