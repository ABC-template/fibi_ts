// ============================================
// src/core/index.ts
// Единый экспорт ядра
// ============================================

// ✅ ИСПРАВЛЕНО: убираем импорт config как модуль
import './config';

export * from './event-bus';
export * from './header-manager';
export * from './navigation-state';
export * from './navigation';
export * from './back-button-manager';
export * from './modal-manager';
export * from './module-loader';
export * from './theme-manager';
export * from './locale';

// Экспорты экземпляров
export { eventBus } from './event-bus';
export { headerManager } from './header-manager';
export { navigationState } from './navigation-state';
export { navigation } from './navigation';
export { backButtonManager } from './back-button-manager';
export { modalManager } from './modal-manager';
export { moduleLoader } from './module-loader';
export { themeManager } from './theme-manager';
