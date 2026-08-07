// ============================================
// src/config/achievements.ts
// Список достижений и заданий с поддержкой i18n
// Версия: 2.0.0
// ============================================

export interface IAchievementConfig {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  target: number;
  reward: number;
}

export interface IQuestConfig {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  target: number;
  reward: number;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function getUserLang(): string {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const lang = tg?.initDataUnsafe?.user?.language_code || 'ru';
    return ['ru', 'en', 'it'].includes(lang) ? lang : 'ru';
  } catch {
    return 'ru';
  }
}

export function t(record: Record<string, string>): string {
  const lang = getUserLang();
  return record[lang] || record['ru'] || Object.values(record)[0] || '';
}

// ============================================
// ДОСТИЖЕНИЯ
// ============================================

export const ACHIEVEMENTS: IAchievementConfig[] = [
  {
    id: 'first_chat',
    title: {
      ru: '🚀 Первый чат',
      en: '🚀 First Chat',
      it: '🚀 Prima Chat',
    },
    description: {
      ru: 'Создай свой первый чат',
      en: 'Create your first chat',
      it: 'Crea la tua prima chat',
    },
    target: 1,
    reward: 10,
  },
  {
    id: 'chat_100',
    title: {
      ru: '💬 100 сообщений',
      en: '💬 100 Messages',
      it: '💬 100 Messaggi',
    },
    description: {
      ru: 'Отправь 100 сообщений в чатах',
      en: 'Send 100 messages in chats',
      it: 'Invia 100 messaggi nelle chat',
    },
    target: 100,
    reward: 50,
  },
  {
    id: 'todo_50',
    title: {
      ru: '📋 50 задач в To-Do',
      en: '📋 50 To-Do Tasks',
      it: '📋 50 Compiti in To-Do',
    },
    description: {
      ru: 'Добавь 50 задач в органайзер',
      en: 'Add 50 tasks to organizer',
      it: 'Aggiungi 50 compiti all\'organizer',
    },
    target: 50,
    reward: 30,
  },
  {
    id: 'assistants_5',
    title: {
      ru: '👥 5 ассистентов',
      en: '👥 5 Assistants',
      it: '👥 5 Assistenti',
    },
    description: {
      ru: 'Используй 5 разных ассистентов',
      en: 'Use 5 different assistants',
      it: 'Usa 5 assistenti diversi',
    },
    target: 5,
    reward: 40,
  },
  {
    id: 'streak_7',
    title: {
      ru: '🔥 Стрик 7 дней',
      en: '🔥 7 Day Streak',
      it: '🔥 Streak di 7 Giorni',
    },
    description: {
      ru: 'Заходи в приложение 7 дней подряд',
      en: 'Open the app for 7 days in a row',
      it: 'Apri l\'app per 7 giorni di fila',
    },
    target: 7,
    reward: 50,
  },
  {
    id: 'streak_30',
    title: {
      ru: '🔥 Стрик 30 дней',
      en: '🔥 30 Day Streak',
      it: '🔥 Streak di 30 Giorni',
    },
    description: {
      ru: 'Заходи в приложение 30 дней подряд',
      en: 'Open the app for 30 days in a row',
      it: 'Apri l\'app per 30 giorni di fila',
    },
    target: 30,
    reward: 200,
  },
  {
    id: 'coins_100',
    title: {
      ru: '🪙 100 монет',
      en: '🪙 100 Coins',
      it: '🪙 100 Monete',
    },
    description: {
      ru: 'Заработай 100 Fibi Coins',
      en: 'Earn 100 Fibi Coins',
      it: 'Guadagna 100 Fibi Coins',
    },
    target: 100,
    reward: 20,
  },
  {
    id: 'reminder_10',
    title: {
      ru: '⏰ 10 напоминаний',
      en: '⏰ 10 Reminders',
      it: '⏰ 10 Promemoria',
    },
    description: {
      ru: 'Создай 10 напоминаний',
      en: 'Create 10 reminders',
      it: 'Crea 10 promemoria',
    },
    target: 10,
    reward: 25,
  },
];

// ============================================
// ЕЖЕДНЕВНЫЕ ЗАДАНИЯ
// ============================================

export const DAILY_QUESTS: IQuestConfig[] = [
  {
    id: 'send_message_1',
    title: {
      ru: '📝 Отправить 1 сообщение',
      en: '📝 Send 1 Message',
      it: '📝 Invia 1 Messaggio',
    },
    description: {
      ru: 'Напиши сообщение в чат с AI',
      en: 'Write a message in AI chat',
      it: 'Scrivi un messaggio nella chat AI',
    },
    target: 1,
    reward: 5,
  },
  {
    id: 'send_message_5',
    title: {
      ru: '📝 Отправить 5 сообщений',
      en: '📝 Send 5 Messages',
      it: '📝 Invia 5 Messaggi',
    },
    description: {
      ru: 'Отправь 5 сообщений в чат с AI',
      en: 'Send 5 messages in AI chat',
      it: 'Invia 5 messaggi nella chat AI',
    },
    target: 5,
    reward: 10,
  },
  {
    id: 'add_todo',
    title: {
      ru: '✅ Добавить задачу в To-Do',
      en: '✅ Add Task to To-Do',
      it: '✅ Aggiungi Compito a To-Do',
    },
    description: {
      ru: 'Создай новую задачу в органайзере',
      en: 'Create a new task in organizer',
      it: 'Crea un nuovo compito nell\'organizer',
    },
    target: 1,
    reward: 3,
  },
  {
    id: 'complete_todo_3',
    title: {
      ru: '✅ Выполнить 3 задачи',
      en: '✅ Complete 3 Tasks',
      it: '✅ Completa 3 Compiti',
    },
    description: {
      ru: 'Отметь 3 задачи как выполненные',
      en: 'Mark 3 tasks as completed',
      it: 'Segna 3 compiti come completati',
    },
    target: 3,
    reward: 8,
  },
  {
    id: 'create_reminder',
    title: {
      ru: '⏰ Создать напоминание',
      en: '⏰ Create Reminder',
      it: '⏰ Crea Promemoria',
    },
    description: {
      ru: 'Поставь будильник в органайзере',
      en: 'Set an alarm in organizer',
      it: 'Imposta un allarme nell\'organizer',
    },
    target: 1,
    reward: 5,
  },
  {
    id: 'daily_login',
    title: {
      ru: '📆 Ежедневный вход',
      en: '📆 Daily Login',
      it: '📆 Accesso Giornaliero',
    },
    description: {
      ru: 'Заходи в приложение каждый день',
      en: 'Open the app every day',
      it: 'Apri l\'app ogni giorno',
    },
    target: 1,
    reward: 2,
  },
];

export const DAILY_BONUS_AMOUNT = 2;

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ UI
// ============================================

export function getLocalizedAchievement(id: string): IAchievementConfig | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

export function getLocalizedQuest(id: string): IQuestConfig | undefined {
  return DAILY_QUESTS.find(q => q.id === id);
}

export function getAchievementTitle(id: string): string {
  const config = getLocalizedAchievement(id);
  return config ? t(config.title) : id;
}

export function getAchievementDescription(id: string): string {
  const config = getLocalizedAchievement(id);
  return config ? t(config.description) : '';
}

export function getQuestTitle(id: string): string {
  const config = getLocalizedQuest(id);
  return config ? t(config.title) : id;
}

export function getQuestDescription(id: string): string {
  const config = getLocalizedQuest(id);
  return config ? t(config.description) : '';
}

// Алиасы для удобства
export const tAchievement = getAchievementTitle;
export const tQuest = getQuestTitle;
