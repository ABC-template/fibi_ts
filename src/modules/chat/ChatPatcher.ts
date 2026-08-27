// ============================================
// src/modules/chat/ChatPatcher.ts
// Описание: Точечные обновления DOM для чата
// Версия: 1.1.0 - с защитой от дублирования сообщений
// ============================================

import { uiRenderer } from '@/modules/ui/renderer';
import type { IMessage, UUID } from '@types';

export class ChatPatcher {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
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

    // Находим контейнер с содержимым
    const content = element.querySelector('.msg-content') || element;

    // Форматируем через marked
    if (typeof (window as any).marked !== 'undefined') {
      try {
        let html = (window as any).marked.parse(text);
        
        // Санитайзинг через DOMPurify
        if (typeof (window as any).DOMPurify !== 'undefined') {
          html = (window as any).DOMPurify.sanitize(html, {
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
        
        content.innerHTML = html;
      } catch (err) {
        console.warn('⚠️ [ChatPatcher] Ошибка форматирования через marked:', err);
        content.textContent = text;
      }
    } else {
      content.textContent = text;
    }

    // Обрабатываем кнопки копирования кода
    this._setupCodeCopyButtons(element);

    console.log(`✅ [ChatPatcher] Текст сообщения ${messageId} обновлён (${text.length} символов)`);
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

  /**
   * Настройка кнопок копирования кода внутри элемента
   * @param rootElement - Корневой элемент
   */
  private _setupCodeCopyButtons(rootElement: HTMLElement): void {
    const preElements = rootElement.querySelectorAll('pre');
    
    for (const pre of preElements) {
      // Проверяем, есть ли уже кнопка
      if (pre.parentElement?.querySelector('.code-copy-btn')) {
        continue;
      }

      const codeText = pre.querySelector('code')?.innerText || pre.innerText;
      
      // Оборачиваем pre в wrapper если нужно
      let wrapper = pre.parentElement;
      if (!wrapper || wrapper.tagName !== 'DIV' || !wrapper.classList.contains('code-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper';
        wrapper.style.cssText = 'position: relative; width: 100%;';
        pre.parentNode?.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
      }

      // Создаём кнопку копирования
      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-copy-btn';
      copyBtn.textContent = '📋 Копировать';
      copyBtn.style.cssText = `
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: var(--app-bg-secondary);
        border: 1px solid var(--app-border-color);
        border-radius: 8px;
        font-size: 12px;
        padding: 4px 12px;
        cursor: pointer;
        color: var(--app-text-secondary);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        opacity: 0.9;
        transition: all 0.15s ease;
        z-index: 10;
        min-height: 32px;
      `;
      
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(codeText).then(() => {
          copyBtn.textContent = '✅ Готово!';
          setTimeout(() => {
            copyBtn.textContent = '📋 Копировать';
          }, 1500);
        }).catch(() => {
          copyBtn.textContent = '❌ Ошибка';
          setTimeout(() => {
            copyBtn.textContent = '📋 Копировать';
          }, 1500);
        });
      };

      wrapper.appendChild(copyBtn);
    }
  }
}
