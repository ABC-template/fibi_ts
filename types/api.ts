// ============================================
// types/api.ts
// Типы для API запросов и ответов
// ============================================

import { IChat, IMessage, ICreateChatData, ICreateMessageData } from './chat';
import { TopicId, UserLanguage, UUID, UserRole, ISODateString } from './common';

export interface IExportArchive {
  chat_id: UUID;
  title: string;
  topic_id: TopicId;
  topic_name: string;
  max_context: number;
  user_renamed: boolean;
  created_at: string;
  updated_at: string;
  messages: IMessage[];
}

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
  action: 'rename_chat' | 'update_context' | 'delete_chat';
  chatId: UUID;
  newTitle?: string;
  maxContext?: number;
}

/** Действия с сообщениями */
export interface IMessageActionRequest {
  action: 'new_message' | 'delete_message';
  chatId: UUID;
  message?: ICreateMessageData;
  messageId?: UUID;
}

/** Batch операции */
export interface IBatchRequest {
  action: 'batch_messages' | 'create_chat_batch';
  chatId?: UUID;
  topicId?: TopicId;
  chatTitle?: string;
  maxContext?: number;
  userRenamed?: boolean;
  messages: ICreateMessageData[];
}

/** Экспорт */
export interface IExportRequest {
  chatHistories: Record<string, IChat[]>;
  topicNames: Record<string, string>;
  exportOptions?: {
    part?: string;
  };
}

/** Экспорт ответ */
export interface IExportResponse {
  success: boolean;
  total_parts?: number;
  current_part?: number;
  total_messages?: number;
  archive?: IChat[] | IExportArchive[];
  error?: string;
}

/** Трекинг лимитов */
export interface IUsageLimit {
  allowed: boolean;
  used: number;
  limit: number;
  error: string | null;
}

/** Ответ от /auth/check */
export interface IAuthCheckResponse {
  isMember: boolean;
  role: UserRole;
  dailyLimit: number;
  syncEnabled: boolean;
  syncToken: string | null;
  userId: number;
  authUserId: UUID;
  userUuid: UUID;
  jwtToken: string;
  expiresIn: number;
  isNewUser: boolean;
  dataDeadline?: ISODateString | null;
  serverModels: Record<string, boolean>;
  error?: string;
}
