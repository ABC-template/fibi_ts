// ============================================
// api/_lib/index.ts
// Единая точка входа для всех утилит Edge-функций
// Версия: 2.5.0 - без неиспользуемых security-logger и send-push; без IUsageLimitResult
//          2.3.0 - убран ChatAction (список действий удалён)
//          2.2.0 - экспорт jwt (токен Realtime), убран IAuthUserResult
//          2.1.0 - добавлен checkUsageLimit и incrementUsage в экспорты
// ============================================

export * from './auth';
export * from './jwt';
export * from './cors';
export * from './rate-limit';
export * from './supabase-client';
export * from './validators';

// Re-export типов для удобства
export type { ITelegramUser, IAuthResult } from './auth';
export type { CorsHeaders } from './cors';
export type { IRateLimitResult } from './rate-limit';
export type { ISupabaseConfig } from './supabase-client';
export type {
  TopicId,
  MessageType,
  IImageSizeValidation,
  IAudioSizeValidation,
  IMessageLengthValidation
} from './validators';
