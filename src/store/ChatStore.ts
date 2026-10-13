// ============================================
// src/store/ChatStore.ts
// Управление чатами и сообщениями
// Версия: 7.1.0 — удалены флаги выгрузки upload_* (записывались, но нигде не читались)
//          7.0.0 — история чатов хранится в IndexedDB (база fibi-chats) вместо localStorage
//                  (~5 МБ на всё приложение): init() читает базу и один раз переносит
//                  старые данные из localStorage; запись отложенная и последовательная,
//                  сброс при сворачивании/закрытии; при нехватке места — предупреждение;
//                  если IndexedDB недоступна — работает на localStorage, как раньше
//          6.4.0 — полная загрузка из облака: серверные поля (topic_id, max_context,
//                  user_renamed), agent_id/modality, metadata сообщений; локальные
//                  несинхронизированные чаты и активный чат сохраняются;
//                  «удержание» чата (holdChat) — не удаляется как пустой, пока идёт запрос
//          6.3.0 — удаление чата запрещено, пока в нём идёт генерация
//          6.2.0 — metadata сообщений (генерации), upsertMessage
//          6.1.0 — добавлены agent_id и modality
// ============================================

import { BaseStore, isQuotaError, warnStorageFull } from './BaseStore';
import { chatHasLiveGeneration } from './generation-live';
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
} from '@app-types';

const DEFAULT_TOPICS: TopicId[] = ['code', 'creative', 'fast', 'kitchen', 'analytics'];
const MAX_PINNED_CHATS = 10;

const DB_NAME = 'fibi-chats';
const DB_VERSION = 1;
const DB_STORE = 'histories';
const SAVE_DELAY_MS = 250;

function openChatsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступна'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB заблокирована'));
  });
}

function idbRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = run(tx.objectStore(DB_STORE));
    let result: T;
    req.onsuccess = () => { result = req.result as T; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || req.error || new Error('Транзакция прервана'));
  });
}

function parseStored(raw: unknown): IChatStoreData | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    console.warn('⚠️ [ChatStore] Сохранённые данные повреждены:', e);
    return null;
  }
}

export class ChatStore extends BaseStore<IChatStoreData> {
  /**
   * Чаты, которые нельзя удалять как «пустые», пока по ним идёт запрос
   * (генерация: сообщения создаёт сервер и они появляются только в конце).
   * Хранится в памяти: после перезапуска запрос всё равно уже не наш.
   */
  private _held: Set<string> = new Set();

  /** База IndexedDB; null — работаем на localStorage (IndexedDB недоступна) */
  private _db: IDBDatabase | null = null;
  private _ready = false;
  private _dirty = false;
  /** После очистки кэша запись запрещена до перезагрузки страницы */
  private _disposed = false;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _writeChain: Promise<void> = Promise.resolve();

  constructor() {
    super('chat');
    this._applyDefaults();
  }

  // ==========================================
  // ХРАНЕНИЕ (IndexedDB)
  // ==========================================

  /**
   * Загрузка истории. Вызывается один раз в начале initApp, до любой работы с чатами.
   * Старые данные из localStorage переносятся в IndexedDB и удаляются оттуда
   * только после успешной записи.
   */
  async init(): Promise<void> {
    if (this._ready) return;
    const key = this.getStorageKey();

    let legacyRaw: string | null = null;
    try {
      legacyRaw = localStorage.getItem(key);
    } catch (e) {
      console.warn('⚠️ [ChatStore] localStorage недоступен:', e);
    }

    let data: IChatStoreData | null = null;
    let migrate = false;

    try {
      this._db = await openChatsDb();
      data = parseStored(await idbRequest<unknown>(this._db, 'readonly', (st) => st.get(key)));
      if (!data && legacyRaw) {
        data = parseStored(legacyRaw);
        migrate = !!data;
      }
    } catch (e) {
      console.warn('⚠️ [ChatStore] IndexedDB недоступна, история остаётся в localStorage:', e);
      this._db = null;
      data = parseStored(legacyRaw);
    }

    this._data = (data || {}) as IChatStoreData;
    this._applyDefaults();
    this._loaded = true;
    this._ready = true;

    if (this._db) {
      if (migrate) {
        this._dirty = true;
        await this.flush();
        if (!this._dirty) {
          try { localStorage.removeItem(key); } catch { /* не критично */ }
          console.log('📦 [ChatStore] История перенесена из localStorage в IndexedDB');
        }
      } else if (legacyRaw) {
        // Устаревшая копия: в IndexedDB уже есть данные
        try { localStorage.removeItem(key); } catch { /* не критично */ }
      }

      const flushNow = (): void => { void this.flush(); };
      window.addEventListener('pagehide', flushNow);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushNow();
      });

      // Просим браузер не вытеснять базу при нехватке места
      try {
        navigator.storage?.persist?.().catch(() => {});
      } catch { /* не поддерживается */ }
    }

    console.log(`💾 [ChatStore] Загружено (${this._db ? 'IndexedDB' : 'localStorage'})`);
  }

  /** Данные живут в памяти; читать их можно только после init() */
  load(): IChatStoreData {
    return this._data;
  }

  save(): void {
    if (this._disposed) return;
    if (!this._ready) {
      console.warn('⚠️ [ChatStore] save() до init() — пропущено');
      return;
    }
    if (!this._db) {
      super.save();
      return;
    }

    this._dirty = true;
    this._emitChange('data:saved', { store: this.storeName });
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      void this.flush();
    }, SAVE_DELAY_MS);
  }

  /** Записать несохранённые изменения сейчас (по очереди с предыдущими записями) */
  flush(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._writeChain = this._writeChain.then(() => this._write());
    return this._writeChain;
  }

  private async _write(): Promise<void> {
    if (!this._db || !this._dirty || this._disposed) return;
    this._dirty = false;
    const key = this.getStorageKey();
    try {
      const raw = JSON.stringify(this._data);
      await idbRequest(this._db, 'readwrite', (st) => st.put(raw, key));
    } catch (e) {
      // Не потерять изменения: следующая запись попробует снова
      this._dirty = true;
      console.error('❌ [ChatStore] Ошибка сохранения в IndexedDB:', e);
      if (isQuotaError(e)) warnStorageFull();
    }
  }

  /**
   * Очистка кэша: удалить сохранённую историю (IndexedDB и localStorage).
   * После вызова изменения больше не сохраняются — следом нужна перезагрузка.
   */
  async clearPersisted(): Promise<void> {
    this._disposed = true;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    await this._writeChain.catch(() => {});

    const key = this.getStorageKey();
    if (this._db) {
      try {
        await idbRequest(this._db, 'readwrite', (st) => st.delete(key));
      } catch (e) {
        console.error('❌ [ChatStore] Не удалось очистить IndexedDB:', e);
      }
    }
    try { localStorage.removeItem(key); } catch { /* не критично */ }
    this._data = {} as IChatStoreData;
    this._applyDefaults();
    this._emitChange('store:cleared', { store: this.storeName });
  }

  private _applyDefaults(): void {
    if (!this._data || typeof this._data !== 'object') this._data = {} as IChatStoreData;
    if (!this._data.histories) this._data.histories = {} as Record<TopicId, IChat[]>;
    if (!this._data.activeIds) this._data.activeIds = {} as Record<TopicId, string | null>;
    if (!this._data.currentTopic) this._data.currentTopic = 'code';

    for (const topic of DEFAULT_TOPICS) {
      if (!this._data.activeIds[topic]) this._data.activeIds[topic] = null;
      if (!this._data.histories[topic]) this._data.histories[topic] = [];
    }
  }

  // ==========================================
  // ЧАТЫ
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

  getActiveChat(topicId?: TopicId): IChat | null {
    const targetTopic = topicId || this._data.currentTopic;
    const chats = this.getChats(targetTopic);
    const activeId = this._data.activeIds[targetTopic];
    
    if (activeId) {
      const found = chats.find(c => c.id === activeId && !c.deleted_at);
      if (found) return found;
    }
    
    return null;
  }

  hasRealMessages(chat: IChat): boolean {
    if (!chat || !chat.messages) return false;
    return chat.messages.some(m =>
      (m.type === 'user-msg' || m.type === 'ai-msg') &&
      !m.deleted_at &&
      ((m.text && m.text.trim().length > 0) || !!(m as any).metadata)
    );
  }

  /** Не удалять чат как пустой, пока по нему идёт запрос */
  holdChat(chatId: UUID): void {
    if (chatId) this._held.add(chatId);
  }

  releaseChat(chatId: UUID): void {
    if (chatId) this._held.delete(chatId);
  }

  isChatHeld(chatId: UUID): boolean {
    return !!chatId && this._held.has(chatId);
  }

  /** Чат можно удалить как пустой: нет сообщений, нет запроса, нет живой генерации */
  isDisposableEmpty(chat: IChat): boolean {
    if (!chat || chat.deleted_at) return false;
    if (this.hasRealMessages(chat)) return false;
    if (this._held.has(chat.id)) return false;
    if (chatHasLiveGeneration(chat)) return false;
    return true;
  }

  isEmpty(chat: IChat): boolean {
    return !this.hasRealMessages(chat);
  }

  getChats(topicId?: TopicId): IChat[] {
    if (!topicId) topicId = this._data.currentTopic;
    return this._data.histories[topicId] || [];
  }

  getAllChats(filter?: TopicId | 'all'): IChat[] {
    const allChats: IChat[] = [];
    
    const entries = Object.entries(this._data.histories || {}) as [TopicId, IChat[]][];
    for (const [topic, chats] of entries) {
      if (!chats) continue;
      for (const chat of chats) {
        if (chat.deleted_at) continue;
        if (filter && filter !== 'all' && chat.topic !== filter) continue;
        allChats.push(chat);
      }
    }

    return allChats.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }

  getPinnedChats(filter?: TopicId | 'all'): IChat[] {
    const all = this.getAllChats(filter);
    return all.filter(chat => chat.pinned === true);
  }

  getUnpinnedChats(filter?: TopicId | 'all'): IChat[] {
    const all = this.getAllChats(filter);
    return all.filter(chat => chat.pinned !== true);
  }

  canPinChat(): boolean {
    const pinnedCount = this.getAllChats().filter(c => c.pinned === true).length;
    return pinnedCount < MAX_PINNED_CHATS;
  }

  getPinnedCount(): number {
    return this.getAllChats().filter(c => c.pinned === true).length;
  }

  togglePinChat(chatId: UUID): { success: boolean; pinned: boolean; error?: string } {
    const found = this.findChatById(chatId);
    if (!found) {
      return { success: false, pinned: false, error: 'Chat not found' };
    }

    const { chat } = found;
    const newPinned = !chat.pinned;

    if (newPinned && !this.canPinChat()) {
      return { 
        success: false, 
        pinned: false, 
        error: `Maximum ${MAX_PINNED_CHATS} pinned chats allowed. Unpin another chat first.` 
      };
    }

    chat.pinned = newPinned;
    chat.updated_at = new Date().toISOString();
    this.save();

    this._emitChange('chat:pinned_toggled', { 
      chatId, 
      pinned: newPinned,
      chatTitle: chat.title,
      topic: chat.topic
    });

    return { success: true, pinned: newPinned };
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
      pinned: options.pinned || false,
      agent_id: options.agent_id || null,
      modality: options.modality || null,
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

    console.log(`📝 Создан чат ${newChat.id} в теме ${topicId}${newChat.pinned ? ' (закреплён)' : ''}${newChat.agent_id ? ' (агент: ' + newChat.agent_id + ')' : ''}`);
    this._emitChange('chat:created', { chat: newChat, topic: topicId });
    return newChat;
  }

  createTempChat(topicId?: TopicId, options: Partial<IChat> = {}): IChat | null {
    if (!topicId) topicId = this._data.currentTopic;

    console.log(`🧹 [createTempChat] Удаляем ВСЕ пустые чаты перед созданием нового в теме: ${topicId}`);

    this.cleanupAllEmptyChats();

    console.log(`📝 [createTempChat] Создаем новый чат в теме: ${topicId}`);
    const newChat = this.createChat(topicId, undefined, {
      messages: [],
      pinned: false,
      agent_id: options.agent_id || null,
      modality: options.modality || null,
    });
    
    newChat.topic = topicId;
    this._data.activeIds[topicId] = newChat.id;
    this.save();
    
    console.log(`✅ [createTempChat] Создан новый чат ${newChat.id} в теме ${topicId}${newChat.agent_id ? ' (агент: ' + newChat.agent_id + ')' : ''}`);
    return newChat;
  }

  cleanupAllEmptyChats(): number {
    let cleaned = 0;
    const allTopics = Object.keys(this._data.histories) as TopicId[];

    for (const topic of allTopics) {
      const chats = this._data.histories[topic] || [];
      const nonEmptyChats: IChat[] = [];

      for (const chat of chats) {
        if (this.isDisposableEmpty(chat)) {
          cleaned++;
          console.log(`🧹 [cleanupAllEmptyChats] Удаляем пустой чат ${chat.id} из темы ${topic}`);
        } else {
          nonEmptyChats.push(chat);
        }
      }

      if (nonEmptyChats.length !== chats.length) {
        this._data.histories[topic] = nonEmptyChats;
        
        if (this._data.activeIds[topic]) {
          const stillExists = nonEmptyChats.some(c => c.id === this._data.activeIds[topic]);
          if (!stillExists) {
            this._data.activeIds[topic] = null;
          }
        }
      }
    }

    if (cleaned > 0) {
      this.save();
      console.log(`✅ [cleanupAllEmptyChats] Всего удалено ${cleaned} пустых чатов`);
      this._emitChange('chat:empty_cleaned', { count: cleaned });
    }

    return cleaned;
  }

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

  /** В чате идёт генерация (удалять нельзя) */
  isChatBusy(chatId: UUID): boolean {
    return chatHasLiveGeneration(this.findChatById(chatId)?.chat);
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

    if (chatHasLiveGeneration(chat)) {
      console.warn(`⚠️ Чат ${chatId}: идёт генерация, удаление отклонено`);
      return false;
    }

    chat.pinned = false;
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
    console.log(`🗑️ Чат ${chatId} отправлен в корзину, закрепление снято (${chat.messages?.length || 0} сообщений)`);
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

    chat.pinned = false;
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
    console.log(`♻️ Чат ${chatId} восстановлен из корзины, закрепление сброшено (${chat.messages?.length || 0} сообщений)`);
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

  getRecentMessages(chatId: UUID, limit: number = 50): IMessage[] {
    const messages = this.getMessages(chatId);
    return messages.slice(-limit);
  }

  getContextMessages(chatId: UUID, maxContext: number = 15): IMessage[] {
    const messages = this.getMessages(chatId);
    return messages.slice(-maxContext);
  }

  addMessage(
    chatId: UUID,
    text: string,
    type: MessageType,
    options: Partial<IMessage> & { id?: UUID } = {}
  ): IMessage | null {
    const found = this.findChatById(chatId);
    if (!found) return null;

    const { chat } = found;
    const msgType = type || 'user-msg';

    const newMsg: IMessage = {
      id: options.id || this.generateUUID(),
      text: text,
      type: msgType as MessageType,
      isFavorite: options.isFavorite || false,
      deleted_at: null,
      created_at: options.created_at || new Date().toISOString(),
      metadata: options.metadata ?? null
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

  /**
   * Добавляет сообщение или обновляет существующее (по id): текст, metadata,
   * избранное, удаление. Используется там, где сообщение создал сервер
   * (генерации): ответ запроса и Realtime могут прийти в любом порядке.
   * Сообщает UI событиями chat:message_added / chat:message_updated.
   */
  upsertMessage(
    chatId: UUID,
    data: {
      id: UUID;
      text: string;
      type: MessageType;
      isFavorite?: boolean;
      created_at?: ISODateString;
      deleted_at?: ISODateString | null;
      metadata?: IMessage['metadata'];
    }
  ): IMessage | null {
    const found = this.findChatById(chatId);
    if (!found || !data?.id) return null;

    const { chat } = found;
    const existing = chat.messages.find((m: IMessage) => m.id === data.id);

    if (existing) {
      existing.text = data.text;
      existing.metadata = data.metadata ?? existing.metadata ?? null;
      if (data.isFavorite !== undefined) existing.isFavorite = data.isFavorite;
      if (data.deleted_at !== undefined) existing.deleted_at = data.deleted_at;
      this.save();
      this._emitChange('chat:message_updated', {
        chatId,
        messageId: existing.id,
        text: existing.text,
        message: existing
      });
      return existing;
    }

    const msg: IMessage = {
      id: data.id,
      text: data.text,
      type: data.type,
      isFavorite: data.isFavorite || false,
      deleted_at: data.deleted_at || null,
      created_at: data.created_at || new Date().toISOString(),
      metadata: data.metadata ?? null
    };

    chat.messages.push(msg);
    chat.messages.sort(
      (a: IMessage, b: IMessage) =>
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    chat.updated_at = new Date().toISOString();
    this.save();

    this._emitChange('chat:message_added', {
      chatId,
      message: msg,
      chatTitle: chat.title,
      topic: chat.topic
    });
    return msg;
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
    if (data.pinned !== undefined) chat.pinned = data.pinned;
    if (data.agent_id !== undefined) chat.agent_id = data.agent_id;
    if (data.modality !== undefined) chat.modality = data.modality;

    chat.updated_at = new Date().toISOString();
    this.save();
    this._emitChange('chat:updated', { chatId, data });
    return chat;
  }

  /**
   * Полная замена данных облачными (PRO, sync_token не совпал).
   * Сервер присылает поля в формате БД: topic_id, max_context, user_renamed,
   * msg_type, is_favorite. Локальные чаты, которых на сервере ещё нет
   * (synced = false, например созданные без сети), и чаты с идущим запросом
   * сохраняются — иначе полная загрузка стирала бы несохранённые данные.
   */
  updateAllChats(cloudChats: any[]): void {
    console.log(`📋 [updateAllChats] Полная замена данных: ${cloudChats?.length || 0} чатов...`);

    if (!cloudChats || !Array.isArray(cloudChats)) {
      console.warn('⚠️ [updateAllChats] Нет данных для обновления');
      return;
    }

    const hasContent = (chat: any): boolean =>
      (chat.messages || []).some(
        (m: any) => !m.deleted_at && ((m.text && m.text.trim().length > 0) || !!m.metadata)
      );

    const filteredChats = cloudChats.filter(chat => hasContent(chat) || chat.deleted_at);

    if (filteredChats.length !== cloudChats.length) {
      console.log(`🧹 [updateAllChats] Отфильтровано ${cloudChats.length - filteredChats.length} пустых чатов`);
    }

    // Что сохранить из локальных данных
    const previousActive = { ...this._data.activeIds };
    const cloudIds = new Set(filteredChats.map(c => c.id));
    const keepLocal: IChat[] = [];
    for (const chats of Object.values(this._data.histories || {}) as IChat[][]) {
      for (const chat of chats || []) {
        if (cloudIds.has(chat.id)) continue;
        const unsynced = !chat.synced && this.hasRealMessages(chat);
        const busy = this._held.has(chat.id) || chatHasLiveGeneration(chat);
        if (unsynced || busy) keepLocal.push(chat);
      }
    }

    const grouped: Record<TopicId, IChat[]> = {} as Record<TopicId, IChat[]>;
    let totalMessages = 0;

    for (const chat of filteredChats) {
      const chatTopic = (chat.topic_id || chat.topic || 'fast') as TopicId;
      if (!grouped[chatTopic]) {
        grouped[chatTopic] = [];
      }

      const localChat: IChat = {
        id: chat.id,
        title: chat.title || 'Без названия',
        maxContext: chat.max_context ?? chat.maxContext ?? 15,
        language: chat.language || 'ru',
        topic: chatTopic,
        userRenamed: chat.user_renamed ?? chat.userRenamed ?? false,
        synced: true,
        pinned: chat.pinned || false,
        agent_id: chat.agent_id || null,
        modality: chat.modality || null,
        deleted_at: chat.deleted_at || null,
        created_at: chat.created_at || new Date().toISOString(),
        updated_at: chat.updated_at || new Date().toISOString(),
        messages: (chat.messages || []).map((m: any) => {
          const msgType = m.msg_type || m.type || 'user-msg';
          return {
            id: m.id,
            text: m.text || '',
            type: msgType as MessageType,
            isFavorite: m.is_favorite ?? m.isFavorite ?? false,
            deleted_at: m.deleted_at || null,
            created_at: m.created_at || new Date().toISOString(),
            metadata: m.metadata || null
          };
        })
      };

      localChat.messages.sort((a, b) => {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });

      totalMessages += localChat.messages.length;
      grouped[chatTopic].push(localChat);
    }

    for (const chat of keepLocal) {
      const topic = (chat.topic || 'fast') as TopicId;
      if (!grouped[topic]) grouped[topic] = [];
      grouped[topic].unshift(chat);
      totalMessages += chat.messages?.length || 0;
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

    // Активный чат: прежний, если он ещё есть, иначе первый непустой
    const allTopics = Object.keys(this._data.histories) as TopicId[];
    for (const topicId of allTopics) {
      const chats = this._data.histories[topicId] || [];
      const prevId = previousActive[topicId];
      const prev = prevId ? chats.find(c => c.id === prevId && !c.deleted_at) : null;
      if (prev) {
        this._data.activeIds[topicId] = prev.id;
        continue;
      }
      const activeChat = chats.find(c => !c.deleted_at && c.messages && c.messages.length > 0);
      this._data.activeIds[topicId] = activeChat ? activeChat.id : null;
    }

    this.save();

    console.log(`✅ [updateAllChats] Заменено ${filteredChats.length} чатов (+${keepLocal.length} локальных), ${totalMessages} сообщений`);
    this._emitChange('chat:all_updated', {
      totalChats: filteredChats.length + keepLocal.length,
      totalMessages: totalMessages
    });
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
        if (meta.pinned !== undefined) chat.pinned = meta.pinned;
        if (meta.agent_id !== undefined) chat.agent_id = meta.agent_id;
        if (meta.modality !== undefined) chat.modality = meta.modality;
      }
    }
    this.save();
  }
}

export const chatStore = new ChatStore();
console.log('✅ ChatStore v7.1.0 загружен');
