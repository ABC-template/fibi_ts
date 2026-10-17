// ============================================
// src/services/messages.ts
// Работа с сообщениями (HARD DELETE)
// Версия: 4.5.0 - чат стал пустым после удаления сообщения → переход к агентам через
//                 навигацию (история и «Назад» не сбиваются)
//          4.4.0 - очередь и sync_token с привязкой к Telegram ID (user-storage)
//          4.3.0 - очередь неотправленных сообщений: если сообщение (например, длинный
//                 ответ ИИ) не дошло до облака из-за сети или сбоя сервера, оно
//                 повторяется при появлении сети и раз в минуту
//          4.2.0 - удаление сообщения: сначала сервер (409 — чат занят ответом или
//                 генерацией → локально не удаляем), потом локально
//          4.1.1 - замена @types → @app-types
// ============================================

import { apiClient, ApiError } from './api';
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { userStorage, saveSyncToken } from '@/utils/user-storage';
import { chatService } from './chats';
import { uiRenderer } from '@/modules/ui/renderer';
import { navigationState } from '@/core/navigation-state';
import type { UUID, MessageType, IMessage } from '@app-types';

/** Очередь неотправленных сообщений (localStorage, своя у каждого аккаунта) */
const OUTBOX_MAX = 200;
const OUTBOX_MAX_ATTEMPTS = 30;
const OUTBOX_RETRY_MS = 60_000;

interface IOutboxItem {
  chatId: UUID;
  messageId: UUID;
  attempts: number;
}

export class MessageService {
  constructor() {
    // Остаток очереди с прошлого запуска — отправить, когда приложение загрузится
    // (читается позже: ключи прежних версий переносятся к аккаунту в initApp)
    setTimeout(() => {
      if (this._outboxRead().length === 0) return;
      this._bindOutbox();
      void this.flushOutbox();
    }, 10_000);
  }

  // ==========================================
  // СОХРАНЕНИЕ ТОКЕНА
  // ==========================================

  private _saveSyncToken(syncToken: string | null): void {
    saveSyncToken(syncToken);
  }

  // ==========================================
  // ОТПРАВКА СООБЩЕНИЯ
  // ==========================================

  async sendMessage(
    chatId: UUID,
    text: string,
    type: MessageType,
    options: Partial<IMessage> & { id?: UUID } = {}
  ): Promise<IMessage | null> {
    if (!navigator.onLine) {
      console.warn('⚠️ Нет интернета, сообщение сохраняется локально');
    }

    const found = chatStore.findChatById(chatId);
    if (!found) {
      console.error(`❌ Чат ${chatId} не найден`);
      return null;
    }

    const chat = found.chat;
    let message: IMessage | null = null;

    if (options.id) {
      // Сообщение уже добавлено в чат (отправка пользователя, ответ ИИ)
      message = chat.messages.find(m => m.id === options.id) || null;
      if (!message) {
        console.error(`❌ [sendMessage] Сообщение с ID ${options.id} не найдено в чате`);
        return null;
      }
    } else {
      message = chatStore.addMessage(chatId, text, type, {
        id: chatStore.generateUUID(),
        isFavorite: options.isFavorite || false,
        created_at: options.created_at || new Date().toISOString()
      });
      if (!message) return null;
    }

    if (userStore.canSync()) {
      const result = await this._pushMessage(chatId, message);
      if (result === 'retry') {
        // Не дошло до сервера — повторим позже (сеть, перегрузка, сбой сервера)
        this._enqueue(chatId, message.id);
      }
      // Заодно досылаем то, что не ушло раньше
      if (result === 'ok') void this.flushOutbox();
    }

    return message;
  }

  /**
   * Отправить сообщение на сервер. Сервер принимает повтор с тем же id
   * (перезаписывает), поэтому повторная отправка безопасна.
   *   ok    — сохранено;
   *   retry — временная ошибка (сеть, 409/429/5xx), стоит повторить;
   *   drop  — сервер отказал окончательно (4xx), повтор не поможет.
   */
  private async _pushMessage(chatId: UUID, message: IMessage): Promise<'ok' | 'retry' | 'drop'> {
    const found = chatStore.findChatById(chatId);
    if (!found) return 'drop';

    if (!found.chat.synced) {
      const created = await chatService.ensureRemoteChat(chatId);
      if (!created) return 'retry';
    }

    try {
      const result = await apiClient.post('/chats/actions/message', {
        action: 'new_message',
        chatId: chatId,
        message: {
          id: message.id,
          text: message.text,
          type: message.type,
          isFavorite: message.isFavorite || false
        }
      }, { retries: 1 });

      this._saveSyncToken(result?.syncToken || null);
      console.log(`✅ [sendMessage] Сообщение ${message.id} синхронизировано`);
      return 'ok';
    } catch (err) {
      if (err instanceof ApiError) {
        const st = err.status;
        if (st === 409 || st === 429 || st >= 500) return 'retry';
        console.warn(`⚠️ [sendMessage] Сервер отклонил сообщение ${message.id}: ${err.message}`);
        return 'drop';
      }
      console.error(`❌ [sendMessage] Ошибка синхронизации:`, err);
      return 'retry';
    }
  }

  // ==========================================
  // ОЧЕРЕДЬ НЕОТПРАВЛЕННЫХ СООБЩЕНИЙ
  // Ответ ИИ мог не дойти до облака (сеть, сбой сервера) — тогда на другом
  // устройстве и после перезагрузки он бы пропал. Очередь хранит только id,
  // текст берётся из локального чата в момент повтора.
  // ==========================================

  private _flushing = false;
  private _outboxBound = false;

  private _outboxRead(): IOutboxItem[] {
    try {
      const raw = userStorage.get('fibi_message_outbox');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((x) => x && x.chatId && x.messageId) : [];
    } catch {
      return [];
    }
  }

  private _outboxWrite(list: IOutboxItem[]): void {
    try {
      if (list.length === 0) userStorage.remove('fibi_message_outbox');
      else userStorage.set('fibi_message_outbox', JSON.stringify(list.slice(-OUTBOX_MAX)));
    } catch {
      // хранилище недоступно — повтора не будет, сообщение останется локально
    }
  }

  private _enqueue(chatId: UUID, messageId: UUID): void {
    const list = this._outboxRead().filter((x) => x.messageId !== messageId);
    list.push({ chatId, messageId, attempts: 0 });
    this._outboxWrite(list);
    this._bindOutbox();
    console.warn(`📮 [outbox] Сообщение ${messageId} будет отправлено повторно`);
  }

  /** Повтор: при появлении сети и раз в минуту, пока очередь не пуста */
  private _bindOutbox(): void {
    if (this._outboxBound) return;
    this._outboxBound = true;
    window.addEventListener('online', () => { void this.flushOutbox(); });
    setInterval(() => {
      if (this._outboxRead().length > 0) void this.flushOutbox();
    }, OUTBOX_RETRY_MS);
  }

  /** Досылает неотправленные сообщения. Вызывается сама; можно вызвать при старте. */
  async flushOutbox(): Promise<void> {
    if (this._flushing || !navigator.onLine || !userStore.canSync()) return;
    const queue = this._outboxRead();
    if (queue.length === 0) return;

    this._flushing = true;
    try {
      const keep: IOutboxItem[] = [];
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const found = chatStore.findChatById(item.chatId);
        const msg = found?.chat.messages.find((m) => m.id === item.messageId);
        // Сообщение или чат удалены локально — отправлять нечего
        if (!found || !msg || (msg as any).deleted_at) continue;

        const result = await this._pushMessage(item.chatId, msg);
        if (result === 'retry') {
          const attempts = (item.attempts || 0) + 1;
          if (attempts < OUTBOX_MAX_ATTEMPTS) keep.push({ ...item, attempts });
          else console.warn(`📮 [outbox] Сообщение ${item.messageId} не удалось отправить, повтор прекращён`);
          // Сервер недоступен — остальное не трогаем до следующей попытки
          keep.push(...queue.slice(i + 1));
          break;
        }
      }
      this._outboxWrite(keep);
    } finally {
      this._flushing = false;
    }
  }

  // ==========================================
  // УДАЛЕНИЕ СООБЩЕНИЯ (С АВТО-УДАЛЕНИЕМ ПУСТОГО ЧАТА)
  // ==========================================

  async deleteMessage(chatId: UUID, messageId: UUID): Promise<boolean> {
    const found = chatStore.findChatById(chatId);
    if (!found || !found.chat.messages.some((m) => m.id === messageId)) return false;

    // Станет ли чат пустым после удаления
    const willBeEmpty = !chatStore.hasRealMessages({
      ...found.chat,
      messages: found.chat.messages.filter((m) => m.id !== messageId),
    });

    // Сначала сервер: пока в чате идёт ответ или генерация, он отвечает 409 —
    // тогда локально ничего не удаляем (иначе сообщение «воскреснет» при синхронизации)
    if (userStore.canSync()) {
      try {
        if (willBeEmpty) {
          // Чат станет пустым → в корзину и сразу навсегда
          const trashed = await apiClient.post('/chats/actions/update', {
            action: 'delete_chat',
            chatId: chatId
          });
          this._saveSyncToken(trashed?.syncToken || null);
          const removed = await apiClient.delete('/chats/trash', {
            body: { id: chatId, type: 'chat' }
          });
          this._saveSyncToken(removed?.syncToken || null);
          console.log(`✅ [deleteMessage] Чат ${chatId} удалён на сервере (HARD DELETE)`);
        } else {
          const result = await apiClient.post('/chats/mutations/delete-with-confirm', {
            action: 'delete_message_with_confirm',
            messageId: messageId
          });
          this._saveSyncToken(result?.syncToken || null);
          console.log(`✅ [deleteMessage] Сообщение ${messageId} удалено на сервере (HARD DELETE)`);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const notice = err.message || 'Дождитесь окончания ответа или генерации.';
          const tg = (window as any).tg || (window as any).Telegram?.WebApp;
          if (tg?.showAlert) tg.showAlert(`⏳ ${notice}`);
          else uiRenderer.showToast(`⏳ ${notice}`, 'info');
          return false;
        }
        // Нет на сервере (ещё не синхронизировано) или сбой связи — удаляем локально
        console.warn(`⚠️ [deleteMessage] Сервер не подтвердил удаление:`, err);
      }
    }

    const deleted = chatStore.deleteMessage(chatId, messageId);
    if (!deleted) return false;

    if (willBeEmpty) {
      console.log(`🧹 [deleteMessage] Чат ${chatId} стал пустым, удаляем...`);
      chatStore.permanentDeleteChat(chatId);

      // Чат исчез — к списку агентов (после анимации удаления сообщения)
      setTimeout(() => navigationState.goToAgents(), 300);
    }

    return true;
  }

  // ==========================================
  // ИЗБРАННОЕ
  // ==========================================

  async toggleFavorite(chatId: UUID, messageId: UUID): Promise<IMessage | null> {
    const msg = chatStore.toggleFavorite(chatId, messageId);
    if (!msg) return null;

    if (userStore.canSync()) {
      try {
        const result = await apiClient.post('/chats/actions/favorite', {
          action: 'favorite_message',
          chatId: chatId,
          messageId: messageId,
          isFavorite: msg.isFavorite
        });

        this._saveSyncToken(result.syncToken);

        if (result.success) {
          console.log(`✅ [toggleFavorite] Избранное ${messageId} синхронизировано`);
        }
      } catch (err) {
        console.error(`❌ [toggleFavorite] Ошибка синхронизации:`, err);
      }
    }

    return msg;
  }
}

export const messageService = new MessageService();
console.log('✅ MessageService v4.3.0 загружен (очередь неотправленных сообщений)');
