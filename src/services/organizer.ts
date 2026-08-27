// ============================================
// src/services/organizer.ts
// API для органайзера (напоминания, трекеры)
// Версия: 3.0.1 - FIXED TYPES
// ============================================

import { apiClient } from './api';
import { organizerStore } from '@/store/OrganizerStore';
import type {
  IReminder,
  ITracker,
  ITrackerLog,
  TopicId,
  UUID,
  ISODateString
} from '@types';

export class OrganizerService {
  constructor() {}

  // ==========================================
  // НАПОМИНАНИЯ
  // ==========================================

  async getReminders(topicId: TopicId | null = null): Promise<IReminder[]> {
    try {
      let url = '/organizer/reminders/get';
      if (topicId) {
        url += `?topicId=${encodeURIComponent(topicId)}`;
      }
      
      const data = await apiClient.get(url);
      
      if (data.success && data.data) {
        organizerStore.setReminders(data.data);
        return data.data;
      }
      return [];
    } catch (err) {
      console.error('Get reminders error:', err);
      return organizerStore.reminders;
    }
  }

  async createReminder(
    topicId: TopicId,
    taskText: string,
    triggerAt: ISODateString
  ): Promise<IReminder | null> {
    try {
      const data = await apiClient.post('/organizer/reminders/create', {
        topicId: topicId,
        taskText: taskText,
        triggerAt: triggerAt
      });
      
      if (data.success && data.data) {
        organizerStore.addReminder(data.data);
        return data.data;
      }
      return null;
    } catch (err) {
      console.error('Create reminder error:', err);
      return null;
    }
  }

  async deleteReminder(id: UUID): Promise<boolean> {
    try {
      const data = await apiClient.post('/organizer/reminders/delete', {
        id: id
      });
      
      if (data.success) {
        organizerStore.deleteReminder(id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Delete reminder error:', err);
      return false;
    }
  }

  // ==========================================
  // ТРЕКЕРЫ
  // ==========================================

  async getTrackers(topicId: TopicId | null = null): Promise<{ trackers: ITracker[]; logs: ITrackerLog[] }> {
    try {
      let url = '/organizer/trackers/get';
      if (topicId) {
        url += `?topicId=${encodeURIComponent(topicId)}`;
      }
      
      const data = await apiClient.get(url);
      
      if (data.success && data.data) {
        organizerStore.setTrackers(
          data.data.trackers || [],
          data.data.logs || []
        );
        return data.data;
      }
      return { trackers: [], logs: [] };
    } catch (err) {
      console.error('Get trackers error:', err);
      return {
        trackers: organizerStore.trackers,
        logs: organizerStore.trackerLogs
      };
    }
  }

  async createTracker(
    topicId: TopicId,
    title: string,
    settings: any = {}
  ): Promise<ITracker | null> {
    try {
      const data = await apiClient.post('/organizer/trackers/create', {
        topicId: topicId,
        title: title,
        settings: settings
      });
      
      if (data.success && data.data) {
        organizerStore.addTracker(data.data);
        return data.data;
      }
      return null;
    } catch (err) {
      console.error('Create tracker error:', err);
      return null;
    }
  }

  async addTrackerLog(
    trackerId: UUID,
    value: string,
    noteText: string | null = null,
    loggedDate: ISODateString | null = null
  ): Promise<ITrackerLog | null> {
    try {
      const data = await apiClient.post('/organizer/trackers/add-log', {
        trackerId: trackerId,
        value: value,
        noteText: noteText,
        loggedDate: loggedDate || new Date().toISOString()
      });
      
      if (data.success && data.data) {
        organizerStore.addTrackerLog(data.data);
        return data.data;
      }
      return null;
    } catch (err) {
      console.error('Add tracker log error:', err);
      return null;
    }
  }

  async deleteTrackerLog(id: UUID): Promise<boolean> {
    try {
      const data = await apiClient.post('/organizer/trackers/delete-log', {
        id: id
      });
      
      if (data.success) {
        organizerStore.deleteTrackerLog(id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Delete tracker log error:', err);
      return false;
    }
  }

  async deleteTracker(id: UUID): Promise<boolean> {
    try {
      const data = await apiClient.post('/organizer/trackers/delete', {
        id: id
      });
      
      if (data.success) {
        organizerStore.deleteTracker(id);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Delete tracker error:', err);
      return false;
    }
  }
}

// Создаем экземпляр
export const organizerService = new OrganizerService();
console.log('✅ OrganizerService v3.0.1 загружен');
