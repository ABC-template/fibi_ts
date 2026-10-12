// ============================================
// src/services/sync.ts
// Realtime синхронизация для PRO
// Версия: 5.0.0 - свой токен Realtime (auth/check или /auth/realtime-token) передаётся
//                 в websocket через realtime.setAuth: раньше токен уходил только в
//                 REST-заголовки, канал подключался анонимно и RLS не пропускал события;
//                 токен обновляется заранее (таймер) и после ошибки канала
//          4.2.0 - тип события берётся из payload.eventType (supabase-js v2; поле event
//                 не существует, из-за чего обработчики не срабатывали);
//                 agent_id/modality чатов; сообщения — через chatStore.upsertMessage
//                 (UI обновляет только открытый чат); сообщение в неизвестный
//                 чат подтягивает чат с сервера
//          4.1.0 - metadata сообщений в Realtime (INSERT/UPDATE), patcher.updateMessage
//          4.0.1 - замена @types → @app-types
// ============================================

import { apiClient } from './api';
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
  /** Токен Realtime и время истечения (unix, сек) */
  private _token: string | null = null;
  private _tokenExp: number = 0;
  private _tokenPromise: Promise<string | null> | null = null;
  private _tokenTimer: ReturnType<typeof setTimeout> | null = null;
  /** Обновлять токен за столько секунд до истечения */
  private readonly TOKEN_REFRESH_MARGIN_SEC = 5 * 60;
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

  // ==========================================
  // ТОКЕН REALTIME
  // ==========================================

  /** Токен из ответа auth/check (null — синхронизация недоступна) */
  setRealtimeToken(realtime: { token: string; expiresAt: number } | null): void {
    if (!realtime?.token) {
      this._token = null;
      this._tokenExp = 0;
      this._clearTokenTimer();
      return;
    }
    this._applyToken(realtime.token, realtime.expiresAt);
  }

  private _tokenFresh(): boolean {
    return !!this._token && this._tokenExp - Date.now() / 1000 > this.TOKEN_REFRESH_MARGIN_SEC;
  }

  private _applyToken(token: string, expiresAt: number): void {
    this._token = token;
    this._tokenExp = Number(expiresAt) || 0;
    if (this.supabase) {
      try {
        this.supabase.realtime.setAuth(token);
      } catch (err) {
        console.warn('⚠️ [sync] setAuth:', err);
      }
    }
    this._scheduleTokenRefresh();
  }

  private _clearTokenTimer(): void {
    if (this._tokenTimer) {
      clearTimeout(this._tokenTimer);
      this._tokenTimer = null;
    }
  }

  /** Обновить токен заранее, пока подписка активна */
  private _scheduleTokenRefresh(): void {
    this._clearTokenTimer();
    if (!this._tokenExp) return;
    const delayMs = Math.max(
      30_000,
      (this._tokenExp - this.TOKEN_REFRESH_MARGIN_SEC) * 1000 - Date.now()
    );
    this._tokenTimer = setTimeout(() => {
      this._tokenTimer = null;
      if (!this.isSubscribed && !this._isConnecting) return; // обновим при следующем подключении
      this._ensureToken(true).catch(() => {});
    }, delayMs);
  }

  /** Действующий токен: текущий или новый с сервера */
  private _ensureToken(force: boolean = false): Promise<string | null> {
    if (!force && this._tokenFresh()) return Promise.resolve(this._token);
    if (this._tokenPromise) return this._tokenPromise;

    this._tokenPromise = (async () => {
      try {
        const res = await apiClient.get<{ realtime?: { token: string; expiresAt: number } }>(
          '/auth/realtime-token',
          { retries: 1 }
        );
        if (res?.realtime?.token) {
          this._applyToken(res.realtime.token, res.realtime.expiresAt);
          return this._token;
        }
        return null;
      } catch (err) {
        console.warn('⚠️ [sync] Токен Realtime не получен:', err instanceof Error ? err.message : err);
        if ((err as any)?.status === 403) {
          // Синхронизация больше недоступна (подписка закончилась)
          this.setRealtimeToken(null);
        }
        return null;
      } finally {
        this._tokenPromise = null;
      }
    })();
    return this._tokenPromise;
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

    try {
      // Сессия Supabase Auth не используется: токен задаётся вручную через realtime.setAuth
      this.supabase = (window as any).supabase.createClient(
        this._config!.supabaseUrl,
        this._config!.supabaseAnonKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
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
      const token = await this._ensureToken();
      if (!token) {
        console.warn('⚠️ [subscribe] Нет токена Realtime');
        this._isConnecting = false;
        return;
      }

      const supabase = await this.initSupabase();
      if (!supabase) {
        console.warn('⚠️ [subscribe] Supabase не инициализирован');
        this._isConnecting = false;
        return;
      }

      // Без этого websocket подключается с anon-ключом и RLS не отдаёт события
      supabase.realtime.setAuth(token);

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
          
          if (status === 'CHANNEL_ERROR') {
            // Возможная причина — истёкший токен: следующая попытка возьмёт новый
            this._token = null;
            this._tokenExp = 0;
          }

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
console.log('✅ SyncService v5.0.0 загружен');
