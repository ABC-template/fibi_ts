// ============================================
// src/store/index.ts
// Единый экспорт всех хранилищ
// ============================================

export * from './BaseStore';
export * from './ChatStore';
export * from './UserStore';
export * from './OrganizerStore';
export * from './TasksStore';

// Экспорты экземпляров
export { chatStore } from './ChatStore';
export { userStore } from './UserStore';
export { organizerStore } from './OrganizerStore';
export { tasksStore } from './TasksStore';
