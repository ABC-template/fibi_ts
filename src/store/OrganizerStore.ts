// ============================================
// src/store/OrganizerStore.ts
// To-Do, напоминания, трекеры
// Версия: 4.0.1 - FIXED TYPES
// ============================================

import { BaseStore } from './BaseStore';
import type {
  IOrganizerStoreData,
  ITodoItem,
  IReminder,
  ITracker,
  ITrackerLog,
  TopicId
} from '@types';

export class OrganizerStore extends BaseStore<IOrganizerStoreData> {
  constructor() {
    super('organizer');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        todoItems: [],
        reminders: [],
        trackers: [],
        trackerLogs: []
      };
      this.save();
    }

    if (!this._data.todoItems) this._data.todoItems = [];
    if (!this._data.reminders) this._data.reminders = [];
    if (!this._data.trackers) this._data.trackers = [];
    if (!this._data.trackerLogs) this._data.trackerLogs = [];
  }

  private generateId(): string {
    return 'org_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  }

  // ==========================================
  // TO-DO
  // ==========================================

  addTodo(text: string, topic: TopicId | 'all' = 'all'): ITodoItem {
    const item: ITodoItem = {
      id: this.generateId(),
      text: text,
      topic: topic,
      isCompleted: false,
      createdAt: new Date().toISOString()
    };
    this._data.todoItems.unshift(item);
    this.save();
    
    this._emitChange('organizer:todo_added', { 
      todo: item,
      topic: item.topic
    });
    return item;
  }

  toggleTodo(id: string): ITodoItem | undefined {
    const item = this._data.todoItems.find(t => t.id === id);
    if (item) {
      item.isCompleted = !item.isCompleted;
      this.save();
      this._emitChange('organizer:todo_toggled', { 
        id, 
        isCompleted: item.isCompleted,
        todo: item
      });
    }
    return item;
  }

  deleteTodo(id: string): void {
    const deleted = this._data.todoItems.find(t => t.id === id);
    this._data.todoItems = this._data.todoItems.filter(t => t.id !== id);
    this.save();
    
    this._emitChange('organizer:todo_deleted', { 
      id,
      todo: deleted
    });
  }

  getTodoByTopic(topic: TopicId | 'all'): ITodoItem[] {
    if (topic === 'all') return this._data.todoItems;
    return this._data.todoItems.filter(t => t.topic === topic);
  }

  getTodoStats(topic: TopicId | 'all'): { total: number; completed: number; pending: number } {
    const items = topic === 'all' ? this._data.todoItems : this.getTodoByTopic(topic);
    const total = items.length;
    const completed = items.filter(t => t.isCompleted).length;
    return { total, completed, pending: total - completed };
  }

  // ==========================================
  // НАПОМИНАНИЯ
  // ==========================================

  setReminders(reminders: IReminder[]): void {
    this._data.reminders = reminders;
    this.save();
    this._emitChange('organizer:reminders_updated', { count: reminders.length });
  }

  addReminder(reminder: IReminder): IReminder {
    this._data.reminders.push(reminder);
    this.save();
    this._emitChange('organizer:reminder_added', { reminder });
    return reminder;
  }

  deleteReminder(id: string): void {
    const deleted = this._data.reminders.find(r => r.id === id);
    this._data.reminders = this._data.reminders.filter(r => r.id !== id);
    this.save();
    this._emitChange('organizer:reminder_deleted', { id, reminder: deleted });
  }

  getRemindersByTopic(topic: TopicId): IReminder[] {
    return this._data.reminders.filter(r => r.topic_id === topic && r.status === 'pending');
  }

  // ==========================================
  // ТРЕКЕРЫ
  // ==========================================

  setTrackers(trackers: ITracker[], logs: ITrackerLog[]): void {
    this._data.trackers = trackers || [];
    this._data.trackerLogs = logs || [];
    this.save();
    this._emitChange('organizer:trackers_updated', { 
      trackers: trackers.length, 
      logs: logs.length 
    });
  }

  addTracker(tracker: ITracker): ITracker {
    this._data.trackers.push(tracker);
    this.save();
    this._emitChange('organizer:tracker_added', { tracker });
    return tracker;
  }

  deleteTracker(id: string): void {
    const deleted = this._data.trackers.find(t => t.id === id);
    this._data.trackers = this._data.trackers.filter(t => t.id !== id);
    this._data.trackerLogs = this._data.trackerLogs.filter(l => l.tracker_id !== id);
    this.save();
    this._emitChange('organizer:tracker_deleted', { id, tracker: deleted });
  }

  addTrackerLog(log: ITrackerLog): ITrackerLog {
    this._data.trackerLogs.push(log);
    this.save();
    this._emitChange('organizer:tracker_log_added', { log });
    return log;
  }

  deleteTrackerLog(id: string): void {
    const deleted = this._data.trackerLogs.find(l => l.id === id);
    this._data.trackerLogs = this._data.trackerLogs.filter(l => l.id !== id);
    this.save();
    this._emitChange('organizer:tracker_log_deleted', { id, log: deleted });
  }

  getTrackersByTopic(topic: TopicId): ITracker[] {
    return this._data.trackers.filter(t => t.topic_id === topic && t.status === 'active');
  }

  getLogsForTracker(trackerId: string): ITrackerLog[] {
    return this._data.trackerLogs
      .filter(l => l.tracker_id === trackerId)
      .sort((a, b) => new Date(b.logged_date).getTime() - new Date(a.logged_date).getTime());
  }

  get reminders(): IReminder[] {
    return this._data.reminders || [];
  }

  get trackers(): ITracker[] {
    return this._data.trackers || [];
  }

  get trackerLogs(): ITrackerLog[] {
    return this._data.trackerLogs || [];
  }
}

// Создаем экземпляр
export const organizerStore = new OrganizerStore();
console.log('✅ OrganizerStore v4.0.1 загружен');
