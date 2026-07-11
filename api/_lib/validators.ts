// ============================================
// api/_lib/validators.ts
// Описание: Все валидации для Edge-функций
// Версия: 2.0.0 - TypeScript
// ============================================

// ==========================================
// UUID валидация
// ==========================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') return false;
  return UUID_REGEX.test(uuid);
}

export function validateUUID(uuid: string, fieldName: string = 'ID'): boolean {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid ${fieldName} format`);
  }
  return true;
}

// ==========================================
// Топик валидация
// ==========================================

const ALLOWED_TOPICS = ['code', 'creative', 'fast', 'kitchen', 'analytics'] as const;

export type TopicId = typeof ALLOWED_TOPICS[number];

export function isValidTopic(topic: string): boolean {
  if (!topic || typeof topic !== 'string') return false;
  return ALLOWED_TOPICS.includes(topic as TopicId);
}

export function validateTopic(topic: string): boolean {
  if (!isValidTopic(topic)) {
    throw new Error(`Invalid topic: ${topic}. Allowed: ${ALLOWED_TOPICS.join(', ')}`);
  }
  return true;
}

// ==========================================
// Размер изображения
// ==========================================

export interface IImageSizeValidation {
  valid: boolean;
  sizeInMB?: number;
  sizeInBytes?: number;
}

export function validateImageSize(
  base64String: string,
  maxSizeMB: number = 5
): IImageSizeValidation {
  if (!base64String) return { valid: true };

  // Убираем data:image/...;base64, если есть
  const cleanBase64 = base64String.includes(',')
    ? base64String.split(',')[1]
    : base64String;

  const base64Length = cleanBase64.length;
  const sizeInBytes = Math.ceil((base64Length * 3) / 4);
  const sizeInMB = sizeInBytes / (1024 * 1024);

  return {
    valid: sizeInMB <= maxSizeMB,
    sizeInMB: Math.round(sizeInMB * 100) / 100,
    sizeInBytes
  };
}

// ==========================================
// Размер аудио
// ==========================================

export interface IAudioSizeValidation {
  valid: boolean;
  sizeInMB?: number;
  sizeInBytes?: number;
  error?: string;
}

export function validateAudioSize(
  buffer: ArrayBuffer,
  maxSizeMB: number = 5
): IAudioSizeValidation {
  if (!buffer || buffer.byteLength === 0) {
    return { valid: false, error: 'Audio data is empty' };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  const sizeInMB = buffer.byteLength / (1024 * 1024);

  return {
    valid: buffer.byteLength <= maxBytes,
    sizeInMB: Math.round(sizeInMB * 100) / 100,
    sizeInBytes: buffer.byteLength
  };
}

// ==========================================
// Длина сообщения
// ==========================================

export interface IMessageLengthValidation {
  valid: boolean;
  length?: number;
  error?: string;
}

export function validateMessageLength(
  text: string,
  maxLength: number = 10000
): IMessageLengthValidation {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Message text is required' };
  }

  const length = text.trim().length;
  if (length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (length > maxLength) {
    return {
      valid: false,
      error: `Message too long (${length} chars). Maximum ${maxLength}`
    };
  }

  return { valid: true, length };
}

// ==========================================
// User ID валидация
// ==========================================

export function isValidUserId(userId: any): boolean {
  if (!userId) return false;
  const id = parseInt(userId, 10);
  return Number.isInteger(id) && id > 0;
}

export function validateUserId(userId: any): number {
  if (!isValidUserId(userId)) {
    throw new Error('Invalid user ID');
  }
  return parseInt(userId, 10);
}

// ==========================================
// Разрешенные действия для чатов
// ==========================================

const ALLOWED_ACTIONS = [
  'new_message', 'batch_messages', 'delete_chat', 'delete_message',
  'rename_chat', 'favorite_message', 'update_context', 'new_chat'
] as const;

export type ChatAction = typeof ALLOWED_ACTIONS[number];

export function isValidAction(action: string): boolean {
  if (!action || typeof action !== 'string') return false;
  return ALLOWED_ACTIONS.includes(action as ChatAction);
}

export function validateAction(action: string): boolean {
  if (!isValidAction(action)) {
    throw new Error(`Invalid action: ${action}. Allowed: ${ALLOWED_ACTIONS.join(', ')}`);
  }
  return true;
}

// ==========================================
// Экспорт типа сообщения
// ==========================================

const ALLOWED_MSG_TYPES = ['user-msg', 'ai-msg'] as const;

export type MessageType = typeof ALLOWED_MSG_TYPES[number];

export function isValidMessageType(type: string): boolean {
  if (!type || typeof type !== 'string') return false;
  return ALLOWED_MSG_TYPES.includes(type as MessageType);
}

export function validateMessageType(type: string): boolean {
  if (!isValidMessageType(type)) {
    throw new Error(`Invalid message type: ${type}. Allowed: ${ALLOWED_MSG_TYPES.join(', ')}`);
  }
  return true;
}
