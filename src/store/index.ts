// ============================================
// src/store/index.ts
// Единый экспорт всех хранилищ
// Версия: 3.0.0 - удалён TasksStore, добавлен QuestsStore
// ============================================

export * from './BaseStore';
export * from './ChatStore';
export * from './UserStore';
export * from './OrganizerStore';
export * from './QuestsStore';

// Экспорты экземпляров
export { chatStore } from './ChatStore';
export { userStore } from './UserStore';
export { organizerStore } from './OrganizerStore';
export { questsStore } from './QuestsStore';
