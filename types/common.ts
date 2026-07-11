// ============================================
// types/common.ts
// Базовые типы, используемые во всем приложении
// Версия: 2.0.0 - с поддержкой конфига
// ============================================

/** Тема чата (теперь это просто string, валидация через конфиг) */
export type TopicId = string;

/** Фильтр для топиков (включает 'all') */
export type TopicFilter = TopicId | 'all';

/** Роли пользователей */
export type UserRole = 'guest' | 'trial' | 'premium' | 'admin' | 'creator';

/** Типы сообщений */
export type MessageType = 'user-msg' | 'ai-msg';

/** Статусы напоминаний */
export type ReminderStatus = 'pending' | 'sent' | 'failed';

/** Статусы трекеров */
export type TrackerStatus = 'active' | 'paused' | 'archived';

/** Языки пользователя */
export type UserLanguage = 'ru' | 'en' | 'it';

/** Тон мотивации для трекеров */
export type TrackerTone = 'support' | 'discipline' | 'sarcasm';

/** Роли ассистентов */
export type AssistantRole = 
  | 'developer' 
  | 'copywriter' 
  | 'assistant' 
  | 'chef' 
  | 'analyst'
  | 'marketer'
  | 'teacher'
  | 'psychologist'
  | 'custom';

/** Характер ассистента */
export type AssistantTone = 
  | 'professional' 
  | 'creative' 
  | 'concise' 
  | 'friendly' 
  | 'persuasive'
  | 'sarcastic'
  | 'strict'
  | 'empathetic'
  | 'custom';

/** Флаги фичей для темы */
export interface FeatureFlags {
  imageSupport: boolean;
  voiceSupport: boolean;
  fileUpload: boolean;
  codeHighlighting: boolean;
  [key: string]: boolean; // для расширения
}

/** UUID тип для строгой типизации */
export type UUID = string;

/** ISO Дата-строка */
export type ISODateString = string;

/** Результат API запроса */
export interface ApiResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
  status?: number;
}

/** Пагинация */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/** Сортировка */
export interface SortParams {
  field: string;
  order: 'asc' | 'desc';
}
