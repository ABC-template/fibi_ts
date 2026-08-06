// ============================================
// src/services/messages.ts
// Работа с сообщениями (HARD DELETE)
// Версия: 4.1.0 - авто-удаление пустых чатов
// ============================================

import { apiClient } from './api';
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { chatService } from './chats';
import { uiRenderer } from '@/modules/ui/renderer';
import type { UUID, MessageType, IMessage } from '@types';

export class MessageService {
  constructor() {}

  // ==========================================
  // СОХРАНЕНИЕ ТОКЕНА
  // ==========================================

  private _saveSyncToken(syncToken: string | null): void {
    if (syncToken) {
      localStorage.setItem('sync_token', syncToken);
      console.log(`✅ sync_token обновлен после действия: ${syncToken.substring(0, 8)}...`);
    }
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

    if (options.id) {
      console.log(`📤 [sendMessage] Сообщение уже существует (ID: ${options.id})`);

      const existingMsg = chat.messages.find(m => m.id === options.id);
      if (!existingMsg) {
        console.error(`❌ [sendMessage] Сообщение с ID ${options.id} не найдено в чате`);
        return null;
      }

      if (userStore.canSync()) {
        if (!chat.synced) {
          console.log(`📤 [sendMessage] Создаем чат на сервере...`);
          const created = await chatService.createChat(
            chat.topic,
            chat.title,
            {
              maxContext: chat.maxContext,
              userRenamed: chat.userRenamed,
              firstMessage: existingMsg,
              existingChatId: chat.id
            }
          );
          if (created) {
            chat.synced = true;
          }
        }

        try {
          const result = await apiClient.post('/chats/actions/message', {
            action: 'new_message',
            chatId: chatId,
            message: {
              id: existingMsg.id,
              text: existingMsg.text,
              type: existingMsg.type,
              isFavorite: existingMsg.isFavorite || false
            }
          });

          this._saveSyncToken(result.syncToken);

          if (result.synced || result.success) {
            console.log(`✅ [sendMessage] Сообщение ${existingMsg.id} синхронизировано`);
          }
        } catch (err) {
          console.error(`❌ [sendMessage] Ошибка синхронизации:`, err);
        }
      }

      return existingMsg;
    }

    console.log(`📤 [sendMessage] Новое сообщение, создаем локально`);

    const messageId = chatStore.generateUUID();
    const isFirstMessage = !chatStore.hasRealMessages(chat);

    const message = chatStore.addMessage(chatId, text, type, {
      id: messageId,
      isFavorite: options.isFavorite || false,
      created_at: options.created_at || new Date().toISOString()
    });

    if (!message) return null;

    if (userStore.canSync()) {
      if (!chat.synced || isFirstMessage) {
        console.log(`📤 [sendMessage] Создаем чат ${chat.id} на сервере...`);

        const created = await chatService.createChat(
          chat.topic,
          chat.title,
          {
            maxContext: chat.maxContext,
            userRenamed: chat.userRenamed,
            firstMessage: message,
            existingChatId: chat.id
          }
        );

        if (created) {
          chat.synced = true;
        }
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
        });

        this._saveSyncToken(result.syncToken);

        if (result.synced || result.success) {
          console.log(`✅ [sendMessage] Сообщение ${message.id} синхронизировано`);
        }
      } catch (err) {
        console.error(`❌ [sendMessage] Ошибка синхронизации:`, err);
      }
    }

    return message;
  }

  // ==========================================
  // УДАЛЕНИЕ СООБЩЕНИЯ (С АВТО-УДАЛЕНИЕМ ПУСТОГО ЧАТА)
  // ==========================================

  async deleteMessage(chatId: UUID, messageId: UUID): Promise<boolean> {
    const deleted = chatStore.deleteMessage(chatId, messageId);
    if (!deleted) return false;

    // ✅ ПРОВЕРЯЕМ: Остались ли сообщения в чате?
    const found = chatStore.findChatById(chatId);
    if (found) {
      const hasMessages = chatStore.hasRealMessages(found.chat);
      
      // ✅ ЕСЛИ СООБЩЕНИЙ НЕТ → УДАЛЯЕМ ЧАТ
      if (!hasMessages) {
        console.log(`🧹 [deleteMessage] Чат ${chatId} стал пустым, удаляем...`);
        
        // Показываем уведомление
        if (uiRenderer) {
          uiRenderer.showToast('🗑️ Последнее сообщение удалено, чат будет удалён', 'info', 2000);
        }
        
        // Удаляем чат (HARD DELETE)
        const chatDeleted = chatStore.permanentDeleteChat(chatId);
        
        if (chatDeleted && userStore.canSync()) {
          try {
            // Сначала отправляем в корзину (для соблюдения логики)
            await chatService.deleteChat(chatId);
            // Затем удаляем навсегда
            await chatService.permanentDeleteChat(chatId);
            console.log(`✅ [deleteMessage] Чат ${chatId} удалён на сервере (HARD DELETE)`);
          } catch (err) {
            console.error(`❌ [deleteMessage] Ошибка синхронизации удаления чата:`, err);
          }
        }
        
        // Возвращаемся в список чатов
        if (window.moduleLoader) {
          setTimeout(() => {
            window.moduleLoader.load('chat-list');
          }, 300);
        }
        
        return true;
      }
    }

    // Если сообщения остались — синхронизируем удаление сообщения
    if (userStore.canSync()) {
      try {
        const result = await apiClient.post('/chats/mutations/delete-with-confirm', {
          action: 'delete_message_with_confirm',
          messageId: messageId
        });

        this._saveSyncToken(result.syncToken);

        if (result.success) {
          console.log(`✅ [deleteMessage] Сообщение ${messageId} удалено на сервере (HARD DELETE)`);
        } else {
          console.warn(`⚠️ [deleteMessage] Сообщение ${messageId} удалено локально, но не на сервере`);
        }
      } catch (err) {
        console.error(`❌ [deleteMessage] Ошибка синхронизации:`, err);
      }
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

// Создаем экземпляр
export const messageService = new MessageService();
console.log('✅ MessageService v4.1.0 загружен (авто-удаление пустых чатов)');
