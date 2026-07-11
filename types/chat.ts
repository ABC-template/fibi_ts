// ============================================
// types/chat.ts
// Типы для чатов и сообщений
// ============================================

import { UUID, TopicId, MessageType, ISODateString } from './common';

/** Сообщение */
export interface IMessage {
  id: UUID;
  text: string;
  type: MessageType;
  isFavorite: boolean;
  created_at: ISODateString;
  updated_at?: ISODateString;
  deleted_at?: ISODateString | null;
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
  pinned?: boolean;
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
}

/** Данные для создания сообщения */
export interface ICreateMessageData {
  id?: UUID;
  text: string;
  type: MessageType;
  isFavorite?: boolean;
}

/** Корзина */
export interface ITrash {
  chats: IChat[];
  messages: IMessage[];
}

/** Экспорт архива */
export interface IExportArchive {
  chat_id: UUID;
  title: string;
  topic_id: TopicId;
  topic_name: string;
  max_context: number;
  user_renamed: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
  messages: IMessage[];
}

/** Элемент избранного */
export interface IFavoriteItem extends IMessage {
  chat_id: UUID;
  chat_title: string;
  topic: TopicId;
}
