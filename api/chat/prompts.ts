// ============================================
// api/chat/prompts.ts
// Описание: Системные промпты для ИИ
// Версия: 5.0.0 - buildMessages: роль только по типу сообщения (роль от клиента не
//                 принимается), склейка подряд идущих сообщений одной роли,
//                 изображение прикрепляется к последнему сообщению пользователя
//                 (раньше не отправлялось вовсе)
//          4.0.0 - с использованием конфига
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

export interface IHistoryMessage {
  type: string;
  text: string;
}

/**
 * Собрать сообщения для OpenRouter.
 * Роль определяется только типом сообщения (user-msg → user, ai-msg → assistant):
 * роль из запроса клиента не принимается — иначе можно подложить свой system.
 * Подряд идущие сообщения одной роли склеиваются (раньше лишние отбрасывались,
 * и после неудачного ответа модель получала старый вопрос вместо нового).
 * Изображение прикрепляется к последнему сообщению пользователя.
 */
export function buildMessages(
  systemPrompt: string,
  historyMessages: IHistoryMessage[] = [],
  attachedImage?: string
): Array<{ role: string; content: string | any[] }> {
  const messages: Array<{ role: string; content: string | any[] }> = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of historyMessages) {
    const role = msg?.type === 'user-msg' ? 'user' : msg?.type === 'ai-msg' ? 'assistant' : null;
    if (!role) continue;

    const text = String(msg.text || '').trim();
    if (!text) continue;

    const last = messages[messages.length - 1];
    if (last && last.role === role && typeof last.content === 'string') {
      last.content += `\n\n${text}`;
    } else {
      messages.push({ role, content: text });
    }
  }

  if (attachedImage && attachedImage.trim().length > 0) {
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUser = i;
        break;
      }
    }
    const imagePart = { type: 'image_url', image_url: { url: attachedImage, detail: 'high' } };
    if (lastUser >= 0) {
      const text = String(messages[lastUser].content).replace('📸 [Прикреплено изображение]', '').trim();
      messages[lastUser].content = [{ type: 'text', text: text || 'Что изображено на фото?' }, imagePart];
    } else {
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Что изображено на фото?' }, imagePart] });
    }
  }

  return messages;
}
