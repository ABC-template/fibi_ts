// ============================================
// src/services/sync.ts
// Realtime синхронизация для PRO (с JWT)
// Версия: 4.2.0 - тип события берётся из payload.eventType (supabase-js v2; поле event
//                 не существует, из-за чего обработчики не срабатывали);
//                 agent_id/modality чатов; сообщения — через chatStore.upsertMessage
//                 (UI обновляет только открытый чат); сообщение в неизвестный
//                 чат подтягивает чат с сервера
//          4.1.0 - metadata сообщений в Realtime (INSERT/UPDATE), patcher.updateMessage
//          4.0.1 - замена @types → @app-types
// ============================================

import { BaseStore } from '@/store/BaseStore';
import { chatStore } from '@/store/ChatStore';
import { eventBus } from '@/core/event-bus';
import { chatService } from './chats';
import type { IMessage, MessageType, TopicId, UUID } from '@app-types';

export class SyncService {
  private channel: any = null;
  private supabase: any = null;
  private isSubscribed: boolean = false;
  private userId: number | null = null;
  private _reconnectAttempts: number = 0;
  private _maxReconnectAttempts: number = 10;
  private _configLoaded: boolean = false;
  private _config: { supabaseUrl: string; supabaseAnonKey: string } | null = null;
  private _jwtToken: string | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _isConnecting: boolean = false;
  private _showTimeout: ReturnType<typeof setTimeout> | null = null;
  private _wasSubscribedBeforeHide: boolean = false;

  private isTabVisible: boolean = true;

  constructor() {
    this.initVisibilityListener();
  }

  // ==========================================
  // ВИДИМОСТЬ ВКЛАДКИ
  // ==========================================

  private initVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    this.isTabVisible = !document.hidden;

    document.addEventListener('visibilitychange', () => {
      const isVisible = !document.hidden;
      
      if (isVisible && !this.isTabVisible) {
        this.handleTabShow();
      } else if (!isVisible && this.isTabVisible) {
        this.handleTabHide();
      }
      
      this.isTabVisible = isVisible;
    });

    window.addEventListener('blur', () => {
      if (this.isTabVisible) {
        this.isTabVisible = false;
        this.handleTabHide();
      }
    });

    window.addEventListener('focus', () => {
      if (!this.isTabVisible) {
        this.isTabVisible = true;
        this.handleTabShow();
      }
    });

    console.log('📡 [SyncService] Слушатель видимости вкладки инициализирован');
  }

  private handleTabHide(): void {
    console.log('📡 [handleTabHide] Вкладка ушла в фон');
    
    this._wasSubscribedBeforeHide = this.isSubscribed;

    if (this.isSubscribed) {
      this.unsubscribe();
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._reconnectAttempts = 0;
    
    if (this._showTimeout) {
      clearTimeout(this._showTimeout);
      this._showTimeout = null;
    }

    console.log('📡 [handleTabHide] Realtime приостановлен (вкладка в фоне)');
  }

  private handleTabShow(): void {
    console.log('📡 [handleTabShow] Вкладка стала активной');

    if (this._showTimeout) {
      clearTimeout(this._showTimeout);
      this._showTimeout = null;
    }

    if (!this.userId) {
      console.log('📡 [handleTabShow] Нет userId, подключение не требуется');
      return;
    }

    if (!navigator.onLine) {
      console.log('📡 [handleTabShow] Нет интернета, подключение отложено');
      return;
    }

    const role = localStorage.getItem('user_role');
    if (role !== 'pro' && role !== 'premium' && role !== 'admin' && role !== 'creator') {
      console.log(`📡 [handleTabShow] Realtime только для PRO, текущая роль: ${role}`);
      return;
    }

    if (this.isSubscribed) {
      console.log('📡 [handleTabShow] Уже подписан');
      return;
    }

    this._showTimeout = setTimeout(() => {
      console.log('📡 [handleTabShow] Выполняем подключение...');
      this._showTimeout = null;
      
      if (!this.isTabVisible) {
        console.log('📡 [handleTabShow] Вкладка снова скрыта, отмена подключения');
        return;
      }
      
      if (!navigator.onLine) {
        console.log('📡 [handleTabShow] Интернет пропал, отмена подключения');
        return;
      }

      this.subscribe(this.userId!);
    }, 500);
  }

  // ==========================================
  // ЗАГРУЗКА КОНФИГУРАЦИИ
  // ==========================================

  private async loadConfig(): Promise<boolean> {
    if (this._configLoaded && this._config) {
      return true;
    }

    try {
      console.log('🔍 [loadConfig] Загружаем конфигурацию...');
      const response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data.supabaseUrl || !data.supabaseAnonKey) {
        throw new Error('Неполная конфигурация');
      }
      this._config = data;
      this._configLoaded = true;
      console.log('✅ [loadConfig] Конфигурация загружена');
      return true;
    } catch (err) {
      console.error('❌ [loadConfig] Ошибка:', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  private getJWT(): string | null {
    const tempStore = new BaseStore('temp');
    return tempStore.getJWT();
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ SUPABASE
  // ==========================================

  private async initSupabase(): Promise<any> {
    console.log('🔍 [initSupabase] Начинаем инициализацию...');
    
    if (this.supabase) {
      console.log('✅ [initSupabase] Supabase уже инициализирован');
      return this.supabase;
    }

    if (!this._configLoaded) {
      const loaded = await this.loadConfig();
      if (!loaded) return null;
    }

    if (typeof (window as any).supabase === 'undefined' || 
        typeof (window as any).supabase.createClient !== 'function') {
      console.error('❌ [initSupabase] window.supabase не найден!');
      return null;
    }

    const jwtToken = this.getJWT();
    if (!jwtToken) {
      console.warn('⚠️ [initSupabase] Нет JWT токена');
      return null;
    }

    this._jwtToken = jwtToken;

    try {
      this.supabase = (window as any).supabase.createClient(
        this._config!.supabaseUrl,
        this._config!.supabaseAnonKey,
        {
          global: {
            headers: {
              'Authorization': `Bearer ${jwtToken}`
            }
          },
          realtime: {
            params: {
              eventsPerSecond: 5,
              heartbeatIntervalMs: 15000
            }
          }
        }
      );
      
      console.log('✅ [initSupabase] Supabase клиент создан');
      return this.supabase;
    } catch (err) {
      console.error('❌ [initSupabase] Ошибка:', err);
      return null;
    }
  }

  // ==========================================
  // ПОДПИСКА
  // ==========================================

  async subscribe(userId: number): Promise<void> {
    console.log('📡 [subscribe] Вызван с userId:', userId);
    
    if (!this.isTabVisible) {
      console.log('⚠️ [subscribe] Вкладка скрыта, подключение отложено');
      return;
    }

    if (this._isConnecting) {
      console.log('⚠️ [subscribe] Уже выполняется подключение');
      return;
    }

    if (!userId) {
      console.warn('⚠️ [subscribe] Нет userId');
      return;
    }

    if (this.isSubscribed) {
      console.log('⚠️ [subscribe] Уже подписан');
      return;
    }

    if (!navigator.onLine) {
      console.warn('⚠️ [subscribe] Нет интернета');
      return;
    }

    const role = localStorage.getItem('user_role');
    if (role !== 'pro' && role !== 'premium' && role !== 'admin' && role !== 'creator') {
      console.warn(`⚠️ [subscribe] Realtime только для PRO, текущая роль: ${role}`);
      return;
    }

    this.userId = userId;
    this._isConnecting = true;

    try {
      const supabase = await this.initSupabase();
      if (!supabase) {
        console.warn('⚠️ [subscribe] Supabase не инициализирован');
        this._isConnecting = false;
        return;
      }

      if (this.channel) {
        console.log('📡 [subscribe] Закрываем старый канал...');
        try {
          await supabase.removeChannel(this.channel);
        } catch (err) {
          console.warn('⚠️ [subscribe] Ошибка закрытия канала:', err);
        }
        this.channel = null;
      }

      this.channel = supabase
        .channel(`user_${userId}_chats`, {
          config: {
            broadcast: { ack: true },
            presence: { key: userId.toString() }
          }
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chats'
          },
          (payload: any) => {
            console.log('📨 Realtime: чаты', payload);
            this.handleChatChange(payload);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages'
          },
          (payload: any) => {
            console.log('📨 Realtime: сообщения', payload);
            this.handleMessageChange(payload);
          }
        );

      this.channel.subscribe((status: string, err: any) => {
        console.log(`📡 Realtime статус: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true;
          this._reconnectAttempts = 0;
          this._isConnecting = false;
          console.log('✅ Подписка на Realtime активна! 🎉');
          if ((window as any).chatUI) (window as any).chatUI.refreshUI();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.isSubscribed = false;
          this._isConnecting = false;
          console.warn(`⚠️ Проблема с Realtime: ${status}`, err);
          
          if (status !== 'CLOSED' || err) {
            this.scheduleReconnect();
          }
        }
      });

      (window as any)._realtimeChannel = this.channel;
      console.log('✅ [subscribe] Канал создан');

    } catch (err) {
      console.error('❌ Ошибка подписки:', err);
      this._isConnecting = false;
      this.scheduleReconnect();
    }
  }

  // ==========================================
  // ПЕРЕПОДКЛЮЧЕНИЕ
  // ==========================================

  private scheduleReconnect(): void {
    if (!this.isTabVisible) {
      console.log('📡 [scheduleReconnect] Вкладка скрыта, переподключение отложено');
      return;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    if (this.isSubscribed) {
      console.log('✅ [scheduleReconnect] Уже подписан, переподключение не требуется');
      return;
    }

    if (this._reconnectAttempts > this._maxReconnectAttempts) {
      console.log('⚠️ [scheduleReconnect] Превышено максимальное количество попыток');
      return;
    }

    this._reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);
    
    console.log(`🔄 Переподключение через ${delay}ms (попытка ${this._reconnectAttempts})`);
    
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      
      if (!this.isTabVisible) {
        console.log('📡 [scheduleReconnect] Вкладка скрыта, переподключение отменено');
        return;
      }
      
      if (navigator.onLine && this.userId) {
        this.isSubscribed = false;
        this.subscribe(this.userId);
      } else {
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ==========================================
  // ОТПИСКА
  // ==========================================

  unsubscribe(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._isConnecting = false;

    if (!this.isSubscribed) {
      console.log('⚠️ [unsubscribe] Не был подписан');
      return;
    }

    try {
      if (this.supabase && this.channel) {
        this.supabase.removeChannel(this.channel);
        this.channel = null;
        this.isSubscribed = false;
        console.log('📡 Отписка выполнена');
      }
    } catch (err) {
      console.error('❌ Ошибка отписки:', err);
    }
  }

  reconnect(): void {
    console.log('🔄 Принудительная переподписка...');
    this.unsubscribe();
    this.supabase = null;
    this._configLoaded = false;
    this._reconnectAttempts = 0;
    this._isConnecting = false;
    if (this.userId) {
      setTimeout(() => {
        this.subscribe(this.userId!);
      }, 500);
    }
  }

  isActive(): boolean {
    return this.isSubscribed;
  }

  // ==========================================
  // ОБРАБОТЧИКИ СОБЫТИЙ
  // ==========================================

  /** supabase-js v2 кладёт тип события в eventType */
  private _eventOf(payload: any): string {
    return payload?.eventType || payload?.event || '';
  }

  private _refreshLists(): void {
    if ((window as any).chatUI) (window as any).chatUI.refreshUI();
    if ((window as any).profileUI) (window as any).profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
    if ((window as any).updateTrashCount) (window as any).updateTrashCount();
    if ((window as any).renderChatsInDrawer) (window as any).renderChatsInDrawer();
  }

  private handleChatChange(payload: any): void {
    const event = this._eventOf(payload);
    const newData = payload?.new;
    const oldData = payload?.old;

    try {
      if (event === 'INSERT') {
        if (newData && !newData.deleted_at) {
          const found = chatStore.findChatById(newData.id);
          if (!found) {
            const activeBefore = chatStore.activeIds[(newData.topic_id || 'fast') as TopicId] ?? null;
            const created = chatStore.createChat(
              (newData.topic_id || 'fast') as TopicId,
              newData.title,
              {
                id: newData.id,
                maxContext: newData.max_context || 15,
                userRenamed: newData.user_renamed || false,
                pinned: newData.pinned || false,
                agent_id: newData.agent_id || null,
                modality: newData.modality || null,
                synced: true,
                messages: []
              }
            );
            // createChat делает новый чат активным — с другого устройства это не нужно
            chatStore.setActiveChat(created.topic, activeBefore);
            console.log(`📝 Добавлен новый чат ${newData.id} (Realtime)`);
          } else {
            found.chat.synced = true;
            if (newData.pinned !== undefined) found.chat.pinned = newData.pinned;
            if (newData.agent_id !== undefined) found.chat.agent_id = newData.agent_id || null;
            if (newData.modality !== undefined) found.chat.modality = newData.modality || null;
            chatStore.save();
          }
        }
      } else if (event === 'UPDATE') {
        const found = chatStore.findChatById(newData?.id);
        if (found) {
          const { chat } = found;
          if (newData.title !== undefined) chat.title = newData.title;
          if (newData.max_context !== undefined) chat.maxContext = newData.max_context || 15;
          if (newData.user_renamed !== undefined) chat.userRenamed = !!newData.user_renamed;
          if (newData.pinned !== undefined) chat.pinned = !!newData.pinned;
          if (newData.agent_id !== undefined) chat.agent_id = newData.agent_id || null;
          if (newData.modality !== undefined) chat.modality = newData.modality || null;
          if (newData.updated_at) chat.updated_at = newData.updated_at;
          if (newData.deleted_at !== undefined) chat.deleted_at = newData.deleted_at || null;
          chatStore.save();
          console.log(`📝 Обновлен чат ${newData.id} (Realtime)`);
        }
      } else if (event === 'DELETE') {
        if (oldData?.id && chatStore.findChatById(oldData.id)) {
          chatStore.permanentDeleteChat(oldData.id);
          console.log(`🗑️ Чат ${oldData.id} удален (Realtime)`);
        }
      }

      this._refreshLists();
    } catch (err) {
      console.error('❌ Ошибка обработки чата:', err);
    }
  }

  private handleMessageChange(payload: any): void {
    const event = this._eventOf(payload);
    const newData = payload?.new;
    const oldData = payload?.old;

    try {
      if (event === 'INSERT' || event === 'UPDATE') {
        if (!newData?.id || !newData.chat_id) return;
        const chatId = newData.chat_id as UUID;
        const found = chatStore.findChatById(chatId);

        if (!found) {
          // Чат ещё не пришёл (или был удалён локально как пустой) — берём с сервера
          if (!newData.deleted_at) {
            chatService.getChat(chatId).then(() => this._refreshLists()).catch(() => {});
          }
          return;
        }

        const existing = found.chat.messages.find((m: IMessage) => m.id === newData.id);

        if (newData.deleted_at) {
          // На сервере сообщение удалено — локально сообщения удаляются полностью
          if (existing) chatStore.deleteMessage(chatId, newData.id);
          return;
        }

        const favoriteChanged =
          !!existing && newData.is_favorite !== undefined && !!existing.isFavorite !== !!newData.is_favorite;

        chatStore.upsertMessage(chatId, {
          id: newData.id,
          text: newData.text ?? existing?.text ?? '',
          type: (newData.msg_type || existing?.type || 'ai-msg') as MessageType,
          isFavorite: newData.is_favorite !== undefined ? !!newData.is_favorite : undefined,
          created_at: newData.created_at,
          deleted_at: null,
          metadata: newData.metadata !== undefined ? newData.metadata : existing?.metadata
        });

        if (favoriteChanged) {
          eventBus.emit('chat:favorite_toggled', {
            chatId,
            messageId: newData.id,
            isFavorite: !!newData.is_favorite
          });
        }
        console.log(`📝 Сообщение ${newData.id} (${event}, Realtime)`);
      } else if (event === 'DELETE') {
        if (!oldData?.id) return;
        const found = chatStore.findChatByMessageId(oldData.id);
        if (found) {
          chatStore.deleteMessage(found.chat.id, oldData.id);
          console.log(`🗑️ Сообщение ${oldData.id} удалено (Realtime)`);
        }
      }

      if ((window as any).chatUI) (window as any).chatUI.refreshUI();
    } catch (err) {
      console.error('❌ Ошибка обработки сообщения:', err);
    }
  }
}

export const syncService = new SyncService();
console.log('✅ SyncService v4.2.0 загружен');
