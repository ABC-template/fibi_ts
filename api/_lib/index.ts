// ============================================
// api/_lib/index.ts
// Единая точка входа для всех утилит Edge-функций
// Версия: 2.0.0 - исправлены импорты
// ============================================

export * from './auth';
export * from './cors';
export * from './rate-limit';
export * from './security-logger';
export * from './send-push';
export * from './supabase-client';
export * from './validators';

// Re-export типов для удобства
export type { ITelegramUser, IAuthResult } from './auth';
export type { CorsHeaders } from './cors';
export type { IRateLimitResult } from './rate-limit';
export type { ISecurityLogEntry } from './security-logger';
export type { ISupabaseConfig, IUsageLimitResult, IAuthUserResult } from './supabase-client';
export type {
  TopicId,
  MessageType,
  ChatAction,
  IImageSizeValidation,
  IAudioSizeValidation,
  IMessageLengthValidation
} from './validators';
