// ============================================
// src/modules/chat/send.ts
// Отправка сообщений (EventBus-based)
// Версия: 4.0.0 - подписка на события
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';
import { eventBus } from '@/core/event-bus';
import type { UUID } from '@types';

export class ChatSend {
  private chatStore = chatStore;
  private userStore = userStore;
  private uiRenderer = uiRenderer;
  private eventBus = eventBus;
  private isSending: boolean = false;
  private _subscriptions: Array<() => void> = [];

  constructor() {
    this._subscribeToEvents();
    console.log('✅ ChatSend v4.0.0 загружен (EventBus-based)');
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToEvents(): void {
    // Действия с сообщениями
    const unsubFav = this.eventBus.on('chat:toggle-favorite', (data) => {
      if (data?.msgId && data?.chatId) {
        this.toggleFavoriteMsg(data.msgId, data.chatId);
      }
    }, this);
    this._subscriptions.push(unsubFav);

    const unsubDel = this.eventBus.on('chat:delete-message', (data) => {
      if (data?.msgId) {
        this.deleteMessage(data.msgId);
      }
    }, this);
    this._subscriptions.push(unsubDel);

    const unsubCopy = this.eventBus.on('chat:copy-message', (data) => {
      if (data?.msgId && data?.btn) {
        this.copyMsgText(data.btn, data.msgId);
      }
    }, this);
    this._subscriptions.push(unsubCopy);

    const unsubShare = this.eventBus.on('chat:share-message', (data) => {
      if (data?.msgId && data?.btn) {
        this.shareMsgText(data.btn, data.msgId);
      }
    }, this);
    this._subscriptions.push(unsubShare);

    // Отправка сообщения
    const unsubSend = this.eventBus.on('chat:send-message', () => {
      this.sendMessage();
    }, this);
    this._subscriptions.push(unsubSend);

    console.log('📡 ChatSend подписан на события');
  }

  // ==========================================
  // ОТПРАВКА СООБЩЕНИЯ
  // ==========================================

  async sendMessage(): Promise<void> {
    if (!navigator.onLine) {
      if ((window as any).showOfflineBanner) {
        (window as any).showOfflineBanner();
      }
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('Нет интернета. Отправка сообщений недоступна.');
      }
      return;
    }

    if (this.isSending) return;

    if ((window as any).isVoiceRecording) {
      (window as any).isExpressVoiceTarget = true;
      const voiceBtn = document.querySelector('.voice-btn');
      if ((window as any).toggleVoiceRecording && voiceBtn) {
        await (window as any).toggleVoiceRecording(voiceBtn);
      }
      return;
    }

    const input = document.getElementById('user-input') as HTMLTextAreaElement;
    if (!input) return;

    let text = input.value.trim();
    if (!text) return;

    if (!this.userStore.hasUnlimited() && !this.userStore.hasRemainingQuota()) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Ежедневный лимит запросов исчерпан!');
      return;
    }

    this.isSending = true;
    input.disabled = true;

    const voiceBtn = document.querySelector('.voice-btn');
    if (voiceBtn) (voiceBtn as HTMLButtonElement).disabled = true;

    const mediaToAttach = (window as any).currentAttachedImageBase64 || null;
    if (mediaToAttach) {
      text = `📸 [Прикреплено изображение]\n${text}`;
    }

    const activeChat = this.chatStore.getActiveChat();
    if (!activeChat) {
      this.isSending = false;
      return;
    }

    const chatId = activeChat.id;
    const chatTopic = this.chatStore.currentTopic;
    const userLang = activeChat.language || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';

    const messageId = this.chatStore.generateUUID();

    const savedMsg = this.chatStore.addMessage(chatId, text, 'user-msg', {
      id: messageId,
      isFavorite: false
    });

    if (!savedMsg) {
      this.isSending = false;
      input.disabled = false;
      if (voiceBtn) (voiceBtn as HTMLButtonElement).disabled = false;
      return;
    }

    input.value = '';
    input.style.height = 'auto';
    const clearBtn = document.getElementById('clear-input-btn');
    if (clearBtn) clearBtn.classList.add('hidden');

    if ((window as any).collapseInputArea) (window as any).collapseInputArea();
    if (document.activeElement === input) input.blur();

    this.uiRenderer.showSkeleton();

    const maxContextLimit = activeChat ? (activeChat.maxContext || 15) : 15;
    const contextMessages = this.chatStore.getContextMessages(chatId, maxContextLimit);
    const cleanHistoryMessages = contextMessages.map(msg => ({
      type: String(msg.type),
      text: String(msg.text)
    }));

    try {
      if (this.userStore.canSync()) {
        const { messageService } = await import('@/services/messages');
        await messageService.sendMessage(chatId, text, 'user-msg', {
          id: messageId,
          isFavorite: false
        });
      }

      if (typeof (window as any).streamAiResponse === 'function') {
        await (window as any).streamAiResponse(
          cleanHistoryMessages,
          chatTopic,
          userLang,
          mediaToAttach,
          chatId
        );
      } else {
        throw new Error('streamAiResponse not defined');
      }
    } catch (error) {
      this.uiRenderer.hideSkeleton();
      console.error('Send error:', error);
      this.uiRenderer.renderMessage(
        `⚠️ Сбой связи: ${(error as Error).message}`,
        'ai-msg'
      );
    } finally {
      if ((window as any).clearImageAttachment) {
        (window as any).clearImageAttachment();
      }
      this.isSending = false;
      input.disabled = false;
      if (voiceBtn) (voiceBtn as HTMLButtonElement).disabled = false;
    }
  }

  // ==========================================
  // КОПИРОВАТЬ СООБЩЕНИЕ
  // ==========================================

  copyMsgText(btn: HTMLElement, msgId: UUID): void {
    const found = this.chatStore.findChatByMessageId(msgId);
    if (!found) {
      console.warn(`⚠️ Сообщение ${msgId} не найдено`);
      return;
    }

    const msg = found.chat.messages.find(m => m.id === msgId);
    if (!msg) return;

    navigator.clipboard.writeText(msg.text).then(() => {
      this.triggerTooltip(btn);
    }).catch(() => {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Ошибка копирования');
    });
  }

  // ==========================================
  // ПОДЕЛИТЬСЯ СООБЩЕНИЕМ
  // ==========================================

  shareMsgText(btn: HTMLElement, msgId: UUID): void {
    const found = this.chatStore.findChatByMessageId(msgId);
    if (!found) {
      console.warn(`⚠️ Сообщение ${msgId} не найдено`);
      return;
    }

    const msg = found.chat.messages.find(m => m.id === msgId);
    if (!msg) return;

    const shareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(msg.text)}`;
    this.triggerTooltip(btn);
    setTimeout(() => {
      if ((window as any).tg?.openTelegramLink) {
        (window as any).tg.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, '_blank');
      }
    }, 300);
  }

  // ==========================================
  // ИЗБРАННОЕ
  // ==========================================

  async toggleFavoriteMsg(msgId: UUID, chatId?: UUID): Promise<void> {
    if (!navigator.onLine) {
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('Нет интернета. Изменения недоступны.');
      }
      return;
    }

    // Если chatId не передан, берем из активного чата
    let effectiveChatId = chatId;
    if (!effectiveChatId) {
      const activeChat = this.chatStore.getActiveChat();
      if (!activeChat) {
        console.warn('⚠️ Нет активного чата');
        return;
      }
      effectiveChatId = activeChat.id;
    }

    const { messageService } = await import('@/services/messages');
    const result = await messageService.toggleFavorite(effectiveChatId, msgId);

    if (result) {
      // Находим все кнопки избранного для этого сообщения и обновляем
      const favButtons = document.querySelectorAll(`[data-action="toggle-favorite"][data-msg-id="${msgId}"]`);
      favButtons.forEach(btn => {
        const icon = btn.querySelector('.lucide-heart, [data-lucide="heart"]');
        if (result.isFavorite) {
          btn.classList.add('is-favorite');
          if (icon) {
            icon.setAttribute('data-lucide', 'heart');
          }
        } else {
          btn.classList.remove('is-favorite');
          if (icon) {
            icon.setAttribute('data-lucide', 'heart');
          }
        }
      });
      this.triggerTooltip(favButtons[0] as HTMLElement);
    }
  }

  // ==========================================
  // УДАЛЕНИЕ СООБЩЕНИЯ
  // ==========================================

  deleteMessage(msgId: UUID): void {
    if (!navigator.onLine) {
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('Нет интернета. Удаление недоступно.');
      }
      return;
    }

    const found = this.chatStore.findChatByMessageId(msgId);
    if (!found) {
      console.warn(`⚠️ Сообщение ${msgId} не найдено`);
      return;
    }

    const { chat } = found;
    const activeChat = this.chatStore.getActiveChat();

    if (!activeChat) {
      console.warn('⚠️ Нет активного чата');
      return;
    }

    const confirmMsg = 'Удалить это сообщение без возможности восстановления?';

    const action = async () => {
      const { messageService } = await import('@/services/messages');
      await messageService.deleteMessage(activeChat.id, msgId);

      const domBlock = document.getElementById(`msg-block-${msgId}`);
      if (domBlock) {
        domBlock.style.transition = 'all 0.25s ease';
        domBlock.style.opacity = '0';
        domBlock.style.transform = 'scale(0.95)';
        setTimeout(() => domBlock.remove(), 250);
      }

      this.uiRenderer.showToast('🗑️ Сообщение удалено навсегда', 'info', 1500);
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  // ==========================================
  // ОЧИСТКА ПОЛЯ ВВОДА
  // ==========================================

  clearUserText(e?: Event): void {
    if (e) e.stopPropagation();
    const input = document.getElementById('user-input') as HTMLTextAreaElement;
    const clearBtn = document.getElementById('clear-input-btn');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
    if (clearBtn) clearBtn.classList.add('hidden');
    if (input) input.focus();
  }

  private triggerTooltip(btn: HTMLElement): void {
    if (!btn) return;
    btn.classList.add('show-tip');
    setTimeout(() => {
      btn.classList.remove('show-tip');
    }, 1200);
  }

  // ==========================================
  // ОЧИСТКА ПОДПИСОК
  // ==========================================

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки ChatSend:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 ChatSend отписан от событий');
  }
}

// Создаем экземпляр
export const chatSend = new ChatSend();
console.log('✅ ChatSend v4.0.0 загружен (EventBus-based)');
