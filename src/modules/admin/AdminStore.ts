// ============================================
// src/modules/admin/AdminStore.ts
// Хранилище для админ-панели
// Версия: 2.0.0 - ДОБАВЛЕНО: работа с заданиями
// ============================================

import { BaseStore } from '@/store/BaseStore';
import type { UUID, ISODateString } from '@types';

export interface IAdminStats {
  total_users: number;
  total_chats: number;
  total_messages: number;
  total_referrals: number;
  total_coins_earned: number;
  total_coins_spent: number;
  premium_users: number;
  trial_users: number;
  active_users: number;
}

export interface ISponsorTask {
  id: UUID;
  title: string;
  description: string;
  sponsor_name: string;
  sponsor_logo?: string;
  reward: number;
  type: 'subscribe' | 'visit' | 'action' | 'survey';
  target: string;
  action_required: string;
  verification_type: 'auto' | 'pseudo' | 'manual';
  pseudo_hours: number;
  is_active: boolean;
  starts_at: ISODateString;
  expires_at?: ISODateString;
  max_completions?: number;
  completions_count: number;
  created_at: ISODateString;
}

export interface IAdminStoreData {
  stats: IAdminStats | null;
  tasks: ISponsorTask[];
  last_sync: ISODateString | null;
}

export class AdminStore extends BaseStore<IAdminStoreData> {
  constructor() {
    super('admin');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        stats: null,
        tasks: [],
        last_sync: null,
      };
      this.save();
    }

    if (!this._data.tasks) this._data.tasks = [];
  }

  getStats(): IAdminStats | null {
    return this._data.stats;
  }

  setStats(stats: IAdminStats): void {
    this._data.stats = stats;
    this._data.last_sync = new Date().toISOString();
    this.save();
    this._emitChange('admin:stats_updated', { stats });
  }

  getTasks(): ISponsorTask[] {
    return this._data.tasks || [];
  }

  getTask(taskId: UUID): ISponsorTask | undefined {
    return this._data.tasks.find(t => t.id === taskId);
  }

  setTasks(tasks: ISponsorTask[]): void {
    this._data.tasks = tasks;
    this.save();
    this._emitChange('admin:tasks_updated', { tasks });
  }

  addTask(task: ISponsorTask): void {
    this._data.tasks.push(task);
    this.save();
    this._emitChange('admin:task_added', { task });
  }

  updateTask(taskId: UUID, data: Partial<ISponsorTask>): void {
    const index = this._data.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;
    this._data.tasks[index] = { ...this._data.tasks[index], ...data };
    this.save();
    this._emitChange('admin:task_updated', { taskId, data });
  }

  deleteTask(taskId: UUID): void {
    this._data.tasks = this._data.tasks.filter(t => t.id !== taskId);
    this.save();
    this._emitChange('admin:task_deleted', { taskId });
  }

  clear(): void {
    this._data = {
      stats: null,
      tasks: [],
      last_sync: null,
    };
    this.save();
    console.log('🧹 AdminStore очищен');
    this._emitChange('admin:cleared', {});
  }
}

export const adminStore = new AdminStore();
console.log('✅ AdminStore v2.0.0 загружен');
