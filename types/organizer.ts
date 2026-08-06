// ============================================
// types/organizer.ts
// Типы для органайзера (напоминания, трекеры)
// ============================================

import { UUID, TopicId, TopicFilter, ISODateString, ReminderStatus, TrackerStatus, TrackerTone } from './common';

/** ✅ ИСПРАВЛЕНО: Напоминание с поддержкой 'all' */
export interface IReminder {
  id: UUID;
  user_id: number;
  topic_id: TopicId | 'all';  // ✅ Теперь может быть 'all'
  task_text: string;
  trigger_at: ISODateString;
  status: ReminderStatus;
  created_at: ISODateString;
  updated_at?: ISODateString;
}

/** ✅ ИСПРАВЛЕНО: Создание напоминания */
export interface ICreateReminderData {
  topicId: TopicId | 'all';  // ✅ Теперь может быть 'all'
  taskText: string;
  triggerAt: ISODateString;
}

/** Трекер */
export interface ITracker {
  id: UUID;
  user_id: number;
  topic_id: TopicId;
  title: string;
  settings: ITrackerSettings;
  status: TrackerStatus;
  created_at: ISODateString;
  updated_at?: ISODateString;
}

/** Настройки трекера */
export interface ITrackerSettings {
  tone: TrackerTone;
  target?: number;
  unit?: string;
  reminderInterval?: number; // в часах
  customPrompt?: string;
}

/** Лог трекера */
export interface ITrackerLog {
  id: UUID;
  tracker_id: UUID;
  value: string;
  note_text: string | null;
  logged_date: ISODateString;
  created_at: ISODateString;
}

/** To-Do задача */
export interface ITodoItem {
  id: string;
  text: string;
  topic: TopicFilter;  // ✅ Используем TopicFilter
  isCompleted: boolean;
  createdAt: ISODateString;
}

/** Создание трекера */
export interface ICreateTrackerData {
  topicId: TopicId;
  title: string;
  settings: ITrackerSettings;
}

/** Добавление лога трекера */
export interface IAddTrackerLogData {
  trackerId: UUID;
  value: string;
  noteText?: string | null;
  loggedDate?: ISODateString;
}
