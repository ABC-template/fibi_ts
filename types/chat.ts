// ============================================
// types/chat.ts
// Типы для чатов и сообщений
// Версия: 2.3.0 — IExportArchive описывает формат архива (сообщения — IExportArchiveMessage,
//                  с данными генерации); удалён дубль в types/api.ts
//          2.2.0 — добавлен metadata для генераций
// ============================================

import { UUID, TopicId, MessageType, ISODateString } from './common';
import type { IGenerationMetadata } from './generation';

/** Сообщение */
export interface IMessage {
  id: UUID;
  text: string;
  type: MessageType;
  isFavorite: boolean;
  created_at: ISODateString;
  updated_at?: ISODateString;
  deleted_at?: ISODateString | null;
  metadata?: IGenerationMetadata | Record<string, any> | null;
}

/** Сообщение из БД (с дополнительными полями) */
export interface IMessageDB extends IMessage {
  chat_id: UUID;
  msg_type: MessageType;
}

/** Чат */
export interface IChat {
  id: UUID;
  title: string;
  topic: TopicId;
  maxContext: number;
  language: string;
  userRenamed: boolean;
  synced: boolean;
  pinned: boolean;
  agent_id?: string | null;
  modality?: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
  deleted_at: ISODateString | null;
  messages: IMessage[];
}

/** Чат из БД */
export interface IChatDB {
  id: UUID;
  user_id: number;
  user_uuid: UUID;
  topic_id: TopicId;
  title: string;
  max_context: number;
  user_renamed: boolean;
  pinned: boolean;
  agent_id: UUID | null;
  modality: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
  deleted_at: ISODateString | null;
}

/** Данные для создания чата */
export interface ICreateChatData {
  id?: UUID;
  topic_id: TopicId;
  title?: string;
  max_context?: number;
  user_renamed?: boolean;
  pinned?: boolean;
  agent_id?: string | null;
  modality?: string | null;
}

/** Данные для создания сообщения */
export interface ICreateMessageData {
  id?: UUID;
  text: string;
  type: MessageType;
  isFavorite?: boolean;
  metadata?: IGenerationMetadata | Record<string, any> | null;
}

/** Корзина */
export interface ITrash {
  chats: IChat[];
  messages: IMessage[];
}

/** Сообщение в архиве */
export interface IExportArchiveMessage {
  id: UUID;
  type: MessageType;
  text: string;
  is_favorite: boolean;
  created_at: ISODateString;
  /** Только для сообщений генерации */
  generation?: {
    status: string | null;
    modality: string | null;
    prompt: string | null;
    negative_prompt?: string | null;
    params?: Record<string, any>;
    /** В облачном архиве — с подписанной ссылкой, в локальном — без */
    media: Array<{ type: string; mime: string; url?: string | null; url_expires_at?: string | null }>;
  } | null;
}

/** Чат в архиве (экспорт) */
export interface IExportArchive {
  chat_id: UUID;
  title: string;
  topic_id: TopicId;
  topic_name: string;
  max_context: number;
  user_renamed: boolean;
  pinned: boolean;
  agent_id?: string | null;
  modality?: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
  messages: IExportArchiveMessage[];
}

/** Элемент избранного */
export interface IFavoriteItem extends IMessage {
  chat_id: UUID;
  chat_title: string;
  topic: TopicId;
}
