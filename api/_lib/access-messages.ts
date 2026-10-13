// ============================================
// api/_lib/access-messages.ts
// Тексты отказа в доступе и их коды. errorResponse (cors.ts) по тексту
// добавляет в ответ поле code — по нему приложение показывает заглушку.
// Без зависимостей: подключается и в cors.ts, и в access-gate.ts.
// Версия: 1.0.0
// ============================================

export const ACCESS_BLOCKED_MESSAGE = '⛔ Доступ к приложению ограничен администратором.';
export const CHANNEL_REQUIRED_MESSAGE = '📢 Чтобы пользоваться приложением, подпишитесь на канал.';

/** Текст ошибки → код для приложения */
export const ACCESS_ERROR_CODES: Record<string, string> = {
  [ACCESS_BLOCKED_MESSAGE]: 'blocked',
  [CHANNEL_REQUIRED_MESSAGE]: 'channel_required',
};
