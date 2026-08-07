// ============================================
// src/modules/sponsors/SponsorsStore.ts
// Хранилище заданий от спонсоров
// Версия: 2.0.0 - ИЗМЕНЕНО: экономика через EventBus
// ============================================

import { BaseStore } from '@/store/BaseStore';
import { eventBus } from '@/core/event-bus';
import type { UUID, ISODateString } from '@types';

export type SponsorTaskType = 'subscribe' | 'visit' | 'action' | 'survey';
export type VerificationType = 'auto' | 'pseudo' | 'manual';
export type TaskStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface ISponsorTask {
  id: UUID;
  title: string;
  description: string;
  sponsor_name: string;
  sponsor_logo?: string;
  reward: number;
  type: SponsorTaskType;
  target: string;
  action_required: string;
  verification_type: VerificationType;
  pseudo_hours: number;
  is_active: boolean;
  starts_at: ISODateString;
  expires_at?: ISODateString;
  max_completions?: number;
  completions_count: number;
  created_at: ISODateString;
}

export interface IUserTaskCompletion {
  id: UUID;
  user_id: number;
  task_id: UUID;
  status: TaskStatus;
  submitted_at?: ISODateString;
  approved_at?: ISODateString;
  proof_data?: any;
  reward_claimed: boolean;
  created_at: ISODateString;
  expires_at?: ISODateString;
}

export interface ISponsorsStoreData {
  tasks: ISponsorTask[];
  completions: IUserTaskCompletion[];
  last_sync: ISODateString | null;
}

export class SponsorsStore extends BaseStore<ISponsorsStoreData> {
  constructor() {
    super('sponsors');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        tasks: [],
        completions: [],
        last_sync: null,
      };
      this.save();
    }

    if (!this._data.tasks) this._data.tasks = [];
    if (!this._data.completions) this._data.completions = [];

    this._subscribeToBalance();
  }

  private _subscribeToBalance(): void {
    eventBus.on('economy:balance:updated', (data) => {
      this._emitChange('sponsors:balance_updated', { 
        userId: data.userId, 
        newBalance: data.newBalance 
      });
    }, this);
  }

  getActiveTasks(): ISponsorTask[] {
    const now = new Date().toISOString();
    return this._data.tasks.filter(t =>
      t.is_active &&
      t.starts_at <= now &&
      (!t.expires_at || t.expires_at >= now)
    );
  }

  getAllTasks(): ISponsorTask[] {
    return this._data.tasks || [];
  }

  getTask(taskId: UUID): ISponsorTask | undefined {
    return this._data.tasks.find(t => t.id === taskId);
  }

  getCompletion(taskId: UUID, userId: number): IUserTaskCompletion | undefined {
    return this._data.completions.find(
      c => c.task_id === taskId && c.user_id === userId
    );
  }

  getUserCompletions(userId: number): IUserTaskCompletion[] {
    return this._data.completions.filter(c => c.user_id === userId);
  }

  canCompleteTask(taskId: UUID, userId: number): boolean {
    const task = this.getTask(taskId);
    if (!task || !task.is_active) return false;

    if (task.max_completions) {
      const completions = this._data.completions.filter(
        c => c.task_id === taskId && c.status === 'approved'
      );
      if (completions.length >= task.max_completions) return false;
    }

    const existing = this.getCompletion(taskId, userId);
    if (existing) {
      if (existing.status === 'rejected') return true;
      if (existing.status === 'pending' || existing.status === 'submitted') return false;
      if (existing.status === 'approved') return false;
    }

    return true;
  }

  addTask(task: Omit<ISponsorTask, 'id' | 'completions_count' | 'created_at'>): ISponsorTask {
    const newTask: ISponsorTask = {
      id: this.generateUUID(),
      ...task,
      completions_count: 0,
      created_at: new Date().toISOString(),
    };

    this._data.tasks.push(newTask);
    this.save();

    console.log(`📋 Добавлено задание: ${newTask.title}`);
    this._emitChange('sponsors:task_added', { task: newTask });
    return newTask;
  }

  updateTask(taskId: UUID, data: Partial<ISponsorTask>): ISponsorTask | null {
    const index = this._data.tasks.findIndex(t => t.id === taskId);
    if (index === -1) {
      console.warn(`⚠️ Задание ${taskId} не найдено`);
      return null;
    }

    this._data.tasks[index] = { ...this._data.tasks[index], ...data };
    this.save();

    console.log(`📋 Задание ${taskId} обновлено`);
    this._emitChange('sponsors:task_updated', { taskId, data });
    return this._data.tasks[index];
  }

  deleteTask(taskId: UUID): boolean {
    const index = this._data.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return false;

    this._data.tasks.splice(index, 1);
    this._data.completions = this._data.completions.filter(c => c.task_id !== taskId);
    this.save();

    console.log(`🗑️ Задание ${taskId} удалено`);
    this._emitChange('sponsors:task_deleted', { taskId });
    return true;
  }

  submitCompletion(taskId: UUID, userId: number, proof_data?: any): IUserTaskCompletion | null {
    const task = this.getTask(taskId);
    if (!task) return null;

    if (!this.canCompleteTask(taskId, userId)) {
      console.warn(`⚠️ Нельзя выполнить задание ${taskId}`);
      return null;
    }

    const existing = this.getCompletion(taskId, userId);
    if (existing && existing.status === 'rejected') {
      this._data.completions = this._data.completions.filter(c => c.id !== existing.id);
    }

    const pseudoHours = task.verification_type === 'pseudo' ? task.pseudo_hours || 12 : 0;
    const expiresAt = pseudoHours > 0
      ? new Date(Date.now() + pseudoHours * 60 * 60 * 1000).toISOString()
      : undefined;

    const completion: IUserTaskCompletion = {
      id: this.generateUUID(),
      user_id: userId,
      task_id: taskId,
      status: task.verification_type === 'manual' ? 'submitted' : 'pending',
      submitted_at: new Date().toISOString(),
      proof_data: proof_data || null,
      reward_claimed: false,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    };

    this._data.completions.push(completion);
    this.save();

    console.log(`📝 Заявка на задание ${taskId} отправлена (статус: ${completion.status})`);
    this._emitChange('sponsors:completion_submitted', { completion });

    return completion;
  }

  updateCompletionStatus(completionId: UUID, status: TaskStatus): IUserTaskCompletion | null {
    const index = this._data.completions.findIndex(c => c.id === completionId);
    if (index === -1) return null;

    this._data.completions[index].status = status;
    if (status === 'approved') {
      this._data.completions[index].approved_at = new Date().toISOString();
    }

    this.save();

    console.log(`🔄 Статус выполнения ${completionId} обновлён: ${status}`);
    this._emitChange('sponsors:completion_status_changed', {
      completionId,
      status,
      completion: this._data.completions[index],
    });

    return this._data.completions[index];
  }

  claimReward(completionId: UUID): boolean {
    const index = this._data.completions.findIndex(c => c.id === completionId);
    if (index === -1) return false;

    if (this._data.completions[index].status !== 'approved') {
      console.warn(`⚠️ Задание ${completionId} не одобрено`);
      return false;
    }

    if (this._data.completions[index].reward_claimed) {
      console.warn(`⚠️ Награда за ${completionId} уже получена`);
      return false;
    }

    this._data.completions[index].reward_claimed = true;
    this.save();

    console.log(`💰 Награда за ${completionId} получена`);
    this._emitChange('sponsors:reward_claimed', { completionId });
    return true;
  }

  getAvailableTasks(userId: number): ISponsorTask[] {
    const activeTasks = this.getActiveTasks();
    return activeTasks.filter(task => this.canCompleteTask(task.id, userId));
  }

  getUserStats(userId: number): {
    total: number;
    pending: number;
    submitted: number;
    approved: number;
    rejected: number;
    total_reward: number;
  } {
    const completions = this._data.completions.filter(c => c.user_id === userId);
    const approved = completions.filter(c => c.status === 'approved' && c.reward_claimed);

    return {
      total: completions.length,
      pending: completions.filter(c => c.status === 'pending').length,
      submitted: completions.filter(c => c.status === 'submitted').length,
      approved: completions.filter(c => c.status === 'approved').length,
      rejected: completions.filter(c => c.status === 'rejected').length,
      total_reward: approved.reduce((sum, c) => {
        const task = this.getTask(c.task_id);
        return sum + (task?.reward || 0);
      }, 0),
    };
  }

  sync(data: { tasks: ISponsorTask[]; completions: IUserTaskCompletion[] }): void {
    const taskIds = new Set(this._data.tasks.map(t => t.id));
    const newTasks = data.tasks.filter(t => !taskIds.has(t.id));
    this._data.tasks = [...this._data.tasks, ...newTasks];

    for (const task of data.tasks) {
      const index = this._data.tasks.findIndex(t => t.id === task.id);
      if (index !== -1) {
        this._data.tasks[index] = task;
      }
    }

    const compIds = new Set(this._data.completions.map(c => c.id));
    const newComps = data.completions.filter(c => !compIds.has(c.id));
    this._data.completions = [...this._data.completions, ...newComps];

    this._data.last_sync = new Date().toISOString();
    this.save();

    console.log(`🔄 Спонсорские задания синхронизированы (${this._data.tasks.length} заданий)`);
    this._emitChange('sponsors:synced', {
      tasks: this._data.tasks.length,
      completions: this._data.completions.length,
    });
  }

  clear(): void {
    this._data = {
      tasks: [],
      completions: [],
      last_sync: null,
    };
    this.save();
    console.log('🧹 SponsorsStore очищен');
    this._emitChange('sponsors:cleared', {});
  }
}

export const sponsorsStore = new SponsorsStore();
console.log('✅ SponsorsStore v2.0.0 загружен');
