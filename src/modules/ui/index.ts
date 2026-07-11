// ============================================
// src/modules/ui/index.ts
// Единый экспорт UI-модулей
// ============================================

export * from './renderer';
export * from './chat-ui';
export * from './profile-ui';
export * from './organizer-ui';

// Экспорты экземпляров
export { uiRenderer } from './renderer';
export { chatUI } from './chat-ui';
export { profileUI } from './profile-ui';
export { organizerUI } from './organizer-ui';
