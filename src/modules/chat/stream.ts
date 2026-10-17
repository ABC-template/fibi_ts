// ============================================
// src/modules/chat/stream.ts
// Стриминг ответов от ИИ (с поддержкой агентов)
// Версия: 4.9.0 — ответ и сообщения об ошибках показываются только в своём чате (ушли в
//                  другой — ответ сохранится и появится при возврате); под ответом время
//                  (справа от кнопок действий); блок хранит дату для разделителей дней
//          4.8.0 — блок ответа строится как в renderer: текст в .msg-content, кнопки
//                  действий рядом (общий createMessageActions вместо двух копий кода);
//                  эхо Realtime обновляет только текст и больше не стирает кнопки
//          4.7.0 — 403 «нет доступа к приложению» (блок / канал) открывает заглушку
//          4.6.0 — Markdown только через utils/html: если DOMPurify не загрузился,
//                  ответ показывается текстом (раньше сырой HTML модели шёл в innerHTML)
//          4.5.0 — «пульс» сервера вырезается, ошибка до первого слова показывается
//                  понятным текстом; обрыв, если 40 с не приходит ничего;
//                  вместо «signal is aborted» — «Сервер не ответил вовремя»
//          4.4.0 — chatId уходит на сервер (замок чата); обработка 409:
//                  в чате уже идёт запрос
//          4.3.0 — передача attachedFile в /api/chat/stream; починена
//                  устаревшая причина отказа 'role' (теперь auth/tier/
//                  inactive, хвост от редизайна доступа к агентам);
//                  добавлена обработка 413 (файл слишком большой)
// ============================================

import { chatStore } from '@/store/ChatStore';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';
import { eventBus } from '@/core/event-bus';
import { isChatOpen } from './open-chat';
import type { UUID, TopicId } from '@app-types';

let streamCallCounter = 0;

/** Протокол с api/chat/stream.ts: невидимый «пульс» и префикс ошибки */
const STREAM_HEARTBEAT = '\u0000';
const STREAM_ERROR_MARK = '\u0001';

(window as any).streamAiResponse = async function(
  historyMessages: Array<{ type: string; text: string }>,
  topic: TopicId,
  userLang: string,
  attachedImage: string | null,
  chatId: UUID,
  agentId: string | null = null,
  attachedFile: { name: string; content: string } | null = null
): Promise<boolean> {
  const callId = ++streamCallCounter;
  console.log(`🔴 [СТРИМ #${callId}] ===== НАЧАЛО =====`);
  console.log(`🔴 [СТРИМ #${callId}] chatId: ${chatId}, topic: ${topic}, agentId: ${agentId}, history: ${historyMessages?.length || 0} сообщений`);

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
  let chunksReceived = 0;
  let finalizeCalled = false;
  let generatedAiMsgId: UUID | null = null;


  /** Сообщение об ошибке — только если на экране этот чат */
  const notice = (text: string): void => {
    uiRendererInstance.hideSkeleton();
    if (isChatOpen(chatId)) uiRendererInstance.renderMessage(text, 'ai-msg');
  };

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
      attachedImage: attachedImage || null,
      attachedFile: attachedFile || null,
      agentId: agentId,
      chatId: chatId,
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
      
      if (response.status === 403) {
        // Нет доступа к приложению (блокировка / подписка на канал) — общая заглушка
        let body: any = null;
        try { body = JSON.parse(text); } catch {}
        if (body?.code === 'blocked' || body?.code === 'channel_required') {
          window.dispatchEvent(new CustomEvent('fibi:access-denied', { detail: body }));
          notice(String(body.error || 'Нет доступа'));
          return false;
        }
        const accessReason = response.headers.get('X-Access-Reason') || 'unknown';
        const agentSlug = response.headers.get('X-Agent-Slug') || 'агента';
        let errorMessage = `⛔ Доступ к агенту "${agentSlug}" запрещён.`;
        if (accessReason === 'tier') {
          errorMessage += ' Требуется более высокий уровень подписки.';
        } else if (accessReason === 'inactive') {
          errorMessage += ' Агент временно недоступен.';
        } else if (accessReason === 'auth') {
          errorMessage += ' Войдите в приложение.';
        }
        notice(errorMessage);
        return false;
      }

      if (response.status === 413) {
        notice(`⚠️ ${text}`);
        return false;
      }

      if (response.status === 409) {
        // В этом чате ещё идёт предыдущий запрос (например, после перезагрузки
        // приложения или с другого устройства)
        let busyText = 'Предыдущий запрос в этом чате ещё выполняется. Дождитесь ответа.';
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error) busyText = parsed.error;
        } catch {
          // не JSON — оставляем текст по умолчанию
        }
        notice(`⏳ ${busyText}`);
        return false;
      }

      throw new Error(`Ошибка ${response.status}: ${text.substring(0, 200)}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');

    // Сервер открывает ответ сразу и, пока модель думает, шлёт невидимый «пульс»
    // (\u0000). Если долго не приходит вообще ничего — соединение повисло.
    const IDLE_TIMEOUT_MS = 40_000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.warn(`⏰ [СТРИМ #${callId}] Нет данных ${IDLE_TIMEOUT_MS / 1000} с — обрываем`);
        reader.cancel().catch(() => {});
      }, IDLE_TIMEOUT_MS);
    };
    armIdle();
    let serverError: string | null = null;
    let controlBuf = '';

    console.log(`📡 [СТРИМ #${callId}] Начинаем чтение стрима...`);

    msgDiv = document.createElement('div');
    msgDiv.className = 'msg ai-msg msg-animated';
    msgDiv.id = `msg-block-${Date.now()}-${callId}`;
    msgDiv.setAttribute('data-sanitized', 'true');
    uiRendererInstance.stampBlock(msgDiv, new Date().toISOString());
    // Текст ответа — отдельный блок: кнопки действий добавляются рядом при финализации
    const contentDiv = uiRendererInstance.createAIContent();
    msgDiv.appendChild(contentDiv);

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
        if (idleTimer) clearTimeout(idleTimer);
        console.log(`📡 [СТРИМ #${callId}] Стрим завершен, получено ${chunksReceived} чанков`);
        break;
      }
      armIdle();

      chunksReceived++;
      let chunk = decoder.decode(value, { stream: true });

      // Ошибка сервера до первого слова: \u0000\u0001 + JSON (может прийти частями)
      // Маркер — символ \u0001 (в тексте модели его не бывает); «пульс» \u0000 перед ним
      // мог прийти отдельным куском
      if (chunk.indexOf(STREAM_ERROR_MARK) !== -1 || controlBuf) {
        controlBuf += chunk;
        const at = controlBuf.indexOf(STREAM_ERROR_MARK);
        if (at !== -1) {
          try {
            const parsed = JSON.parse(controlBuf.slice(at + 1));
            serverError = parsed?.error || 'Ошибка сервера';
          } catch {
            // JSON ещё не дошёл целиком — ждём следующий кусок
          }
        }
        continue;
      }

      chunk = chunk.split(STREAM_HEARTBEAT).join('');
      if (!chunk) continue;
      accumulatedText += chunk;

      if (accumulatedText.trim().length === 0) continue;

      // Блок в ленте — только пока открыт этот чат (вернулись в чат — блок встаёт снова)
      if (!msgDiv.isConnected && isChatOpen(chatId)) {
        uiRendererInstance.hideSkeleton();
        container.appendChild(msgDiv);
      }
      uiRendererInstance.fillAIContent(contentDiv, accumulatedText);
      if (msgDiv.isConnected) smartScroll();
    }

    console.log(`📊 [СТРИМ #${callId}] Итог: ${chunksReceived} чанков, ${accumulatedText.length} символов`);

    if (serverError && accumulatedText.trim().length === 0) {
      notice(`⚠️ ${serverError}`);
      return false;
    }
    if (controlBuf && !serverError && accumulatedText.trim().length === 0) {
      notice('⚠️ Не удалось получить ответ модели. Энергия не списана — попробуйте ещё раз.');
      return false;
    }

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
      const createdAt = new Date().toISOString();

      uiRendererInstance.stampBlock(msgDiv!, createdAt);
      msgDiv!.appendChild(uiRendererInstance.createMessageActions(generatedAiMsgId, false, createdAt));

      console.log(`💾 [СТРИМ #${callId}] СОХРАНЕНИЕ В ЧАТ ${chatId}`);

      const aiMessage = {
        id: generatedAiMsgId,
        text: safeFinalText,
        type: 'ai-msg' as const,
        isFavorite: false,
        created_at: createdAt
      };

      targetChat.messages.push(aiMessage);
      chatStoreInstance.save();


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

      eventBusInstance.emit('chat:message_added', {
        chatId: chatId,
        message: aiMessage
      });

      console.log(`🟢 [СТРИМ #${callId}] ФИНАЛИЗАЦИЯ ЗАВЕРШЕНА`);

      // Обновить энергию в шапке чата без перехода в Экономику
      try {
        const { economyStore } = await import('@/economy/EconomyStore');
        await economyStore.loadBalances();
        eventBusInstance.emit('economy:tokens:updated', economyStore.getTokenBalances());
      } catch (e) {
        console.warn('⚠️ [СТРИМ] Не удалось обновить баланс токенов:', e);
      }
    } else {
      console.warn(`⚠️ [СТРИМ #${callId}] Пустой ответ`);
      notice('⚠️ Сервер вернул пустой ответ.');
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

      const brokenContent = (msgDiv.querySelector('.msg-content') as HTMLElement | null) || uiRendererInstance.createAIContent();
      if (!brokenContent.parentNode) msgDiv.appendChild(brokenContent);
      uiRendererInstance.fillAIContent(brokenContent, disconnectNotice);

      const safeFinalText = typeof disconnectNotice === 'string' ? disconnectNotice : String(disconnectNotice);
      const createdAt = new Date().toISOString();

      uiRendererInstance.stampBlock(msgDiv, createdAt);
      msgDiv.appendChild(uiRendererInstance.createMessageActions(generatedAiMsgId, false, createdAt));

      const found = chatStoreInstance.findChatById(chatId);
      if (found) {
        const targetChat = found.chat;
        const aiMessage = {
          id: generatedAiMsgId,
          text: safeFinalText,
          type: 'ai-msg' as const,
          isFavorite: false,
          created_at: createdAt
        };
        targetChat.messages.push(aiMessage);
        chatStoreInstance.save();


        eventBusInstance.emit('chat:message_added', {
          chatId: chatId,
          message: aiMessage
        });
      } else {
        console.error(`❌ [СТРИМ #${callId}] Не удалось найти чат ${chatId} для сохранения частичного ответа`);
      }
    } else if (!finalizeCalled) {
      const isAbort = (err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError';
      notice(
        isAbort
          ? '⚠️ Сервер не ответил вовремя. Энергия не списана — попробуйте ещё раз.'
          : `⚠️ Ошибка: ${(err as Error).message || 'Неизвестная ошибка'}`
      );
    }
    return false;
  }
};
