// ============================================
// api/economy/index.ts
// Экспорт всех эндпоинтов экономики
// Версия: 1.1.0 — earn удалён (монеты начисляет только сервер), добавлен game
// ============================================

export { default as game } from './game';
export { default as spend } from './spend';
export { default as balance } from './balance';
export { default as history } from './history';
export { default as rules } from './rules';
export { default as audit } from './audit';
export { default as lock } from './lock';
