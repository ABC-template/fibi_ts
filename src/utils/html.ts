// ============================================
// src/utils/html.ts
// Безопасная вставка текста в HTML. Единственное место, где решается,
// что из пользовательского текста / ответа ИИ может попасть в разметку.
//   escapeHtml      — любой текст в шаблон `${...}` (названия чатов, превью,
//                     заметки, ошибки сервера, имена агентов и т.п.)
//   renderMarkdown  — Markdown ответа ИИ → очищенный HTML. Если DOMPurify
//                     не загрузился, Markdown НЕ рендерится: показывается
//                     экранированный текст (раньше сырой HTML шёл в innerHTML)
//   setMarkdown     — то же, сразу в элемент
// Версия: 1.0.0
// ============================================

/** Экранирование для текста и значений атрибутов в кавычках */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Разметка, которую может дать Markdown. Без style (подмена интерфейса поверх
 * приложения), id (перехват id элементов приложения), img (запросы на чужие
 * серверы из ответа ИИ), форм и любых обработчиков событий.
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'i', 'b', 's', 'del',
    'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote',
    'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div', 'hr', 'sub', 'sup',
  ],
  ALLOWED_ATTR: ['href', 'title', 'class', 'target', 'rel', 'align', 'start'],
  // Только обычные ссылки: http(s), почта, Telegram, якоря
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tg):|#)/i,
  ALLOW_DATA_ATTR: false,
};

let hooksInstalled = false;

function getPurify(): any | null {
  const purify = (window as any).DOMPurify;
  if (!purify || typeof purify.sanitize !== 'function') return null;

  if (!hooksInstalled && typeof purify.addHook === 'function') {
    hooksInstalled = true;
    // Ссылки из ответа открываются отдельно и не получают доступ к окну приложения
    purify.addHook('afterSanitizeAttributes', (node: Element) => {
      // Классы — только от Markdown (подсветка кода, обёртка таблиц), не классы приложения
      const cls = node.getAttribute?.('class');
      if (cls) {
        const kept = cls.split(/\s+/).filter((c) => /^(?:language-[\w-]+|table-wrapper)$/.test(c));
        if (kept.length > 0) node.setAttribute('class', kept.join(' '));
        else node.removeAttribute('class');
      }
      if (node.tagName === 'A' && node.getAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    });
  }
  return purify;
}

/** Очистить готовый HTML. null — очистить нечем (DOMPurify не загрузился). */
export function sanitizeRichHtml(html: string): string | null {
  const purify = getPurify();
  if (!purify) return null;
  return String(purify.sanitize(String(html ?? ''), PURIFY_CONFIG));
}

/** Текст как есть (переносы строк сохраняются) — запасной вариант без Markdown */
function plainTextHtml(text: string): string {
  return `<div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(text)}</div>`;
}

/**
 * Markdown → безопасный HTML. Всегда возвращает HTML, который можно вставлять
 * в innerHTML: без marked или DOMPurify — экранированный текст.
 */
export function renderMarkdown(text: string, options: { wrapTables?: boolean } = {}): string {
  const source = String(text ?? '');
  const marked = (window as any).marked;
  if (!marked || typeof marked.parse !== 'function' || !getPurify()) {
    return plainTextHtml(source);
  }

  try {
    let html = String(marked.parse(source));
    if (options.wrapTables) {
      html = html.replace(
        /<table[^>]*>([\s\S]*?)<\/table>/gi,
        '<div class="table-wrapper"><table>$1</table></div>'
      );
    }
    const clean = sanitizeRichHtml(html);
    return clean === null ? plainTextHtml(source) : clean;
  } catch (err) {
    console.warn('⚠️ renderMarkdown: ошибка Markdown, показан текст:', err);
    return plainTextHtml(source);
  }
}

/** Вставить Markdown в элемент безопасно */
export function setMarkdown(el: Element, text: string, options: { wrapTables?: boolean } = {}): void {
  el.innerHTML = renderMarkdown(text, options);
}
