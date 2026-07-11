// ============================================
// src/config/topics.ts
// Центральный конфиг всех тем, ассистентов и их настроек
// Версия: 1.0.0
// 
// 🔧 Как добавить новую тему:
// 1. Добавь объект в массив TOPICS
// 2. Укажи id, label, icon, assistant, systemPrompt
// 3. Всё остальное подхватится автоматически!
// ============================================

import type { TopicId, AssistantTone, AssistantRole, FeatureFlags } from '@types';

// ==========================================
// 1. ОПРЕДЕЛЕНИЯ ТИПОВ ДЛЯ КОНФИГА
// ==========================================

export interface IAssistantConfig {
  role: AssistantRole;
  tone: AssistantTone;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface ITopicConfig {
  id: TopicId;
  label: string;
  shortLabel: string;
  icon: string;
  emoji: string;
  color: string;
  welcome: string;
  assistant: IAssistantConfig;
  features: FeatureFlags;
  isActive: boolean;
  order: number;
}

export interface ITopicsConfig {
  topics: ITopicConfig[];
  defaultTopic: TopicId;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
}

// ==========================================
// 2. СИСТЕМНЫЕ ПРОМПТЫ (вынесены отдельно для читаемости)
// ==========================================

const SYSTEM_PROMPTS = {
  code: `Ты — Versatile AI, Senior Developer и системный архитектор. Твоя специализация — написание чистого, производительного и безопасного кода. Отвечай строго по делу, структурируй ответы, используй комментарии в коде только там, где это действительно необходимо. Ты всегда предлагаешь несколько вариантов решения и объясняешь плюсы и минусы каждого.`,

  creative: `Ты — Versatile AI, гениальный креативный копирайтер, маркетолог и писатель. Пиши живым, вовлекающим и эмоциональным языком. Категорически избегай канцеляризмов, штампов, сухих фраз и шаблонных вступлений. Твои тексты цепляют с первых строк и вызывают эмоции.`,

  fast: `Ты — Versatile AI в режиме экспресс-ответов. Твоя цель — выдать максимально точную, короткую и сжатую суть. Отвечай емко, без лишних приветствий и вводных слов. Только факты, только решение, только суть.`,

  kitchen: `Ты — Versatile AI, опытный шеф-повар со звездами Мишлен и эксперт по кулинарии. Помогаешь пользователям составлять меню, находить идеальные рецепты и объясняешь сложные кулинарные техники простым языком. Даешь советы по сочетанию продуктов и оформлению блюд.`,

  analytics: `Ты — Versatile AI, аналитик данных и бизнес-консультант. Помогаешь анализировать данные, строить гипотезы, делать выводы и структурировать информацию. Отвечаешь четко, логично, с упором на факты и цифры.`,

  // 👇 СЮДА ДОБАВЛЯЙ НОВЫЕ ТЕМЫ
  // marketing: `Ты — Versatile AI, эксперт по маркетингу...`,
  // tutor: `Ты — Versatile AI, репетитор...`,
};

// ==========================================
// 3. WELCOME-ТЕКСТЫ
// ==========================================

const WELCOME_TEXTS = {
  code: 'Привет! Я Versatile AI в режиме Кодинга. Помогу написать чистый код, исправить баги или спроектировать архитектуру. Какой проект разберем? 💻',
  creative: 'Привет! Режим Креатива активирован. Готов написать текст, сценарий, рекламный пост или сгенерировать идеи. Какая задача? ✨',
  fast: 'Йоу! Я Versatile AI в режиме Флуда. Короткие и емкие ответы без лишней воды. Спрашивай! ⚡',
  kitchen: 'Добро пожаловать на кухню Versatile AI! Помогу с рецептами, меню или секретами шеф-поваров. Что готовим? 🍳',
  analytics: 'Режим Аналитики. Готов к разбору задач, анализу данных и документов. 📊',
  // 👇 СЮДА ДОБАВЛЯЙ НОВЫЕ ТЕМЫ
  // marketing: 'Привет! Режим Маркетинга активирован...',
  // tutor: 'Добро пожаловать! Я репетитор...',
};

// ==========================================
// 4. ОСНОВНОЙ МАССИВ ТЕМ
// ==========================================

export const TOPICS: ITopicConfig[] = [
  {
    id: 'code',
    label: 'Кодинг',
    shortLabel: '#кодинг',
    icon: '💻',
    emoji: '💻',
    color: '#D4AF37',
    welcome: WELCOME_TEXTS.code,
    isActive: true,
    order: 0,
    features: {
      imageSupport: false,
      voiceSupport: true,
      fileUpload: false,
      codeHighlighting: true,
    },
    assistant: {
      role: 'developer',
      tone: 'professional',
      systemPrompt: SYSTEM_PROMPTS.code,
      model: 'deepseek/deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
    },
  },
  {
    id: 'creative',
    label: 'Креатив',
    shortLabel: '#креатив',
    icon: '🎨',
    emoji: '🎨',
    color: '#E74C3C',
    welcome: WELCOME_TEXTS.creative,
    isActive: true,
    order: 1,
    features: {
      imageSupport: false,
      voiceSupport: true,
      fileUpload: false,
      codeHighlighting: false,
    },
    assistant: {
      role: 'copywriter',
      tone: 'creative',
      systemPrompt: SYSTEM_PROMPTS.creative,
      model: 'openai/gpt-4o',
      temperature: 0.9,
      maxTokens: 4096,
    },
  },
  {
    id: 'fast',
    label: 'Флуд',
    shortLabel: '#флуд',
    icon: '⚡',
    emoji: '⚡',
    color: '#F39C12',
    welcome: WELCOME_TEXTS.fast,
    isActive: true,
    order: 2,
    features: {
      imageSupport: false,
      voiceSupport: true,
      fileUpload: false,
      codeHighlighting: false,
    },
    assistant: {
      role: 'assistant',
      tone: 'concise',
      systemPrompt: SYSTEM_PROMPTS.fast,
      model: 'google/gemini-2.5-flash',
      temperature: 0.5,
      maxTokens: 2048,
    },
  },
  {
    id: 'kitchen',
    label: 'Кухня',
    shortLabel: '#кухня',
    icon: '🍳',
    emoji: '🍳',
    color: '#27AE60',
    welcome: WELCOME_TEXTS.kitchen,
    isActive: true,
    order: 3,
    features: {
      imageSupport: false,
      voiceSupport: true,
      fileUpload: false,
      codeHighlighting: false,
    },
    assistant: {
      role: 'chef',
      tone: 'friendly',
      systemPrompt: SYSTEM_PROMPTS.kitchen,
      model: 'google/gemini-2.5-flash',
      temperature: 0.6,
      maxTokens: 4096,
    },
  },
  {
    id: 'analytics',
    label: 'Аналитика',
    shortLabel: '#аналитика',
    icon: '📊',
    emoji: '📊',
    color: '#2980B9',
    welcome: WELCOME_TEXTS.analytics,
    isActive: true,
    order: 4,
    features: {
      imageSupport: false,
      voiceSupport: true,
      fileUpload: false,
      codeHighlighting: false,
    },
    assistant: {
      role: 'analyst',
      tone: 'professional',
      systemPrompt: SYSTEM_PROMPTS.analytics,
      model: 'openai/gpt-5',
      temperature: 0.4,
      maxTokens: 4096,
    },
  },

  // ==========================================
  // 👇 СЮДА ДОБАВЛЯЙ НОВЫЕ ТЕМЫ
  // ==========================================
  // {
  //   id: 'marketing',
  //   label: 'Маркетинг',
  //   shortLabel: '#маркетинг',
  //   icon: '📈',
  //   emoji: '📈',
  //   color: '#8E44AD',
  //   welcome: WELCOME_TEXTS.marketing,
  //   isActive: true,
  //   order: 5,
  //   features: {
  //     imageSupport: false,
  //     voiceSupport: true,
  //     fileUpload: false,
  //     codeHighlighting: false,
  //   },
  //   assistant: {
  //     role: 'marketer',
  //     tone: 'persuasive',
  //     systemPrompt: SYSTEM_PROMPTS.marketing,
  //     model: 'openai/gpt-4o',
  //     temperature: 0.7,
  //     maxTokens: 4096,
  //   },
  // },
];

// ==========================================
// 5. ГЛОБАЛЬНЫЕ НАСТРОЙКИ
// ==========================================

export const CONFIG: ITopicsConfig = {
  topics: TOPICS,
  defaultTopic: 'code',
  defaultModel: 'openai/gpt-4o',
  defaultTemperature: 0.4,
  defaultMaxTokens: 4096,
};

// ==========================================
// 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

/**
 * Получить тему по ID
 */
export function getTopic(id: TopicId): ITopicConfig | undefined {
  return TOPICS.find(t => t.id === id);
}

/**
 * Получить все активные темы (отсортированные по order)
 */
export function getActiveTopics(): ITopicConfig[] {
  return TOPICS
    .filter(t => t.isActive)
    .sort((a, b) => a.order - b.order);
}

/**
 * Получить список ID всех тем
 */
export function getTopicIds(): TopicId[] {
  return TOPICS.map(t => t.id);
}

/**
 * Получить настройки ассистента для темы
 */
export function getAssistantConfig(topicId: TopicId): IAssistantConfig | undefined {
  const topic = getTopic(topicId);
  return topic?.assistant;
}

/**
 * Получить системный промпт для темы
 */
export function getSystemPrompt(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.assistant?.systemPrompt || CONFIG.defaultModel;
}

/**
 * Получить welcome-текст для темы
 */
export function getWelcomeText(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.welcome || 'Привет! Я Versatile AI. Чем могу помочь?';
}

/**
 * Получить название темы
 */
export function getTopicLabel(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.label || topicId;
}

/**
 * Получить короткое название темы
 */
export function getTopicShortLabel(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.shortLabel || `#${topicId}`;
}

/**
 * Получить иконку темы
 */
export function getTopicIcon(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.icon || '💬';
}

/**
 * Получить эмодзи темы
 */
export function getTopicEmoji(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.emoji || '💬';
}

/**
 * Получить цвет темы
 */
export function getTopicColor(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.color || '#D4AF37';
}

/**
 * Проверить, существует ли тема
 */
export function isValidTopic(topicId: string): topicId is TopicId {
  return TOPICS.some(t => t.id === topicId);
}

/**
 * Получить модель для темы
 */
export function getTopicModel(topicId: TopicId): string {
  const topic = getTopic(topicId);
  return topic?.assistant?.model || CONFIG.defaultModel;
}

/**
 * Получить температуру для темы
 */
export function getTopicTemperature(topicId: TopicId): number {
  const topic = getTopic(topicId);
  return topic?.assistant?.temperature || CONFIG.defaultTemperature;
}

/**
 * Получить максимальное количество токенов для темы
 */
export function getTopicMaxTokens(topicId: TopicId): number {
  const topic = getTopic(topicId);
  return topic?.assistant?.maxTokens || CONFIG.defaultMaxTokens;
}

/**
 * Получить настройки фич для темы
 */
export function getTopicFeatures(topicId: TopicId): FeatureFlags {
  const topic = getTopic(topicId);
  return topic?.features || {
    imageSupport: false,
    voiceSupport: true,
    fileUpload: false,
    codeHighlighting: false,
  };
}

// ==========================================
// 7. ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ (легаси)
// ==========================================

// Эти объекты оставлены для плавного перехода.
// Постепенно убирай их использование в пользу прямого импорта из конфига.

export const topicNames: Record<TopicId, string> = Object.fromEntries(
  TOPICS.map(t => [t.id, t.label])
) as Record<TopicId, string>;

export const topicShortNames: Record<TopicId, string> = Object.fromEntries(
  TOPICS.map(t => [t.id, t.shortLabel])
) as Record<TopicId, string>;

export const welcomeTexts: Record<TopicId, string> = Object.fromEntries(
  TOPICS.map(t => [t.id, t.welcome])
) as Record<TopicId, string>;

console.log('✅ Topics config v1.0.0 загружен');
