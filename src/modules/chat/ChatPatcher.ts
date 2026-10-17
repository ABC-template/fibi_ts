// ============================================
// src/modules/chat/ChatPatcher.ts
// Описание: Точечные обновления DOM для чата
// Версия: 1.4.0 - обновление текста меняет только .msg-content: кнопки действий под ответом
//                 больше не пропадают (Realtime присылал тот же ответ — блок перезаписывался
//                 целиком); сообщение пользователя обновляется текстом, без Markdown;
//                 тот же текст не перерисовывается
//          1.3.0 - Markdown только через utils/html (без DOMPurify — текст, не сырой HTML)
//          1.2.0 - decorator для сообщений с metadata (генерации), updateMessage
//          1.1.1 - замена @types → @app-types
// ============================================

import { uiRenderer } from '@/modules/ui/renderer';
import type { IMessage, UUID } from '@app-types';

export type MessageDecorator = (message: IMessage, element: HTMLElement) => void;

export class ChatPatcher {
  private container: HTMLElement;
  private decorator: MessageDecorator | null = null;
  /** Последний показанный текст блока — повтор (эхо Realtime) не перерисовывается */
  private shownText = new WeakMap<HTMLElement, string>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Хук оформления сообщений: вызывается после отрисовки каждого сообщения
   * и при его обновлении (карточки генераций и т.п.)
   */
  setDecorator(decorator: MessageDecorator | null): void {
    this.decorator = decorator;
  }

  /**
   * Обновить статус избранного (точечно)
   * @param messageId - ID сообщения
   * @param isFavorite - Новый статус избранного
   */
  updateFavorite(messageId: UUID, isFavorite: boolean): void {
    const element = document.getElementById(`msg-block-${messageId}`);
    if (!element) {
      console.warn(`⚠️ [ChatPatcher] Элемент сообщения ${messageId} не найден`);
      return;
    }

    const btn = element.querySelector('[data-action="toggle-favorite"]') as HTMLElement;
    if (!btn) {
      console.warn(`⚠️ [ChatPatcher] Кнопка избранного не найдена для ${messageId}`);
      return;
    }

    // Обновляем класс
    btn.classList.toggle('is-favorite', isFavorite);
    btn.dataset.isFavorite = String(isFavorite);

    // Обновляем иконку через Lucide
    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isFavorite ? 'heart' : 'heart');
      
      // Пересоздаём иконку
      if (typeof (window as any).lucide !== 'undefined') {
        try {
          (window as any).lucide.createIcons({
            root: btn as HTMLElement
          });
        } catch (err) {
          console.warn('⚠️ [ChatPatcher] Ошибка обновления иконки Lucide:', err);
        }
      }
    }

    console.log(`✅ [ChatPatcher] Избранное обновлено: ${messageId} → ${isFavorite}`);
  }

  /**
   * Удалить сообщение с анимацией
   * @param messageId - ID сообщения
   */
  removeMessage(messageId: UUID): void {
    const element = document.getElementById(`msg-block-${messageId}`);
    if (!element) {
      console.warn(`⚠️ [ChatPatcher] Элемент сообщения ${messageId} не найден`);
      return;
    }

    // Плавное исчезновение
    element.style.transition = 'all 0.25s ease';
    element.style.opacity = '0';
    element.style.transform = 'scale(0.95)';

    // Удаляем из DOM после анимации
    setTimeout(() => {
      if (element.parentNode) {
        element.remove();
        console.log(`✅ [ChatPatcher] Сообщение ${messageId} удалено из DOM`);
      }
    }, 250);
  }

  /**
   * Добавить новое сообщение (с защитой от дублирования)
   * @param message - Объект сообщения
   */
  addMessage(message: IMessage): void {
    // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА: Нет ли уже такого сообщения в DOM?
    const existing = document.getElementById(`msg-block-${message.id}`);
    if (existing) {
      console.log(`⚠️ [ChatPatcher] Сообщение ${message.id} уже есть в DOM, пропускаем добавление`);
      return;
    }

    // Проверяем, не пытаемся ли добавить сообщение, которое уже удалено
    if (message.deleted_at) {
      console.log(`⚠️ [ChatPatcher] Сообщение ${message.id} помечено как удалённое, пропускаем`);
      return;
    }

    const element = uiRenderer.renderMessage(
      message.text,
      message.type,
      message.id,
      message.isFavorite || false
    );

    if (element) {
      this.container.appendChild(element);
      this.decorator?.(message, element);
      console.log(`✅ [ChatPatcher] Сообщение ${message.id} добавлено в DOM`);
    } else {
      console.warn(`⚠️ [ChatPatcher] Не удалось отрендерить сообщение ${message.id}`);
    }
  }

  /**
   * Обновить текст AI-сообщения (для стриминга)
   * @param messageId - ID сообщения
   * @param text - Новый текст
   */
  updateMessageText(messageId: UUID, text: string): void {
    const element = document.getElementById(`msg-block-${messageId}`);
    if (!element) {
      console.warn(`⚠️ [ChatPatcher] Элемент сообщения ${messageId} не найден`);
      return;
    }

    // Оформленные сообщения (карточки генераций) текстом не перезаписываем
    if (element.dataset.genSig !== undefined) return;

    // Только блок текста: кнопки действий живут рядом и не трогаются
    let content = element.querySelector('.msg-content') as HTMLElement | null;
    const isUser = element.classList.contains('user-msg');
    if (!content) {
      content = isUser ? document.createElement('span') : uiRenderer.createAIContent();
      content.className = 'msg-content';
      element.insertBefore(content, element.firstChild);
    }

    if (this.shownText.get(content) === text) return;
    this.shownText.set(content, text);

    if (isUser) {
      content.textContent = text;
    } else {
      uiRenderer.fillAIContent(content, text);
    }
  }

  /**
   * Обновить сообщение целиком: сообщения с metadata перерисовываются через
   * decorator, обычные — обновлением текста. Если блока нет, сообщение добавляется.
   */
  updateMessage(message: IMessage): void {
    const element = document.getElementById(`msg-block-${message.id}`);
    if (!element) {
      this.addMessage(message);
      return;
    }

    if ((message.metadata as any)?.kind && this.decorator) {
      this.decorator(message, element);
      return;
    }

    this.updateMessageText(message.id, message.text);
  }

  /**
   * Полная перерисовка (только для загрузки чата)
   * @param messages - Массив сообщений
   */
  renderAll(messages: IMessage[]): void {
    console.log(`🔄 [ChatPatcher] Полная перерисовка: ${messages.length} сообщений`);
    
    this.container.innerHTML = '';

    const sorted = [...messages]
      .filter(m => !m.deleted_at)
      .sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

    for (const msg of sorted) {
      const element = uiRenderer.renderMessage(
        msg.text,
        msg.type,
        msg.id,
        msg.isFavorite || false
      );
      if (element) {
        this.container.appendChild(element);
        this.decorator?.(msg, element);
      }
    }

    console.log(`✅ [ChatPatcher] Полная перерисовка завершена (${sorted.length} сообщений)`);
  }

  /**
   * Очистить контейнер
   */
  clear(): void {
    this.container.innerHTML = '';
    console.log('🧹 [ChatPatcher] Контейнер очищен');
  }

  /**
   * Проверить, существует ли сообщение в DOM
   * @param messageId - ID сообщения
   * @returns true если элемент существует
   */
  hasMessage(messageId: UUID): boolean {
    return !!document.getElementById(`msg-block-${messageId}`);
  }
}
