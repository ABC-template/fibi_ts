// ============================================
// src/services/chats.ts
// CRUD операции с чатами
// Версия: 3.0.4 - FIXED импорт MessageType
// ============================================

import { apiClient } from './api';
import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import type { IChat, IMessage, MessageType, TopicId, UUID } from '@types';

export class ChatService {
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
  // ПОЛНАЯ ПЕРЕЗАГРУЗКА
  // ==========================================

  async fullReload(): Promise<boolean> {
    console.log('🔄 [fullReload] Начинаем полную перезагрузку данных...');
    try {
      const data = await this.loadAllChats({ sync: true });
      if (data && data.chats) {
        if (data.syncToken) {
          this._saveSyncToken(data.syncToken);
        }
        console.log(`✅ [fullReload] Загружено ${data.chats.length} чатов, ${data.total_messages || 0} сообщений`);
        if ((window as any).chatUI) (window as any).chatUI.refreshUI();
        if ((window as any).profileUI) (window as any).profileUI.renderHistoryChatsList((window as any).profileUI?.currentFilter || 'all');
        return true;
      }
      return false;
    } catch (err) {
      console.error('❌ [fullReload] Ошибка:', err);
      return false;
    }
  }

  // ==========================================
  // ЗАГРУЗКА ВСЕХ ЧАТОВ
  // ==========================================

  async loadAllChats(options: { sync?: boolean } = {}): Promise<any> {
    if (!userStore.canSync()) {
      console.log('⏭️ Синхронизация отключена');
      return null;
    }

    try {
      const { sync = false } = options;
      const url = sync ? '/chats/get-all?sync=true' : '/chats/get-all';
      
      console.log(`📋 [loadAllChats] Загружаем все чаты (sync=${sync})...`);
      const data = await apiClient.get(url);

      if (data.success && data.chats) {
        chatStore.updateAllChats(data.chats);
        
        if (data.syncToken) {
          this._saveSyncToken(data.syncToken);
        }
        
        console.log(`✅ [loadAllChats] Загружено ${data.chats.length} чатов, ${data.total_messages || 0} сообщений`);
        return data;
      }
      return null;
    } catch (err) {
      console.error('❌ [loadAllChats] Ошибка:', err);
      return null;
    }
  }

  // ==========================================
  // МЕТАДАННЫЕ
  // ==========================================

  async loadMetadata(silent: boolean = false): Promise<any> {
    if (!userStore.canSync()) {
      console.log('⏭️ Синхронизация отключена');
      return;
    }

    try {
      if (!silent) console.log('📋 Загрузка метаданных чатов...');
      const data = await apiClient.get('/chats/sync-metadata');
      if (data.chats && Array.isArray(data.chats)) {
        chatStore.updateMetadata(data.chats);
        console.log(`✅ Загружено ${data.chats.length} метаданных чатов`);
      }
      return data;
    } catch (err) {
      console.error('❌ Ошибка загрузки метаданных:', err);
      return null;
    }
  }

  // ==========================================
  // ОТКРЫТИЕ ЧАТА
  // ==========================================

  async openChat(chatId: UUID): Promise<boolean> {
    if (!userStore.canSync()) {
      console.log('⏭️ Синхронизация отключена');
      return false;
    }

    try {
      console.log(`📂 Открываем чат ${chatId}...`);
      const data = await apiClient.get(`/chats/get?id=${chatId}`);

      if (data.success && data.chat) {
        this.mergeChatFromCloud(
          {
            ...data.chat,
            messages: data.messages || []
          },
          data.chat.topic_id
        );
        if (data.syncToken) {
          this._saveSyncToken(data.syncToken);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error(`❌ Ошибка открытия чата ${chatId}:`, err);
      return false;
    }
  }

  // ==========================================
  // MERGE ЧАТА ИЗ ОБЛАКА
  // ==========================================

  mergeChatFromCloud(cloudChat: any, topicId: TopicId): IChat {
    console.log(`🔄 Мержим чат ${cloudChat.id} из облака...`);
    const found = chatStore.findChatById(cloudChat.id);
    
    if (found) {
      const { chat } = found;
      chat.title = cloudChat.title;
      chat.maxContext = cloudChat.max_context || 15;
      chat.userRenamed = cloudChat.user_renamed || false;
      chat.updated_at = cloudChat.updated_at;
      chat.deleted_at = cloudChat.deleted_at || null;
      chat.synced = true;
      
      const cloudMsgIds = new Set(cloudChat.messages.map((m: any) => m.id));
      chat.messages = chat.messages.filter(m => {
        if (cloudMsgIds.has(m.id)) return true;
        if (!m.id || m.id.startsWith('local_')) return true;
        return false;
      });
      
      for (const msg of cloudChat.messages) {
        const exists = chat.messages.some((m: IMessage) => m.id === msg.id);
        if (!exists) {
          const msgType = msg.msg_type || msg.type || 'user-msg';
          chat.messages.push({
            id: msg.id,
            text: msg.text,
            type: msgType as MessageType,
            isFavorite: msg.is_favorite || false,
            created_at: msg.created_at || new Date().toISOString(),
            deleted_at: msg.deleted_at || null
          });
        }
      }
      
      chat.messages.sort((a, b) => {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });
      
      chatStore.save();
      console.log(`✅ Чат ${cloudChat.id} обновлен (${chat.messages.length} сообщений)`);
      return chat;
    } else {
      const newChat = chatStore.createChat(
        topicId || cloudChat.topic_id || 'fast',
        cloudChat.title,
        {
          id: cloudChat.id,
          maxContext: cloudChat.max_context || 15,
          userRenamed: cloudChat.user_renamed || false,
          synced: true,
          messages: cloudChat.messages.map((m: any) => {
            const msgType = m.msg_type || m.type || 'user-msg';
            return {
              id: m.id,
              text: m.text,
              type: msgType as MessageType,
              isFavorite: m.is_favorite || false,
              created_at: m.created_at || new Date().toISOString(),
              deleted_at: m.deleted_at || null
            };
          })
        }
      );
      console.log(`✅ Новый чат ${cloudChat.id} создан (${newChat.messages.length} сообщений)`);
      return newChat;
    }
  }

  // ==========================================
  // ПОЛУЧЕНИЕ ЧАТА
  // ==========================================

  async getChat(chatId: UUID): Promise<IChat | null> {
    try {
      const data = await apiClient.get(`/chats/get?id=${chatId}`);
      if (data.success && data.chat) {
        const syncedChat = this.mergeChatFromCloud(
          {
            ...data.chat,
            messages: data.messages || []
          },
          data.chat.topic_id
        );
        if (data.syncToken) {
          this._saveSyncToken(data.syncToken);
        }
        return syncedChat;
      }
      return null;
    } catch (err) {
      console.error(`❌ Ошибка получения чата ${chatId}:`, err);
      return null;
    }
  }

  // ==========================================
  // ПЕРЕИМЕНОВАНИЕ ЧАТА
  // ==========================================

  async renameChat(chatId: UUID, newTitle: string): Promise<boolean> {
    if (!userStore.canSync()) {
      console.log('⏭️ Синхронизация отключена');
      return false;
    }

    try {
      const result = await apiClient.post('/chats/actions/update', {
        action: 'rename_chat',
        chatId: chatId,
        newTitle: newTitle.trim()
      });

      if (result.success) {
        chatStore.renameChat(chatId, newTitle);
        this._saveSyncToken(result.syncToken);
        console.log(`✅ Чат ${chatId} переименован`);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`❌ Ошибка переименования чата ${chatId}:`, err);
      return false;
    }
  }

  // ==========================================
  // ОБНОВЛЕНИЕ КОНТЕКСТА
  // ==========================================

  async updateContext(chatId: UUID, maxContext: number): Promise<boolean> {
    if (!userStore.canSync()) {
      console.log('⏭️ Синхронизация отключена');
      return false;
    }

    try {
      const result = await apiClient.post('/chats/actions/update', {
        action: 'update_context',
        chatId: chatId,
        maxContext: maxContext
      });

      if (result.success) {
        chatStore.updateChat(chatId, { maxContext: maxContext });
        this._saveSyncToken(result.syncToken);
        console.log(`✅ Контекст чата ${chatId} обновлён`);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`❌ Ошибка обновления контекста ${chatId}:`, err);
      return false;
    }
  }

  // ==========================================
  // УДАЛЕНИЕ В КОРЗИНУ
  // ==========================================

  async deleteChat(chatId: UUID): Promise<boolean> {
    chatStore.deleteChat(chatId);

    if (userStore.canSync()) {
      try {
        const result = await apiClient.post('/chats/actions/update', {
          action: 'delete_chat',
          chatId: chatId
        });

        if (result.success) {
          this._saveSyncToken(result.syncToken);
          console.log(`✅ Чат ${chatId} отправлен в корзину на сервере`);
          return true;
        }
        return false;
      } catch (err) {
        console.error(`❌ Ошибка удаления чата ${chatId}:`, err);
        return false;
      }
    }
    return true;
  }

  // ==========================================
  // ВОССТАНОВЛЕНИЕ ИЗ КОРЗИНЫ
  // ==========================================

  async restoreChat(chatId: UUID): Promise<boolean> {
    chatStore.restoreChat(chatId);

    if (userStore.canSync()) {
      try {
        const result = await apiClient.post('/chats/trash', {
          id: chatId,
          type: 'chat'
        });

        if (result.success) {
          this._saveSyncToken(result.syncToken);
          console.log(`✅ Чат ${chatId} восстановлен на сервере`);
          return true;
        }
        return false;
      } catch (err) {
        console.error(`❌ Ошибка восстановления чата ${chatId}:`, err);
        return false;
      }
    }
    return true;
  }

  // ==========================================
  // БЕЗВОЗВРАТНОЕ УДАЛЕНИЕ
  // ==========================================

  async permanentDeleteChat(chatId: UUID): Promise<boolean> {
    chatStore.permanentDeleteChat(chatId);

    if (userStore.canSync()) {
      try {
        const result = await apiClient.delete('/chats/trash', {
          body: {
            id: chatId,
            type: 'chat'
          }
        });

        if (result.success) {
          this._saveSyncToken(result.syncToken);
          console.log(`✅ Чат ${chatId} удален навсегда на сервере (HARD DELETE)`);
          return true;
        }
        return false;
      } catch (err) {
        console.error(`❌ Ошибка HARD DELETE чата ${chatId}:`, err);
        return false;
      }
    }
    return true;
  }

  // ==========================================
  // СОЗДАНИЕ ЧАТА
  // ==========================================

  async createChat(
    topicId: TopicId,
    title: string,
    options: {
      firstMessage?: any;
      maxContext?: number;
      userRenamed?: boolean;
      existingChatId?: UUID;
    } = {}
  ): Promise<IChat | null> {
    const hasMessages = options.firstMessage && options.firstMessage.text;

    if (!hasMessages) {
      console.warn('⚠️ Попытка создать пустой чат — отклонено');
      return null;
    }

    try {
      const chatId = options.existingChatId || undefined;

      const data = await apiClient.post('/chats/actions/create', {
        action: 'create_chat',
        chat: {
          id: chatId,
          topic_id: topicId,
          title: title || `Чат в ${topicId}`,
          max_context: options.maxContext || 15,
          user_renamed: options.userRenamed || false
        },
        firstMessage: options.firstMessage || null
      });

      if (data.success) {
        this._saveSyncToken(data.syncToken);

        const existingChat = chatStore.findChatById(data.chatId);

        if (existingChat) {
          const updatedChat = chatStore.updateChat(data.chatId, {
            synced: true,
            title: title || existingChat.chat.title,
            updated_at: new Date().toISOString()
          });

          if (options.firstMessage && data.messageId) {
            const existingMsg = existingChat.chat.messages.find(
              (m: IMessage) => m.id === options.firstMessage.id
            );
            if (!existingMsg) {
              chatStore.addMessage(
                data.chatId,
                options.firstMessage.text,
                options.firstMessage.type || 'user-msg',
                {
                  id: data.messageId
                }
              );
            }
          }

          console.log(`✅ Чат ${data.chatId} обновлён в облаке`);
          return updatedChat || existingChat.chat;
        } else {
          const chat = chatStore.createChat(topicId, title, {
            ...options,
            synced: true,
            id: data.chatId
          });

          if (options.firstMessage && data.messageId) {
            chatStore.addMessage(
              data.chatId,
              options.firstMessage.text,
              options.firstMessage.type || 'user-msg',
              {
                id: data.messageId
              }
            );
          }

          console.log(`✅ Создан новый чат ${data.chatId} в облаке`);
          return chat;
        }
      }
      return null;
    } catch (err) {
      console.error('❌ Ошибка создания чата:', err);
      return null;
    }
  }

  // ==========================================
  // ЗАГРУЗКА ЛОКАЛЬНЫХ ДАННЫХ В ОБЛАКО
  // ==========================================

  async uploadLocalDataToCloud(): Promise<boolean> {
    const localChats = this.getAllLocalChats();
    const total = localChats.length;

    if (total === 0) {
      console.log('📭 Нет локальных чатов для загрузки');
      return true;
    }

    console.log(`📤 Загрузка ${total} чатов в облако...`);
    this.showProgressModal(total);

    let uploaded = 0;
    let currentIndex = 0;

    chatStore.setUploadProgress(0, total);

    while (currentIndex < localChats.length) {
      const chat = localChats[currentIndex];

      try {
        const exists = await this.checkChatExists(chat.id);

        if (exists) {
          await this.updateChatInCloud(chat);
        } else {
          await this.createChatInCloud(chat);
        }

        uploaded++;
        currentIndex++;
        chatStore.setUploadProgress(currentIndex, total);
        this.updateProgress(uploaded, total);

      } catch (error) {
        console.error(`❌ Ошибка загрузки чата ${chat.id}:`, error);
        const action = await this.showErrorDialog({
          message: `Ошибка при загрузке чата "${chat.title || 'Без названия'}"`,
          error: error instanceof Error ? error.message : 'Неизвестная ошибка',
          options: ['Повторить', 'Пропустить', 'Отменить']
        });

        if (action === 'Повторить') {
          continue;
        } else if (action === 'Пропустить') {
          currentIndex++;
          chatStore.setUploadProgress(currentIndex, total);
          continue;
        } else {
          await this.rollbackUpload(uploaded, localChats);
          this.hideProgressModal();
          chatStore.clearUploadFlags();
          if ((window as any).uiRenderer) {
            (window as any).uiRenderer.showToast('❌ Загрузка отменена. Данные откатаны.', 'error', 3000);
          }
          return false;
        }
      }
    }

    this.hideProgressModal();
    chatStore.clearUploadFlags();

    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast(`✅ Все ${total} чатов успешно загружены в облако!`, 'success', 3000);
    }

    return true;
  }

  private getAllLocalChats(): any[] {
    const allChats: any[] = [];

    for (const [topic, chats] of Object.entries(chatStore.histories || {})) {
      if (!chats || !Array.isArray(chats)) continue;

      for (const chat of chats) {
        if (chat.deleted_at) continue;
        if (!chatStore.hasRealMessages(chat)) continue;

        allChats.push({
          ...chat,
          topic: topic
        });
      }
    }

    return allChats;
  }

  private async checkChatExists(chatId: UUID): Promise<boolean> {
    try {
      const data = await apiClient.get(`/chats/get?id=${chatId}`);
      return data.success && data.chat;
    } catch (err) {
      if (err instanceof Error && (err as any).status === 404) return false;
      throw err;
    }
  }

  private async updateChatInCloud(localChat: any): Promise<void> {
    console.log(`📝 Обновляем чат ${localChat.id} в облаке (мерж)...`);

    const cloudChat = await this.getChat(localChat.id);
    if (!cloudChat) {
      throw new Error('Не удалось загрузить чат из облака');
    }

    const cloudMsgIds = new Set(cloudChat.messages.map((m: IMessage) => m.id));
    const newMessages = localChat.messages.filter((m: IMessage) => !cloudMsgIds.has(m.id));

    if (newMessages.length > 0) {
      for (const msg of newMessages) {
        const result = await apiClient.post('/chats/actions/message', {
          action: 'new_message',
          chatId: localChat.id,
          message: {
            id: msg.id,
            text: msg.text,
            type: msg.type,
            isFavorite: msg.isFavorite || false
          }
        });
        this._saveSyncToken(result.syncToken);
      }
      console.log(`📝 Добавлено ${newMessages.length} новых сообщений в чат ${localChat.id}`);
    }

    if (localChat.title !== cloudChat.title || localChat.maxContext !== cloudChat.maxContext) {
      const result = await apiClient.post('/chats/actions/update', {
        action: 'rename_chat',
        chatId: localChat.id,
        newTitle: localChat.title
      });
      this._saveSyncToken(result.syncToken);
      console.log(`📝 Обновлены метаданные чата ${localChat.id}`);
    }
  }

  private async createChatInCloud(localChat: any): Promise<void> {
    console.log(`📝 Создаем чат ${localChat.id} в облаке...`);

    const result = await apiClient.post('/chats/actions/create', {
      action: 'create_chat',
      chat: {
        id: localChat.id,
        topic_id: localChat.topic,
        title: localChat.title,
        max_context: localChat.maxContext || 15,
        user_renamed: localChat.userRenamed || false
      },
      firstMessage: null
    });
    this._saveSyncToken(result.syncToken);

    const messages = localChat.messages.filter((m: IMessage) => !m.deleted_at);

    if (messages.length > 0) {
      for (const msg of messages) {
        const msgResult = await apiClient.post('/chats/actions/message', {
          action: 'new_message',
          chatId: localChat.id,
          message: {
            id: msg.id,
            text: msg.text,
            type: msg.type,
            isFavorite: msg.isFavorite || false
          }
        });
        this._saveSyncToken(msgResult.syncToken);
      }
      console.log(`📝 Загружено ${messages.length} сообщений в чат ${localChat.id}`);
    }

    console.log(`✅ Чат ${localChat.id} создан в облаке`);
  }

  private async rollbackUpload(uploadedCount: number, localChats: any[]): Promise<void> {
    console.log(`🔄 Откатываем загрузку (${uploadedCount} чатов)...`);

    for (let i = 0; i < uploadedCount && i < localChats.length; i++) {
      const chat = localChats[i];
      if (chat) {
        try {
          await apiClient.delete('/chats/trash', {
            body: {
              id: chat.id,
              type: 'chat',
              deviceFingerprint: 'rollback'
            }
          });
          console.log(`🗑️ Удален чат ${chat.id} из облака (откат)`);
        } catch (err) {
          console.error(`❌ Не удалось удалить чат ${chat.id}:`, err);
        }
      }
    }

    localStorage.removeItem('sync_token');
    console.log('✅ Откат завершен');
  }

  private showProgressModal(total: number): void {
    const modal = document.createElement('div');
    modal.id = 'upload-progress-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
      <div style="background: var(--bg-color); padding: 32px; border-radius: 16px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="font-size: 48px; margin-bottom: 12px;">☁️</div>
        <h3 style="margin: 0 0 8px 0; color: var(--text-color);">Загрузка в облако</h3>
        <p style="color: var(--hint-color); font-size: 14px; margin: 0 0 8px 0;">
          Пожалуйста, не закрывайте приложение...
        </p>
        <p id="upload-time-estimate" style="color: var(--hint-color); font-size: 12px; margin: 0 0 20px 0;">
          Осталось ~ вычисляется...
        </p>
        <div style="width: 100%; height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
          <div id="upload-progress-bar" style="width: 0%; height: 100%; background: var(--button-color); transition: width 0.3s ease; border-radius: 4px;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: var(--hint-color);">
          <span id="upload-progress-text">0%</span>
          <span id="upload-progress-count">0/${total}</span>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    (this as any)._uploadStartTime = Date.now();
    (this as any)._uploadTotal = total;
  }

  private updateProgress(current: number, total: number): void {
    const bar = document.getElementById('upload-progress-bar');
    const text = document.getElementById('upload-progress-text');
    const count = document.getElementById('upload-progress-count');
    const estimate = document.getElementById('upload-time-estimate');

    if (bar) {
      const percent = Math.round((current / total) * 100);
      bar.style.width = `${Math.min(percent, 100)}%`;
    }

    if (text) {
      const percent = Math.round((current / total) * 100);
      text.textContent = `${Math.min(percent, 100)}%`;
    }

    if (count) {
      count.textContent = `${current}/${total}`;
    }

    if (estimate && current > 0) {
      const elapsed = (Date.now() - (this as any)._uploadStartTime) / 1000;
      const avgTimePerChat = elapsed / current;
      const remaining = (total - current) * avgTimePerChat;

      if (remaining > 60) {
        estimate.textContent = `⏱️ Осталось ~ ${Math.round(remaining / 60)} минут`;
      } else if (remaining > 0) {
        estimate.textContent = `⏱️ Осталось ~ ${Math.round(remaining)} секунд`;
      } else {
        estimate.textContent = '⏱️ Завершается...';
      }
    }
  }

  private hideProgressModal(): void {
    const modal = document.getElementById('upload-progress-modal');
    if (modal) {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.3s ease';
      setTimeout(() => modal.remove(), 300);
    }
  }

  private showErrorDialog({ message, error, options }: { message: string; error: string; options: string[] }): Promise<string> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease;
      `;

      modal.innerHTML = `
        <div style="background: var(--bg-color); padding: 24px; border-radius: 16px; max-width: 360px; width: 90%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
          <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
          <h4 style="margin: 0 0 4px 0; color: var(--text-color); font-size: 16px;">${message}</h4>
          <p style="color: var(--hint-color); font-size: 13px; margin: 0 0 16px 0; word-break: break-word;">${error}</p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
            ${options.map(opt => `
              <button class="btn" style="padding: 8px 16px; font-size: 13px; min-width: 80px; ${opt === 'Отменить' ? 'background: var(--danger-color);' : ''}" 
                      onclick="this.closest('div[style]').parentElement.remove(); window._errorResolve('${opt}')">
                ${opt}
              </button>
            `).join('')}
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      (window as any)._errorResolve = resolve;
    });
  }
}

// Создаем экземпляр
export const chatService = new ChatService();
console.log('✅ ChatService v3.0.4 загружен (исправлен импорт MessageType)');
