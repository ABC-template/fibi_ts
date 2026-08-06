// ============================================
// api/chats/models.ts
// Описание: Конфигурация моделей ИИ
// Версия: 4.0.1 - FIXED импорт TopicId
// ============================================

import { 
  getTopic, 
  getTopicModel, 
  getTopicTemperature,
  getActiveTopics,
} from '../../src/config/topics';
import type { TopicId } from '../../types/common';

export interface IModelConfig {
  model: string;
  temperature: number;
  systemPrompt: string;
}

/**
 * Получить конфигурацию для топика
 * @param topic - Топик
 * @param isVision - Режим зрения
 * @returns Конфигурация модели
 */
export function getModelConfig(topic: string, isVision: boolean = false): IModelConfig {
  if (isVision) {
    return {
      model: 'openai/gpt-5',
      temperature: 0.4,
      systemPrompt: 'Ты — Versatile AI с поддержкой зрения. Ты видишь прикрепленное изображение и можешь его анализировать. Отвечай подробно о том, что видишь на фото.'
    };
  }

  const topicConfig = getTopic(topic as TopicId);
  
  if (topicConfig) {
    return {
      model: topicConfig.assistant.model,
      temperature: topicConfig.assistant.temperature,
      systemPrompt: topicConfig.assistant.systemPrompt
    };
  }

  // Fallback
  return {
    model: 'openai/gpt-5',
    temperature: 0.4,
    systemPrompt: 'Ты — Versatile AI, универсальный и полезный ассистент.'
  };
}

/**
 * Получить языковую инструкцию
 * @param userLang - Язык пользователя (ru, en, it)
 * @returns Языковая инструкция
 */
export function getLanguageInstruction(userLang: string = 'ru'): string {
  const langMap: Record<string, string> = {
    ru: 'русском языке',
    en: 'английском языке',
    it: 'итальянском языке'
  };
  const targetLangStr = langMap[userLang] || 'русском языке';
  return `[Системная локаль пользователя: ${userLang}]. Instruction: Всегда веди диалог, пиши пояснения и комментарии строго на ${targetLangStr}. Exception: Если пользователь отправляет текст на другом языке с явной просьбой о переводе, анализе, или напрямую просит переключить язык общения — полностью подчиняйся контексту его запроса и отвечай на выбранном им языке.`;
}

/**
 * Получить список ключей OpenRouter
 * @returns Массив ключей
 */
export function getRotatedKeysPool(): string[] {
  const keys: string[] = [];
  let i = 0;
  while (true) {
    const key = process.env[`ROUTER_KEY${i}`];
    if (!key || key.trim().length === 0) break;
    keys.push(key.trim());
    i++;
  }
  return keys;
}

/**
 * Проверить, есть ли доступные ключи
 * @returns true если есть хотя бы один ключ
 */
export function hasAvailableKeys(): boolean {
  const keys = getRotatedKeysPool();
  return keys.length > 0;
}
