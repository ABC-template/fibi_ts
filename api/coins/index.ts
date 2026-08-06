// ============================================
// api/coins/index.ts
// Экспорт API эндпоинтов для монет
// Версия: 1.0.1 - исправлены конфликты экспорта
// ============================================

// Явные экспорты, чтобы избежать конфликтов
export { default as balance } from './balance';
export { default as add } from './add';
export { default as history } from './history';
export { default as sync } from './sync';

// Если нужны все сразу
// (но лучше использовать именованные импорты на стороне клиента)
