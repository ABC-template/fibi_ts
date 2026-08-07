// ============================================
// api/tasks/index.ts
// Экспорт всех эндпоинтов заданий
// Версия: 1.0.0
// ============================================

export { default as sync } from './sync';
export { default as dailyBonusStatus } from './daily-bonus/status';
export { default as dailyBonusClaim } from './daily-bonus/claim';
export { default as questProgress } from './quests/progress';
export { default as questClaim } from './quests/claim';
export { default as achievementProgress } from './achievements/progress';
export { default as achievementClaim } from './achievements/claim';
