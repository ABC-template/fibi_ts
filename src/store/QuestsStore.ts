// ============================================
// src/store/QuestsStore.ts
// Хранилище заданий (единая система)
// Версия: 1.0.0
// ============================================

import { BaseStore } from './BaseStore';
import { apiClient } from '@/services/api';
import { eventBus } from '@/core/event-bus';

export interface IQuest {
  id: string;
  type: 'daily' | 'achievement' | 'sponsor' | 'event';
  category: string;
  external_id?: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  target: number;
  reward_coins: number;
  verification_type: 'auto' | 'pseudo' | 'manual';
  pseudo_hours?: number;
  is_active: boolean;
}

export interface IUserQuest {
  id: string;
  quest_id: string;
  user_quest_id: string;
  type: 'daily' | 'achievement' | 'sponsor' | 'event';
  category: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  target: number;
  reward_coins: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  proof_data?: any;
  expires_at?: string;
  reset_date?: string;
  completed_at?: string;
  claimed_at?: string;
}

interface IQuestsCacheData {
  quests: IUserQuest[];
  catalog: IQuest[];
  lastSync: string | null;
  lastResetDate: string | null;
}

export class QuestsStore extends BaseStore<IQuestsCacheData> {
  private userId: number | null = null;
  private _isSyncing: boolean = false;

  constructor() {
    super('quests');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        quests: [],
        catalog: [],
        lastSync: null,
        lastResetDate: null,
      };
      this.save();
    }

    if (!this._data.quests) this._data.quests = [];
    if (!this._data.catalog) this._data.catalog = [];

    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    eventBus.on('user:changed', (data) => {
      this.userId = data.userId;
      this.load();
    }, this);

    console.log('📡 QuestsStore подписан на события');
  }

  // ==========================================
  // СИНХРОНИЗАЦИЯ
  // ==========================================

  async sync(): Promise<boolean> {
    if (this._isSyncing) return false;
    if (!this.userId) {
      const tg = (window as any).Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      if (user?.id) this.userId = user.id;
      else return false;
    }

    try {
      this._isSyncing = true;
      console.log('🔄 [QuestsStore] Синхронизация...');

      // Получаем мои задания
      const result = await apiClient.get('/quests/my');

      if (result.success) {
        this._data.quests = result.quests || [];
        this._data.lastSync = new Date().toISOString();
        this.save();

        this._emitChange('quests:synced', {
          count: this._data.quests.length,
        });

        console.log(`✅ [QuestsStore] Синхронизировано ${this._data.quests.length} заданий`);
        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ [QuestsStore] Ошибка синхронизации:', err);
      return false;
    } finally {
      this._isSyncing = false;
    }
  }

  // ==========================================
  // ПОЛУЧЕНИЕ ДАННЫХ
  // ==========================================

  getQuests(): IUserQuest[] {
    return this._data.quests || [];
  }

  getQuestsByType(type: IUserQuest['type']): IUserQuest[] {
    return (this._data.quests || []).filter(q => q.type === type);
  }

  getDailyQuests(): IUserQuest[] {
    return this.getQuestsByType('daily');
  }

  getAchievements(): IUserQuest[] {
    return this.getQuestsByType('achievement');
  }

  getSponsorQuests(): IUserQuest[] {
    return this.getQuestsByType('sponsor');
  }

  getEventQuests(): IUserQuest[] {
    return this.getQuestsByType('event');
  }

  getQuest(userQuestId: string): IUserQuest | undefined {
    return (this._data.quests || []).find(q => q.user_quest_id === userQuestId);
  }

  getStats(): { total: number; completed: number; claimed: number } {
    const quests = this._data.quests || [];
    return {
      total: quests.length,
      completed: quests.filter(q => q.completed).length,
      claimed: quests.filter(q => q.claimed).length,
    };
  }

  // ==========================================
  // ДЕЙСТВИЯ
  // ==========================================

  async updateProgress(questId: string, increment: number = 1): Promise<boolean> {
    if (!this.userId) return false;

    // Проверяем кэш
    const quest = this._data.quests.find(q => q.quest_id === questId);
    if (quest && (quest.completed || quest.claimed)) {
      return false;
    }

    try {
      const result = await apiClient.post('/quests/progress', {
        questId,
        increment,
      });

      if (result.success) {
        // Обновляем кэш
        const q = this._data.quests.find(q => q.quest_id === questId);
        if (q) {
          q.progress = result.progress || 0;
          q.completed = result.completed || false;
          q.claimed = result.claimed || false;
          this.save();
        }

        if (result.completed) {
          this._emitChange('quests:quest_completed', { questId });
        }

        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ [QuestsStore.updateProgress] Error:', err);
      return false;
    }
  }

  async claim(userQuestId: string): Promise<{ reward: number } | null> {
    if (!this.userId) return null;

    const quest = this._data.quests.find(q => q.user_quest_id === userQuestId);
    if (!quest || !quest.completed || quest.claimed) return null;

    try {
      const result = await apiClient.post('/quests/claim', { userQuestId });

      if (result.success) {
        quest.claimed = true;
        quest.claimed_at = new Date().toISOString();
        this.save();

        this._emitChange('quests:quest_claimed', {
          userQuestId,
          reward: result.reward,
          newBalance: result.newBalance,
        });

        return { reward: result.reward || 0 };
      }

      return null;
    } catch (err) {
      console.error('❌ [QuestsStore.claim] Error:', err);
      return null;
    }
  }

  async submitProof(userQuestId: string, proofData?: any): Promise<boolean> {
    if (!this.userId) return false;

    try {
      const result = await apiClient.post('/quests/submit', {
        userQuestId,
        proofData: proofData || {},
      });

      if (result.success) {
        const quest = this._data.quests.find(q => q.user_quest_id === userQuestId);
        if (quest) {
          quest.status = 'submitted';
          if (result.expiresAt) {
            quest.expires_at = result.expiresAt;
          }
          this.save();
        }

        this._emitChange('quests:proof_submitted', { userQuestId });
        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ [QuestsStore.submitProof] Error:', err);
      return false;
    }
  }

  async verify(userQuestId: string, approved: boolean): Promise<boolean> {
    if (!this.userId) return false;

    try {
      const result = await apiClient.post('/quests/verify', {
        userQuestId,
        approved,
      });

      if (result.success) {
        const quest = this._data.quests.find(q => q.user_quest_id === userQuestId);
        if (quest) {
          quest.status = result.status || (approved ? 'approved' : 'rejected');
          if (approved) {
            quest.completed = true;
            quest.completed_at = new Date().toISOString();
          }
          this.save();
        }

        this._emitChange('quests:verified', { userQuestId, approved });
        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ [QuestsStore.verify] Error:', err);
      return false;
    }
  }

  // ==========================================
  // ВСПОМОГАТЕЛЬНЫЕ
  // ==========================================

  canClaim(userQuestId: string): boolean {
    const quest = this._data.quests.find(q => q.user_quest_id === userQuestId);
    return !!(quest && quest.completed && !quest.claimed);
  }

  canSubmitProof(userQuestId: string): boolean {
    const quest = this._data.quests.find(q => q.user_quest_id === userQuestId);
    return !!(quest && quest.type === 'sponsor' && quest.status === 'pending');
  }

  // ==========================================
  // ОЧИСТКА
  // ==========================================

  clear(): void {
    this._data = {
      quests: [],
      catalog: [],
      lastSync: null,
      lastResetDate: null,
    };
    this.save();
    console.log('🧹 QuestsStore очищен');
  }

  // ==========================================
  // ЗАГРУЗКА ПРИ ВХОДЕ
  // ==========================================

  load(): IQuestsCacheData {
    super.load();

    if (this.userId) {
      this.sync().catch(err => {
        console.warn('⚠️ [QuestsStore] Фоновая синхронизация не удалась:', err);
      });
    }

    return this._data;
  }
}

export const questsStore = new QuestsStore();
console.log('✅ QuestsStore v1.0.0 загружен');
