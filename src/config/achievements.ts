// ============================================
// src/config/achievements.ts
// Список достижений (синхронизирован с сервером)
// Версия: 1.0.0
// ============================================

export interface IAchievementConfig {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number;
}

export const ACHIEVEMENTS: IAchievementConfig[] = [
  {
    id: 'first_chat',
    title: '🚀 Первый чат',
    description: 'Создай свой первый чат',
    target: 1,
    reward: 10,
  },
  {
    id: 'chat_100',
    title: '💬 100 сообщений',
    description: 'Отправь 100 сообщений в чатах',
    target: 100,
    reward: 50,
  },
  {
    id: 'todo_50',
    title: '📋 50 задач в To-Do',
    description: 'Добавь 50 задач в органайзер',
    target: 50,
    reward: 30,
  },
  {
    id: 'assistants_5',
    title: '👥 5 ассистентов',
    description: 'Используй 5 разных ассистентов',
    target: 5,
    reward: 40,
  },
  {
    id: 'streak_7',
    title: '🔥 Стрик 7 дней',
    description: 'Заходи в приложение 7 дней подряд',
    target: 7,
    reward: 50,
  },
  {
    id: 'streak_30',
    title: '🔥 Стрик 30 дней',
    description: 'Заходи в приложение 30 дней подряд',
    target: 30,
    reward: 200,
  },
  {
    id: 'coins_100',
    title: '🪙 100 монет',
    description: 'Заработай 100 Fibi Coins',
    target: 100,
    reward: 20,
  },
  {
    id: 'reminder_10',
    title: '⏰ 10 напоминаний',
    description: 'Создай 10 напоминаний',
    target: 10,
    reward: 25,
  },
];

export const DAILY_QUESTS: Array<{
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number;
}> = [
  {
    id: 'send_message_1',
    title: '📝 Отправить 1 сообщение',
    description: 'Напиши сообщение в чат с AI',
    target: 1,
    reward: 5,
  },
  {
    id: 'send_message_5',
    title: '📝 Отправить 5 сообщений',
    description: 'Отправь 5 сообщений в чат с AI',
    target: 5,
    reward: 10,
  },
  {
    id: 'add_todo',
    title: '✅ Добавить задачу в To-Do',
    description: 'Создай новую задачу в органайзере',
    target: 1,
    reward: 3,
  },
  {
    id: 'complete_todo_3',
    title: '✅ Выполнить 3 задачи',
    description: 'Отметь 3 задачи как выполненные',
    target: 3,
    reward: 8,
  },
  {
    id: 'create_reminder',
    title: '⏰ Создать напоминание',
    description: 'Поставь будильник в органайзере',
    target: 1,
    reward: 5,
  },
  {
    id: 'daily_login',
    title: '📆 Ежедневный вход',
    description: 'Заходи в приложение каждый день',
    target: 1,
    reward: 2,
  },
];

export const DAILY_BONUS_AMOUNT = 2;
