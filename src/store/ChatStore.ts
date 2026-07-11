// ============================================
// src/store/ChatStore.ts
// Управление чатами и сообщениями
// Версия: 5.0.3 - FIXED msg_type -> type
// ============================================

import { BaseStore } from './BaseStore';
import type {
  IChat,
  IMessage,
  ICreateChatData,
  ICreateMessageData,
  ITrash,
  IFavoriteItem,
  IChatStoreData,
  TopicId,
  MessageType,
  UUID,
  ISODateString
} from '@types';

const DEFAULT_TOPICS: TopicId[] = ['code', 'creative', 'fast', 'kitchen', 'analytics'];

export class ChatStore extends BaseStore<IChatStoreData> {
  constructor() {
    super('chat');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        histories: {} as Record<TopicId, IChat[]>,
        activeIds: {} as Record<TopicId, string | null>,
        currentTopic: 'code'
      };
      this.save();
    }

    if (!this._data.histories) this._data.histories = {} as Record<TopicId, IChat[]>;
    if (!this._data.activeIds) this._data.activeIds = {} as Record<TopicId, string | null>;
    if (!this._data.currentTopic) this._data.currentTopic = 'code';

    for (const topic of DEFAULT_TOPICS) {
      if (!this._data.activeIds[topic]) {
        this._data.activeIds[topic] = null;
      }
      if (!this._data.histories[topic]) {
        this._data.histories[topic] = [];
      }
    }
    this.save();
  }

  // ==========================================
  // ГЕТТЕРЫ
  // ==========================================

  get histories(): Record<TopicId, IChat[]> {
    return this._data.histories;
  }

  get activeIds(): Record<TopicId, string | null> {
    return this._data.activeIds;
  }

  get currentTopic(): TopicId {
    return this._data.currentTopic;
  }

  set currentTopic(value: TopicId) {
    this._data.currentTopic = value;
    this.save();
    this._emitChange('chat:topic_changed', { topic: value });
  }

  // ==========================================
  // ✅ ИСПРАВЛЕНО: ПОЛНАЯ ЗАМЕНА ДАННЫХ
  // ==========================================

  updateAllChats(cloudChats: IChat[]): void {
    console.log(`📋 [updateAllChats] Полная замена данных: ${cloudChats?.length || 0} чатов...`);
    
    if (!cloudChats || !Array.isArray(cloudChats)) {
      console.warn('⚠️ [updateAllChats] Нет данных для обновления');
      return;
    }

    const grouped: Record<TopicId, IChat[]> = {} as Record<TopicId, IChat[]>;
    let totalMessages = 0;
    
    for (const chat of cloudChats) {
      const chatTopic = chat.topic || 'fast';
      if (!grouped[chatTopic]) {
        grouped[chatTopic] = [];
      }
      
      const localChat: IChat = {
        id: chat.id,
        title: chat.title || 'Без названия',
        maxContext: chat.maxContext || 15,
        language: chat.language || 'ru',
        topic: chatTopic,
        userRenamed: chat.userRenamed || false,
        synced: true,
        deleted_at: chat.deleted_at || null,
        created_at: chat.created_at || new Date().toISOString(),
        updated_at: chat.updated_at || new Date().toISOString(),
        messages: (chat.messages || []).map(m => {
          // ✅ ИСПРАВЛЕНО: правильное преобразование msg_type -> type
          const msgType = (m as any).msg_type || m.type || 'user-msg';
          return {
            id: m.id,
            text: m.text,
            type: msgType as MessageType,
            isFavorite: m.isFavorite || false,
            deleted_at: m.deleted_at || null,
            created_at: m.created_at || new Date().toISOString()
          };
        })
      };
      
      localChat.messages.sort((a, b) => {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });
      
      totalMessages += localChat.messages.length;
      grouped[chatTopic].push(localChat);
    }

    const entries = Object.entries(grouped) as [TopicId, IChat[]][];
    for (const [topicId, chats] of entries) {
      this._data.histories[topicId] = chats;
    }

    const existingTopics = Object.keys(this._data.histories) as TopicId[];
    for (const topicId of existingTopics) {
      if (!grouped[topicId]) {
        this._data.histories[topicId] = [];
      }
    }

    const allTopics = Object.keys(this._data.histories) as TopicId[];
    for (const topicId of allTopics) {
      const chats = this._data.histories[topicId] || [];
      const activeChat = chats.find(c => !c.deleted_at && c.messages && c.messages.length > 0);
      if (activeChat) {
        this._data.activeIds[topicId] = activeChat.id;
      } else {
        this._data.activeIds[topicId] = null;
      }
    }

    this.save();
    
    console.log(`✅ [updateAllChats] Заменено ${cloudChats.length} чатов, ${totalMessages} сообщений`);
    this._emitChange('chat:all_updated', {
      totalChats: cloudChats.length,
      totalMessages: totalMessages
    });
  }

  // ==========================================
  // ПОИСК
  // ==========================================

  findChatById(chatId: UUID): { chat: IChat; topic: TopicId } | null {
    if (!chatId) return null;
    
    const entries = Object.entries(this._data.histories || {}) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
      if (!chats || !Array.isArray(chats)) continue;
      
      for (const chat of chats) {
        if (chat.id === chatId) {
          return { chat, topic: topic };
        }
      }
    }
    return null;
  }

  findChatByMessageId(messageId: UUID): { chat: IChat; topic: TopicId } | null {
    if (!messageId) return null;
    
    const entries = Object.entries(this._data.histories || {}) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
      if (!chats || !Array.isArray(chats)) continue;
      
      for (const chat of chats) {
        if (!chat.messages || !Array.isArray(chat.messages)) continue;
        
        const found = chat.messages.find(m => m.id === messageId);
        if (found) {
          return { chat, topic: topic };
        }
      }
    }
    return null;
  }

  // ==========================================
  // РАБОТА С ЧАТАМИ
  // ==========================================

  getChats(topicId?: TopicId): IChat[] {
    if (!topicId) topicId = this._data.currentTopic;
    return this._data.histories[topicId] || [];
  }

  getActiveChat(topicId?: TopicId): IChat | null {
    if (!topicId) topicId = this._data.currentTopic;
    const chats = this.getChats(topicId);
    const activeId = this._data.activeIds[topicId];
    return chats.find(c => c.id === activeId) || null;
  }

  setActiveChat(topicId: TopicId, chatId: UUID | null): void {
    if (!topicId) topicId = this._data.currentTopic;
    this._data.activeIds[topicId] = chatId;
    this.save();
    this._emitChange('chat:active_changed', { topic: topicId, chatId });
  }

  createChat(topicId: TopicId, title?: string, options: Partial<IChat> & { id?: UUID } = {}): IChat {
    if (!topicId) topicId = this._data.currentTopic;

    const sectionName = (window as any).topicNames?.[topicId] || topicId;
    const chatTitle = title || `Новый чат в ${sectionName}`;

    const newChat: IChat = {
      id: options.id || this.generateUUID(),
      title: chatTitle,
      maxContext: options.maxContext || 15,
      language: options.language || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru',
      topic: topicId,
      userRenamed: options.userRenamed || false,
      synced: options.synced || false,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: options.messages || []
    };

    if (!this._data.histories[topicId]) {
      this._data.histories[topicId] = [];
    }

    this._data.histories[topicId].unshift(newChat);
    this._data.activeIds[topicId] = newChat.id;
    this.save();

    console.log(`📝 Создан чат ${newChat.id} в теме ${topicId}`);
    this._emitChange('chat:created', { chat: newChat, topic: topicId });
    return newChat;
  }

  createTempChat(topicId?: TopicId): IChat | null {
    if (!topicId) topicId = this._data.currentTopic;

    const existing = this._data.histories[topicId]?.find(c =>
      !c.deleted_at && (!c.messages || c.messages.length === 0)
    );

    if (existing) {
      this._data.activeIds[topicId] = existing.id;
      this.save();
      return existing;
    }

    const newChat = this.createChat(topicId, undefined, {
      messages: []
    });
    this.save();
    return newChat;
  }

  renameChat(chatId: UUID, newTitle: string): boolean {
    const found = this.findChatById(chatId);
    if (!found) {
      console.error(`❌ Чат ${chatId} не найден для переименования`);
      return false;
    }

    const { chat, topic } = found;
    const oldTitle = chat.title;
    chat.title = newTitle.trim();
    chat.userRenamed = true;
    chat.updated_at = new Date().toISOString();
    this.save();

    console.log(`✅ Чат ${chatId} переименован в "${newTitle}"`);
    this._emitChange('chat:renamed', { 
      chatId, 
      oldTitle, 
      newTitle: chat.title,
      topic 
    });
    return true;
  }

  deleteChat(chatId: UUID): boolean {
    const found = this.findChatById(chatId);
    if (!found) {
      console.error(`❌ Чат ${chatId} не найден для удаления`);
      return false;
    }

    const { chat, topic } = found;

    if (chat.deleted_at) {
      console.warn(`⚠️ Чат ${chatId} уже в корзине`);
      return false;
    }

    chat.deleted_at = new Date().toISOString();
    chat.updated_at = new Date().toISOString();

    if (chat.messages && Array.isArray(chat.messages)) {
      chat.messages = chat.messages.map(m => ({
        ...m,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
    }

    if (this._data.activeIds[topic] === chatId) {
      const remaining = this._data.histories[topic].filter(c => c.id !== chatId && !c.deleted_at);
      this._data.activeIds[topic] = remaining[0]?.id || null;
    }

    this.save();
    console.log(`🗑️ Чат ${chatId} отправлен в корзину (${chat.messages?.length || 0} сообщений)`);
    this._emitChange('chat:deleted', { chatId, topic, chatTitle: chat.title });
    return true;
  }

  restoreChat(chatId: UUID): boolean {
    const found = this.findChatById(chatId);
    if (!found) {
      console.error(`❌ Чат ${chatId} не найден для восстановления`);
      return false;
    }

    const { chat, topic } = found;

    if (!chat.deleted_at) {
      console.warn(`⚠️ Чат ${chatId} не в корзине`);
      return false;
    }

    chat.deleted_at = null;
    chat.updated_at = new Date().toISOString();

    if (chat.messages && Array.isArray(chat.messages)) {
      chat.messages = chat.messages.map(m => ({
        ...m,
        deleted_at: null,
        updated_at: new Date().toISOString()
      }));
    }

    this._data.activeIds[topic] = chatId;
    this.save();
    console.log(`♻️ Чат ${chatId} восстановлен из корзины (${chat.messages?.length || 0} сообщений)`);
    this._emitChange('chat:restored', { chatId, topic });
    return true;
  }

  permanentDeleteChat(chatId: UUID): boolean {
    const found = this.findChatById(chatId);
    if (!found) {
      console.warn(`⚠️ Чат ${chatId} не найден для безвозвратного удаления`);
      return false;
    }

    const { chat, topic } = found;

    if (!chat.deleted_at) {
      console.warn(`⚠️ Чат ${chatId} не в корзине, удаление невозможно`);
      return false;
    }

    const chatTitle = chat.title;
    this._data.histories[topic] = this._data.histories[topic].filter(c => c.id !== chatId);

    if (this._data.activeIds[topic] === chatId) {
      const remaining = this._data.histories[topic] || [];
      this._data.activeIds[topic] = remaining[0]?.id || null;
    }

    this.save();
    console.log(`🗑️ Чат ${chatId} удален навсегда (HARD DELETE)`);
    this._emitChange('chat:permanent_deleted', { chatId, topic, chatTitle });
    return true;
  }

  // ==========================================
  // РАБОТА С СООБЩЕНИЯМИ
  // ==========================================

  deleteMessage(chatId: UUID, messageId: UUID): boolean {
    const found = this.findChatById(chatId);
    if (!found) {
      console.error(`❌ Чат ${chatId} не найден`);
      return false;
    }

    const { chat } = found;
    const msgIndex = chat.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) {
      console.error(`❌ Сообщение ${messageId} не найдено`);
      return false;
    }

    const deletedMsg = chat.messages[msgIndex];
    chat.messages.splice(msgIndex, 1);
    chat.updated_at = new Date().toISOString();

    this.save();
    console.log(`🗑️ Сообщение ${messageId} удалено навсегда (HARD DELETE)`);
    this._emitChange('chat:message_deleted', { 
      chatId, 
      messageId,
      messageText: deletedMsg?.text?.substring(0, 50) || ''
    });
    return true;
  }

  toggleFavorite(chatId: UUID, messageId: UUID): IMessage | null {
    const found = this.findChatById(chatId);
    if (!found) return null;

    const { chat } = found;
    const msg = chat.messages.find(m => m.id === messageId);
    if (!msg) return null;

    msg.isFavorite = !msg.isFavorite;
    chat.updated_at = new Date().toISOString();

    this.save();
    this._emitChange('chat:favorite_toggled', { 
      chatId, 
      messageId, 
      isFavorite: msg.isFavorite,
      messageText: msg.text?.substring(0, 50) || ''
    });
    return msg;
  }

  // ==========================================
  // ✅ ИСПРАВЛЕНО: getFavorites() с правильным типом
  // ==========================================

  getFavorites(): IFavoriteItem[] {
    const favorites: IFavoriteItem[] = [];

    const entries = Object.entries(this._data.histories || {}) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
      if (!chats) continue;

      for (const chat of chats) {
        if (!chat.messages) continue;
        if (chat.deleted_at) continue;

        for (const msg of chat.messages) {
          if (msg.isFavorite && !msg.deleted_at) {
            // ✅ Убеждаемся, что тип правильный
            const msgType = msg.type || 'user-msg';
            favorites.push({
              ...msg,
              type: msgType as MessageType,
              chat_id: chat.id,
              chat_title: chat.title,
              topic: topic
            });
          }
        }
      }
    }

    return favorites;
  }

  getMessages(chatId: UUID): IMessage[] {
    const found = this.findChatById(chatId);
    if (!found) return [];

    const { chat } = found;
    return (chat.messages || []).filter(m => !m.deleted_at);
  }

  getContextMessages(chatId: UUID, maxContext: number = 15): IMessage[] {
    const messages = this.getMessages(chatId);
    return messages.slice(-maxContext);
  }

  // ==========================================
  // ✅ ИСПРАВЛЕНО: addMessage с правильным типом
  // ==========================================

  addMessage(
    chatId: UUID,
    text: string,
    type: MessageType,
    options: Partial<IMessage> & { id?: UUID } = {}
  ): IMessage | null {
    const found = this.findChatById(chatId);
    if (!found) return null;

    const { chat } = found;

    // ✅ Убеждаемся, что тип правильный
    const msgType = type || 'user-msg';

    const newMsg: IMessage = {
      id: options.id || this.generateUUID(),
      text: text,
      type: msgType as MessageType,
      isFavorite: options.isFavorite || false,
      deleted_at: null,
      created_at: options.created_at || new Date().toISOString()
    };

    chat.messages.push(newMsg);
    chat.updated_at = new Date().toISOString();

    if (type === 'user-msg' && !chat.userRenamed) {
      const sectionName = (window as any).topicNames?.[chat.topic] || chat.topic;
      const startTitle = `Новый чат в ${sectionName}`;
      if (chat.title === startTitle || chat.title.includes('Новый чат')) {
        const newTitle = text.substring(0, 30) + (text.length > 30 ? '...' : '');
        chat.title = newTitle;
        chat.userRenamed = true;
      }
    }

    this.save();
    this._emitChange('chat:message_added', { 
      chatId, 
      message: newMsg,
      chatTitle: chat.title,
      topic: chat.topic
    });
    return newMsg;
  }

  // ==========================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================

  // ✅ ИСПРАВЛЕНО: hasRealMessages с правильной проверкой
  hasRealMessages(chat: IChat): boolean {
    if (!chat || !chat.messages) return false;
    return chat.messages.some(m =>
      (m.type === 'user-msg' || m.type === 'ai-msg') &&
      !m.deleted_at &&
      m.text && m.text.trim().length > 0
    );
  }

  getTrash(): ITrash {
    const trash: ITrash = { chats: [], messages: [] };

    const entries = Object.entries(this._data.histories || {}) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
      if (!chats || !Array.isArray(chats)) continue;

      for (const chat of chats) {
        if (chat.deleted_at) {
          trash.chats.push({
            ...chat,
            topic: topic
          });
        }
      }
    }

    return trash;
  }

  clearTrash(): number {
    let cleared = 0;

    const entries = Object.entries(this._data.histories || {}) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
      if (!chats || !Array.isArray(chats)) continue;

      const filtered = chats.filter(chat => {
        if (chat.deleted_at) {
          cleared++;
          return false;
        }
        return true;
      });

      this._data.histories[topic] = filtered;
    }

    this.save();
    console.log(`🗑️ Корзина очищена (${cleared} чатов)`);
    this._emitChange('chat:trash_cleared', { count: cleared });
    return cleared;
  }

  updateChat(chatId: UUID, data: Partial<IChat>): IChat | null {
    const found = this.findChatById(chatId);
    if (!found) return null;

    const { chat } = found;

    if (data.title !== undefined) chat.title = data.title;
    if (data.maxContext !== undefined) chat.maxContext = data.maxContext;
    if (data.userRenamed !== undefined) chat.userRenamed = data.userRenamed;
    if (data.messages !== undefined) chat.messages = data.messages;
    if (data.synced !== undefined) chat.synced = data.synced;

    chat.updated_at = new Date().toISOString();
    this.save();
    this._emitChange('chat:updated', { chatId, data });
    return chat;
  }

  // ==========================================
  // ПРОГРЕСС ЗАГРУЗКИ
  // ==========================================

  isUploadInProgress(): boolean {
    return localStorage.getItem('upload_in_progress') === 'true';
  }

  getUploadProgress(): { total: number; current: number; startedAt: number } {
    return {
      total: parseInt(localStorage.getItem('upload_chats_count') || '0'),
      current: parseInt(localStorage.getItem('upload_current_index') || '0'),
      startedAt: parseInt(localStorage.getItem('upload_started_at') || '0')
    };
  }

  setUploadProgress(current: number, total: number): void {
    localStorage.setItem('upload_in_progress', 'true');
    localStorage.setItem('upload_chats_count', String(total));
    localStorage.setItem('upload_current_index', String(current));
    localStorage.setItem('upload_started_at', String(Date.now()));
  }

  clearUploadFlags(): void {
    localStorage.removeItem('upload_in_progress');
    localStorage.removeItem('upload_started_at');
    localStorage.removeItem('upload_chats_count');
    localStorage.removeItem('upload_current_index');
  }

  updateMetadata(metadataChats: any[]): void {
    if (!metadataChats || !Array.isArray(metadataChats)) return;
    
    for (const meta of metadataChats) {
      const found = this.findChatById(meta.id);
      if (found) {
        const { chat } = found;
        chat.title = meta.title || chat.title;
        chat.maxContext = meta.max_context || chat.maxContext;
        chat.userRenamed = meta.user_renamed || chat.userRenamed;
        chat.updated_at = meta.updated_at || chat.updated_at;
        chat.deleted_at = meta.deleted_at || chat.deleted_at;
      }
    }
    this.save();
  }
}

// Создаем экземпляр
export const chatStore = new ChatStore();
console.log('✅ ChatStore v5.0.3 загружен (исправлен msg_type -> type)');
