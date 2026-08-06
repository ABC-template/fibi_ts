// ============================================
// src/modules/chat/stream.ts
// Стриминг ответов от ИИ
// Версия: 4.0.3 - EventBus-based
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';
import { eventBus } from '@/core/event-bus';
import type { UUID, TopicId } from '@types';

let streamCallCounter = 0;

(window as any).streamAiResponse = async function(
  historyMessages: Array<{ type: string; text: string }>,
  topic: TopicId,
  userLang: string,
  attachedImage: string | null,
  chatId: UUID
): Promise<boolean> {
  const callId = ++streamCallCounter;
  console.log(`🔴 [СТРИМ #${callId}] ===== НАЧАЛО =====`);
  console.log(`🔴 [СТРИМ #${callId}] chatId: ${chatId}, topic: ${topic}, history: ${historyMessages?.length || 0} сообщений`);

  const container = document.getElementById('chat-container');
  if (!container) {
    console.error(`❌ [СТРИМ #${callId}] chat-container не найден`);
    return false;
  }

  const uiRendererInstance = uiRenderer;
  const chatStoreInstance = chatStore;
  const userStoreInstance = userStore;
  const eventBusInstance = eventBus;

  let msgDiv: HTMLElement | null = null;
  let accumulatedText = '';
  let isFirstChunk = true;
  let chunksReceived = 0;
  let finalizeCalled = false;
  let generatedAiMsgId: UUID | null = null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn(`⏰ [СТРИМ #${callId}] Таймаут 60 секунд истек`);
    controller.abort();
  }, 60000);

  try {
    const found = chatStoreInstance.findChatById(chatId);
    if (!found) {
      console.error(`❌ [СТРИМ #${callId}] Чат ${chatId} не найден`);
      throw new Error(`Чат ${chatId} не найден`);
    }

    const targetChat = found.chat;
    console.log(`✅ [СТРИМ #${callId}] Найден чат: ${targetChat.title}`);

    const requestBody = {
      historyMessages: historyMessages || [],
      currentTopic: topic || chatStoreInstance.currentTopic,
      userLang: userLang || 'ru',
      attachedImage: attachedImage || null
    };

    console.log(`🌊 [СТРИМ #${callId}] Отправляем запрос к /api/chat/stream`);

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || ''
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`📡 [СТРИМ #${callId}] Ответ: status ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ [СТРИМ #${callId}] Ошибка ${response.status}: ${text.substring(0, 200)}`);
      throw new Error(`Ошибка ${response.status}: ${text.substring(0, 200)}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');

    console.log(`📡 [СТРИМ #${callId}] Начинаем чтение стрима...`);

    msgDiv = document.createElement('div');
    msgDiv.className = 'msg ai-msg msg-animated';
    msgDiv.id = `msg-block-${Date.now()}-${callId}`;
    msgDiv.setAttribute('data-sanitized', 'true');

    function smartScroll(): void {
      if (!container) return;
      const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`📡 [СТРИМ #${callId}] Стрим завершен, получено ${chunksReceived} чанков`);
        break;
      }

      chunksReceived++;
      const chunk = decoder.decode(value, { stream: true });
      accumulatedText += chunk;

      if (isFirstChunk && accumulatedText.trim().length > 0) {
        console.log(`🎨 [СТРИМ #${callId}] Первый текст, создаем DOM`);
        uiRendererInstance.hideSkeleton();
        container.appendChild(msgDiv);
        isFirstChunk = false;
      }

      if (msgDiv && !isFirstChunk) {
        if (typeof (window as any).marked !== 'undefined') {
          try {
            let rawHTML = (window as any).marked.parse(accumulatedText);
            let safeHTML = rawHTML;
            if (typeof (window as any).DOMPurify !== 'undefined') {
              safeHTML = (window as any).DOMPurify.sanitize(rawHTML, {
                ALLOWED_TAGS: [
                  'p', 'br', 'strong', 'em', 'u', 'i', 'b',
                  'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                  'ul', 'ol', 'li', 'blockquote',
                  'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                  'span', 'div', 'img', 'hr', 'sub', 'sup'
                ],
                ALLOWED_ATTR: ['href', 'target', 'class', 'id', 'style', 'src', 'alt', 'title', 'rel'],
                FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']
              });
            }
            msgDiv.innerHTML = safeHTML;
          } catch (markErr) {
            console.warn(`⚠️ [СТРИМ #${callId}] Ошибка marked:`, markErr);
            msgDiv.textContent = accumulatedText;
          }
        } else {
          msgDiv.textContent = accumulatedText;
        }
        smartScroll();
      }
    }

    console.log(`📊 [СТРИМ #${callId}] Итог: ${chunksReceived} чанков, ${accumulatedText.length} символов`);

    if (accumulatedText.trim().length > 0) {
      console.log(`🟢 [СТРИМ #${callId}] НАЧАЛО ФИНАЛИЗАЦИИ`);

      if (finalizeCalled) {
        console.warn(`⚠️⚠️⚠️ [СТРИМ #${callId}] ФИНАЛИЗАЦИЯ ВЫЗВАНА ПОВТОРНО! Пропускаем.`);
        return true;
      }
      finalizeCalled = true;

      generatedAiMsgId = chatStoreInstance.generateUUID();
      console.log(`🟢 [СТРИМ #${callId}] Сгенерирован ID: ${generatedAiMsgId}`);

      msgDiv!.id = `msg-block-${generatedAiMsgId}`;

      const safeFinalText = typeof accumulatedText === 'string' ? accumulatedText : String(accumulatedText);

      // ✅ ИСПРАВЛЕНО: data-атрибуты вместо onclick
      const act = document.createElement('div');
      act.className = 'msg-actions';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.dataset.action = 'copy-message';
      copyBtn.dataset.msgId = generatedAiMsgId;
      copyBtn.dataset.tooltip = '📋';
      copyBtn.innerHTML = '<i data-lucide="copy"></i>';
      act.appendChild(copyBtn);

      const shareBtn = document.createElement('button');
      shareBtn.className = 'action-btn';
      shareBtn.dataset.action = 'share-message';
      shareBtn.dataset.msgId = generatedAiMsgId;
      shareBtn.dataset.tooltip = '🔗';
      shareBtn.innerHTML = '<i data-lucide="share-2"></i>';
      act.appendChild(shareBtn);

      const favBtn = document.createElement('button');
      favBtn.className = 'action-btn';
      favBtn.dataset.action = 'toggle-favorite';
      favBtn.dataset.msgId = generatedAiMsgId;
      favBtn.dataset.isFavorite = 'false';
      favBtn.innerHTML = '<i data-lucide="heart"></i>';
      act.appendChild(favBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn';
      delBtn.dataset.action = 'delete-message';
      delBtn.dataset.msgId = generatedAiMsgId;
      delBtn.style.cssText = 'margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;';
      delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      act.appendChild(delBtn);

      msgDiv!.appendChild(act);

      console.log(`💾 [СТРИМ #${callId}] СОХРАНЕНИЕ В ЧАТ ${chatId}`);

      const aiMessage = {
        id: generatedAiMsgId,
        text: safeFinalText,
        type: 'ai-msg' as const,
        isFavorite: false,
        created_at: new Date().toISOString()
      };

      targetChat.messages.push(aiMessage);
      chatStoreInstance.save();

      if (userStoreInstance && !userStoreInstance.hasUnlimited()) {
        userStoreInstance.incrementUsage();
      }

      if (userStoreInstance && userStoreInstance.canSync() && targetChat.id) {
        console.log(`☁️ [СТРИМ #${callId}] ОТПРАВКА НА СЕРВЕР (PRO)`);
        const { messageService } = await import('@/services/messages');
        messageService.sendMessage(targetChat.id, safeFinalText, 'ai-msg', {
          isFavorite: false,
          id: generatedAiMsgId
        }).catch((err: Error) => {
          console.error(`❌ [СТРИМ #${callId}] Синхронизация не удалась:`, err);
        });
      }

      const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }

      // ✅ Уведомляем через EventBus
      eventBusInstance.emit('chat:message_added', {
        chatId: chatId,
        message: aiMessage
      });

      console.log(`🟢 [СТРИМ #${callId}] ФИНАЛИЗАЦИЯ ЗАВЕРШЕНА`);
    } else {
      console.warn(`⚠️ [СТРИМ #${callId}] Пустой ответ`);
      uiRendererInstance.hideSkeleton();
      uiRendererInstance.renderMessage('⚠️ Сервер вернул пустой ответ.', 'ai-msg');
    }

    console.log(`🔴 [СТРИМ #${callId}] ===== КОНЕЦ =====`);
    return true;
  } catch (err) {
    console.error(`❌❌❌ [СТРИМ #${callId}] КРИТИЧЕСКИЙ СБОЙ:`, err);
    uiRendererInstance.hideSkeleton();

    if (msgDiv && accumulatedText.trim().length > 0 && !finalizeCalled) {
      console.log(`🟡 [СТРИМ #${callId}] Восстановление после ошибки`);
      finalizeCalled = true;

      generatedAiMsgId = chatStoreInstance.generateUUID();
      msgDiv.id = `msg-block-${generatedAiMsgId}`;

      const disconnectNotice = `${accumulatedText}\n\n[⚠️ Соединение разорвано]`;

      if (typeof (window as any).marked !== 'undefined') {
        try {
          let rawHTML = (window as any).marked.parse(disconnectNotice);
          if (typeof (window as any).DOMPurify !== 'undefined') {
            msgDiv.innerHTML = (window as any).DOMPurify.sanitize(rawHTML);
          } else {
            msgDiv.innerHTML = rawHTML;
          }
        } catch {
          msgDiv.textContent = disconnectNotice;
        }
      } else {
        msgDiv.textContent = disconnectNotice;
      }

      const safeFinalText = typeof disconnectNotice === 'string' ? disconnectNotice : String(disconnectNotice);

      // ✅ data-атрибуты вместо onclick
      const act = document.createElement('div');
      act.className = 'msg-actions';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.dataset.action = 'copy-message';
      copyBtn.dataset.msgId = generatedAiMsgId;
      copyBtn.dataset.tooltip = '📋';
      copyBtn.innerHTML = '<i data-lucide="copy"></i>';
      act.appendChild(copyBtn);

      const shareBtn = document.createElement('button');
      shareBtn.className = 'action-btn';
      shareBtn.dataset.action = 'share-message';
      shareBtn.dataset.msgId = generatedAiMsgId;
      shareBtn.dataset.tooltip = '🔗';
      shareBtn.innerHTML = '<i data-lucide="share-2"></i>';
      act.appendChild(shareBtn);

      const favBtn = document.createElement('button');
      favBtn.className = 'action-btn';
      favBtn.dataset.action = 'toggle-favorite';
      favBtn.dataset.msgId = generatedAiMsgId;
      favBtn.dataset.isFavorite = 'false';
      favBtn.innerHTML = '<i data-lucide="heart"></i>';
      act.appendChild(favBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn';
      delBtn.dataset.action = 'delete-message';
      delBtn.dataset.msgId = generatedAiMsgId;
      delBtn.style.cssText = 'margin-left:auto; background:rgba(231,76,60,0.05); color:#e74c3c;';
      delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      act.appendChild(delBtn);

      msgDiv.appendChild(act);

      const found = chatStoreInstance.findChatById(chatId);
      if (found) {
        const targetChat = found.chat;
        const aiMessage = {
          id: generatedAiMsgId,
          text: safeFinalText,
          type: 'ai-msg' as const,
          isFavorite: false,
          created_at: new Date().toISOString()
        };
        targetChat.messages.push(aiMessage);
        chatStoreInstance.save();

        if (userStoreInstance && !userStoreInstance.hasUnlimited()) {
          userStoreInstance.incrementUsage();
        }

        eventBusInstance.emit('chat:message_added', {
          chatId: chatId,
          message: aiMessage
        });
      } else {
        console.error(`❌ [СТРИМ #${callId}] Не удалось найти чат ${chatId} для сохранения частичного ответа`);
      }
    } else if (!finalizeCalled) {
      uiRendererInstance.renderMessage(`⚠️ Ошибка: ${(err as Error).message || 'Неизвестная ошибка'}`, 'ai-msg');
    }
    return false;
  }
};

console.log('✅ ChatStream v4.0.3 загружен (EventBus-based)');
