// ============================================
// api/chat/prompts.ts
// Описание: Системные промпты для ИИ
// Версия: 4.0.0 - с использованием конфига
// ============================================

import { getSystemPrompt, getTopic, getTopicTemperature, getTopicModel } from '../../src/config/topics';
import type { TopicId } from '../../types/common';

/**
 * Собрать системный промпт
 * @param topic - Топик
 * @param userLang - Язык пользователя
 * @param isVision - Режим зрения
 * @param extraInstructions - Дополнительные инструкции
 * @returns Системный промпт
 */
export function buildSystemPrompt(
  topic: string,
  userLang: string = 'ru',
  isVision: boolean = false,
  extraInstructions: string = ''
): string {
  let basePrompt: string;

  // Получаем промпт из конфига
  const topicConfig = getTopic(topic as TopicId);
  
  if (isVision) {
    // Vision mode — специальный промпт
    basePrompt = `Ты — Versatile AI с поддержкой зрения. Ты видишь прикрепленное изображение и можешь его анализировать. Отвечай подробно о том, что видишь на фото.`;
  } else if (topicConfig) {
    basePrompt = topicConfig.assistant.systemPrompt;
  } else {
    // Fallback
    basePrompt = 'Ты — Versatile AI, универсальный и полезный ассистент.';
  }

  // Добавляем языковую инструкцию
  const LANG_MAP: Record<string, string> = {
    ru: 'русском языке',
    en: 'английском языке',
    it: 'итальянском языке'
  };
  const targetLangStr = LANG_MAP[userLang] || 'русском языке';
  const langInstruction = `[Системная локаль пользователя: ${userLang}]. Instruction: Всегда веди диалог, пиши пояснения и комментарии строго на ${targetLangStr}. Exception: Если пользователь отправляет текст на другом языке с явной просьбой о переводе, анализе, или напрямую просит переключить язык общения — полностью подчиняйся контексту его запроса и отвечай на выбранном им языке.`;

  // Инструкция по форматированию
  const formattingInstruction = `
[Форматирование ответа]
- Разделяй смысловые блоки ПУСТОЙ СТРОКОЙ (двойной перенос \\n\\n). Это создает отдельные абзацы.
- Для диалогов, анекдотов и историй разделяй реплики персонажей ПУСТЫМИ СТРОКАМИ.
- Используй **жирный** текст для выделения важных моментов.
- Для списков используй маркеры: - пункт.
- Код оборачивай в тройные обратные кавычки с указанием языка (например, \`\`\`javascript).
- Не используй HTML-теги, только Markdown разметку.
`;

  let finalPrompt = `${basePrompt}\n\n${langInstruction}\n\n${formattingInstruction}`;

  if (extraInstructions) {
    finalPrompt += `\n\n${extraInstructions}`;
  }

  return finalPrompt;
}

/**
 * Собрать сообщения для OpenRouter
 * @param systemPrompt - Системный промпт
 * @param historyMessages - История сообщений
 * @param attachedImage - Base64 изображение (опционально)
 * @param userMessage - Текущее сообщение пользователя (опционально)
 * @returns Массив сообщений для API
 */
export function buildMessages(
  systemPrompt: string,
  historyMessages: Array<{ type: string; text: string; role?: string }> = [],
  attachedImage?: string,
  userMessage?: string
): Array<{ role: string; content: string | any[] }> {
  const messages: Array<{ role: string; content: string | any[] }> = [];

  // Добавляем системный промпт
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  let lastRole: string | null = null;

  // Добавляем историю
  for (const msg of historyMessages) {
    let role: string;
    if (msg.role) {
      role = msg.role;
    } else if (msg.type === 'user-msg') {
      role = 'user';
    } else {
      role = 'assistant';
    }
    
    const text = String(msg.text || '').trim();

    if (!text) continue;

    // Пропускаем дублирующиеся роли
    if (lastRole === role) continue;

    messages.push({ role, content: text });
    lastRole = role;
  }

  // Добавляем текущее сообщение пользователя
  if (userMessage) {
    const hasImage = attachedImage && attachedImage.trim().length > 0;
    const cleanedText = userMessage.replace('📸 [Прикреплено изображение]', '').trim() || 'Что изображено на фото?';

    if (hasImage) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: cleanedText },
          {
            type: 'image_url',
            image_url: {
              url: attachedImage,
              detail: 'high'
            }
          }
        ]
      });
    } else {
      messages.push({ role: 'user', content: cleanedText });
    }
  }

  return messages;
}
