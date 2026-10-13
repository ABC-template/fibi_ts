// ============================================
// types/api.ts
// Типы для API запросов и ответов
// Версия: 2.1.0 — удалён IBatchRequest (маршрут batch удалён)
//          2.0.0 — удалены IExportRequest / IExportResponse (локальный экспорт без сервера)
//                  и дубль IExportArchive (он в types/chat.ts)
// ============================================

import { ICreateChatData, ICreateMessageData } from './chat';
import { TopicId, UserLanguage, UUID, UserRole, ISODateString } from './common';

/** Запрос на стриминг */
export interface IStreamRequest {
  historyMessages: Array<{
    type: string;
    text: string;
  }>;
  currentTopic: TopicId;
  userLang: UserLanguage;
  attachedImage: string | null;
}

/** Ответ на стриминг (SSE) */
export type IStreamResponse = ReadableStream<Uint8Array>;

/** Создание чата */
export interface ICreateChatRequest {
  action: 'create_chat';
  chat: ICreateChatData;
  firstMessage?: ICreateMessageData | null;
}

/** Создание чата ответ */
export interface ICreateChatResponse {
  success: boolean;
  chatId: UUID;
  messageId?: UUID;
  syncToken?: string;
  error?: string;
}

/** Действия с чатами */
export interface IChatActionRequest {
  action: 'rename_chat' | 'update_context' | 'delete_chat' | 'pin_chat';
  chatId: UUID;
  newTitle?: string;
  maxContext?: number;
  pinned?: boolean;
}

/** Действия с сообщениями */
export interface IMessageActionRequest {
  action: 'new_message' | 'delete_message';
  chatId: UUID;
  message?: ICreateMessageData;
  messageId?: UUID;
}

/** Трекинг лимитов */
export interface IUsageLimit {
  allowed: boolean;
  used: number;
  limit: number;
  error: string | null;
}

/** Токен Supabase Realtime (подписан сервером, sub = users.id) */
export interface IRealtimeToken {
  token: string;
  /** Unix-время истечения (секунды) */
  expiresAt: number;
}

/** Ответ от /auth/check */
export interface IAuthCheckResponse {
  isMember: boolean;
  role: UserRole;
  dailyLimit: number;
  usedToday: number;
  syncEnabled: boolean;
  syncToken: string | null;
  /** Есть только при syncEnabled */
  realtime: IRealtimeToken | null;
  /** Доступ к админ-панели (по Telegram ID на сервере) */
  adminPanel: boolean;
  /** Пользователь заблокирован (бонусы дня не начисляются) */
  blocked: boolean;
  userId: number;
  userUuid: UUID;
  isNewUser: boolean;
  dataDeadline?: ISODateString | null;
  serverModels: Record<string, boolean>;
  tokens?: { bonus: number; permanent: number; total: number };
  limits?: {
    tier_key: string;
    bonus_tokens_per_day: number;
    permanent_tokens: number;
    daily_spend_limit: number;
    bypass: boolean;
  };
  today_bonus_added?: number;
  checkin?: {
    claimed: boolean;
    streak: number;
    base: number;
    bonus: number;
    reward: number;
    coins: number | null;
  } | null;
  subscription_tier?: string | null;
  premium_until?: ISODateString | null;
  error?: string;
}
