// ============================================
// types/store.ts
// Типы для хранилищ (Store)
// ============================================

import { IChat } from './chat';
import { ITodoItem, IReminder, ITracker, ITrackerLog } from './organizer';
import { IDailyQuest, IAchievement } from './tasks';
import { TopicId, UserRole } from './common';

/** Данные ChatStore */
export interface IChatStoreData {
  histories: Record<TopicId, IChat[]>;
  activeIds: Record<TopicId, string | null>;
  currentTopic: TopicId;
  uploadProgress?: {
    total: number;
    current: number;
    startedAt: number;
  };
}

/** Данные UserStore */
export interface IUserStoreData {
  userId: number | null;
  role: UserRole;
  dailyLimit: number;
  usedToday: number;
  syncEnabled: boolean;
  deviceFingerprint: string | null;
  signedFingerprint: string | null;
  deviceType: string;
  devicePlatform: string;
  username?: string | null;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  photoUrl?: string | null;
}

/** Данные OrganizerStore */
export interface IOrganizerStoreData {
  todoItems: ITodoItem[];
  reminders: IReminder[];
  trackers: ITracker[];
  trackerLogs: ITrackerLog[];
}

/** Данные TasksStore */
export interface ITasksStoreData {
  balance: number;
  tokens: number;
  dailyQuests: IDailyQuest[];
  achievements: IAchievement[];
  lastResetDate: string | null;
  streakDays: number;
  lastLoginDate: string | null;
  claimedDailyBonus: boolean;
  [key: string]: any;
}

/** Состояние навигации */
export interface INavigationState {
  module: string;
  params: Record<string, any>;
  history: Array<{
    module: string;
    params: Record<string, any>;
  }>;
  isDrawerOpen: boolean;
  isModalOpen: boolean;
  modalStack: string[];
}
