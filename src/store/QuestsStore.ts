// ============================================
// src/store/QuestsStore.ts
// Хранилище заданий (с ежедневным входом и стриком)
// Версия: 2.3.0 - исправлены методы работы с EconomyStore
// ============================================

import { BaseStore } from './BaseStore';
import { apiClient } from '@/services/api';
import { eventBus } from '@/core/event-bus';
import { economyStore } from '@/economy/EconomyStore';

export interface IQuest {
  id: string;
  type: 'daily' | 'sponsor' | 'event' | 'achievement';
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
  type: 'daily' | 'sponsor' | 'event' | 'achievement';
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
  external_id?: string;
}

interface IQuestsCacheData {
  quests: IUserQuest[];
  catalog: IQuest[];
  gameData: Record<string, any>;
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
        gameData: {},
        lastSync: null,
        lastResetDate: null,
      };
      this.save();
    }

    if (!this._data.quests) this._data.quests = [];
    if (!this._data.catalog) this._data.catalog = [];
    if (!this._data.gameData) this._data.gameData = {};

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
  // БАЛАНС (из EconomyStore)
  // ==========================================

  getBalance(): number {
    return economyStore.getCoinBalance();
  }

  // ==========================================
  // ИГРОВЫЕ ДАННЫЕ
  // ==========================================

  getGameData<T>(key: string, defaultValue: T): T {
    if (this._data.gameData && key in this._data.gameData) {
      return this._data.gameData[key] as T;
    }
    return defaultValue;
  }

  setGameData<T>(key: string, value: T): void {
    if (!this._data.gameData) {
      this._data.gameData = {};
    }
    this._data.gameData[key] = value;
    this.save();
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

      const result = await apiClient.get('/quests/my');

      if (result.success && result.quests) {
        const quests = result.quests.map((q: any) => ({
          ...q,
          quest_id: q.external_id || q.id,
          external_id: q.external_id || null,
        }));

        console.log('📥 Получено квестов:', quests.length);

        this._data.quests = quests;
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
  // ЕЖЕДНЕВНЫЙ ВХОД + СТРИК
  // ==========================================

  async claimDailyLogin(): Promise<{ 
    success: boolean; 
    streak: number; 
    bonus: number; 
    claimed: boolean;
    reward: number;
  }> {
    if (!this.userId) {
      console.warn('⚠️ [claimDailyLogin] Нет userId');
      return { success: false, streak: 0, bonus: 0, claimed: false, reward: 0 };
    }

    try {
      const quest = this.getQuestByExternalId('daily_login');
      if (quest?.claimed) {
        console.log('ℹ️ [claimDailyLogin] daily_login уже получен сегодня');
        return { success: true, streak: 0, bonus: 0, claimed: true, reward: 0 };
      }

      const progressResult = await this.updateProgress('daily_login', 1);
      if (!progressResult) {
        console.warn('⚠️ [claimDailyLogin] Не удалось обновить прогресс');
        return { success: false, streak: 0, bonus: 0, claimed: false, reward: 0 };
      }

      const streakResult = await this.updateStreak();
      if (!streakResult.success) {
        console.warn('⚠️ [claimDailyLogin] Не удалось обновить стрик');
        return { success: false, streak: 0, bonus: 0, claimed: false, reward: 0 };
      }

      const dailyQuest = this.getQuestByExternalId('daily_login');
      if (!dailyQuest) {
        console.warn('⚠️ [claimDailyLogin] daily_login не найден');
        return { success: false, streak: 0, bonus: 0, claimed: false, reward: 0 };
      }

      const bonus = streakResult.bonus || 0;
      const totalReward = dailyQuest.reward_coins + bonus;

      const claimResult = await this.claimWithBonus(dailyQuest.user_quest_id, bonus);

      if (!claimResult.success) {
        console.warn('⚠️ [claimDailyLogin] Не удалось забрать награду:', claimResult.error);
        return { success: false, streak: 0, bonus: 0, claimed: false, reward: 0 };
      }

      const updatedQuest = this.getQuestByExternalId('daily_login');
      if (updatedQuest) {
        updatedQuest.claimed = true;
        updatedQuest.claimed_at = new Date().toISOString();
        this.save();
      }

      console.log(`✅ [claimDailyLogin] Успешно! Стрик: ${streakResult.streak}, Бонус: ${bonus}, Награда: ${totalReward}`);

      return {
        success: true,
        streak: streakResult.streak || 0,
        bonus: bonus,
        claimed: true,
        reward: totalReward,
      };
    } catch (err) {
      console.error('❌ [claimDailyLogin] Ошибка:', err);
      return { success: false, streak: 0, bonus: 0, claimed: false, reward: 0 };
    }
  }

  // ==========================================
  // ОБНОВЛЕНИЕ СТРИКА (вызов API)
  // ==========================================

  async updateStreak(): Promise<{ success: boolean; streak: number; bonus: number; alreadyClaimed: boolean }> {
    try {
      const result = await apiClient.updateStreak();
      return {
        success: result.success === true,
        streak: result.streak || 0,
        bonus: result.bonus || 0,
        alreadyClaimed: result.already_claimed || false,
      };
    } catch (err) {
      console.error('❌ [updateStreak] Ошибка:', err);
      return { success: false, streak: 0, bonus: 0, alreadyClaimed: false };
    }
  }

  // ==========================================
  // ЗАБРАТЬ НАГРАДУ С БОНУСОМ
  // ==========================================

  async claimWithBonus(userQuestId: string, bonusAmount: number = 0): Promise<{
    success: boolean;
    reward: number;
    newBalance: number;
    error?: string;
  }> {
    if (!this.userId) {
      return { success: false, reward: 0, newBalance: 0, error: 'No user' };
    }

    try {
      const result = await apiClient.post('/quests/claim', {
        userQuestId,
        bonusAmount,
      });

      if (result.success) {
        const quest = this._data.quests.find(q => q.user_quest_id === userQuestId);
        if (quest) {
          quest.claimed = true;
          quest.claimed_at = new Date().toISOString();
          this.save();
        }

        const balanceEvent = {
          userId: this.userId,
          newBalance: result.newBalance || 0,
          delta: result.reward || 0,
          source: 'quest_claim',
          transactionId: result.transactionId || undefined,
        };
        
        console.log(`💰 [claimWithBonus] Отправляем событие обновления баланса:`, balanceEvent);
        eventBus.emit('economy:balance:updated', balanceEvent);

        // ✅ ИСПРАВЛЕНО: используем updateCoinBalance
        if (economyStore) {
          economyStore.updateCoinBalance(result.newBalance || 0);
        }

        this._emitChange('quests:quest_claimed', {
          userQuestId,
          reward: result.reward,
          newBalance: result.newBalance,
        });

        return {
          success: true,
          reward: result.reward || 0,
          newBalance: result.newBalance || 0,
        };
      }

      return {
        success: false,
        reward: 0,
        newBalance: 0,
        error: result.error || 'Unknown error',
      };
    } catch (err) {
      console.error('❌ [claimWithBonus] Error:', err);
      return { success: false, reward: 0, newBalance: 0, error: (err as Error).message };
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

  getSponsorQuests(): IUserQuest[] {
    return this.getQuestsByType('sponsor');
  }

  getEventQuests(): IUserQuest[] {
    return this.getQuestsByType('event');
  }

  getQuest(userQuestId: string): IUserQuest | undefined {
    return (this._data.quests || []).find(q => q.user_quest_id === userQuestId);
  }

  getQuestByExternalId(externalId: string): IUserQuest | undefined {
    return (this._data.quests || []).find(q => {
      if (q.external_id === externalId) return true;
      if (q.quest_id === externalId) return true;
      if (q.id === externalId) return true;
      return false;
    });
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
    if (!this.userId) {
      console.warn('⚠️ [updateProgress] Нет userId');
      return false;
    }

    const quest = this.getQuestByExternalId(questId);
    if (quest && (quest.completed || quest.claimed)) {
      console.log(`ℹ️ [updateProgress] Квест ${questId} уже выполнен или получен`);
      return true;
    }

    try {
      const result = await apiClient.post('/quests/progress', {
        questId,
        increment,
      });

      if (result.success) {
        const q = this.getQuestByExternalId(questId);
        if (q) {
          q.progress = result.progress || 0;
          q.completed = result.completed || false;
          q.claimed = result.claimed || false;
          this.save();

          console.log(`✅ [updateProgress] Квест ${questId} обновлён: progress=${q.progress}, completed=${q.completed}`);
        } else {
          console.log(`🔄 [updateProgress] Квест ${questId} не найден в кеше, делаем синхронизацию`);
          await this.sync();
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
    return this.claimWithBonus(userQuestId, 0);
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

  isDailyLoginClaimedToday(): boolean {
    const quest = this.getQuestByExternalId('daily_login');
    return quest?.claimed || false;
  }

  // ==========================================
  // ОЧИСТКА
  // ==========================================

  clear(): void {
    this._data = {
      quests: [],
      catalog: [],
      gameData: {},
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
console.log('✅ QuestsStore v2.3.0 загружен (исправлены методы EconomyStore)');
