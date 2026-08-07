// ============================================
// src/store/TasksStore.ts
// Хранилище заданий (фасад для API + кэш)
// Версия: 6.1.0 - исправлены типы и load()
// ============================================

import { BaseStore } from './BaseStore';
import { apiClient } from '@/services/api';
import { eventBus } from '@/core/event-bus';
import {
  ACHIEVEMENTS,
  DAILY_QUESTS,
  DAILY_BONUS_AMOUNT,
  getLocalizedAchievement,
  getLocalizedQuest,
} from '@/config/achievements';
import type { IDailyQuest, IAchievement } from '@types';

interface ITasksCacheData {
  // Кэш
  balance: number;
  tokens: number;
  streak: number;
  dailyBonusClaimed: boolean;
  quests: IDailyQuest[];
  achievements: IAchievement[];
  // Мета
  lastSync: string | null;
  lastResetDate: string | null;
  // Игровые рекорды (произвольные ключи)
  [key: string]: any; // 👈 добавляем индексную сигнатуру для игр
}

export class TasksStore extends BaseStore<ITasksCacheData> {
  private userId: number | null = null;
  private _isSyncing: boolean = false;

  constructor() {
    super('tasks');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        balance: 0,
        tokens: 0,
        streak: 0,
        dailyBonusClaimed: false,
        quests: [],
        achievements: [],
        lastSync: null,
        lastResetDate: null,
      };
      this.save();
    }

    // Инициализация дефолтов
    if (this._data.balance === undefined) this._data.balance = 0;
    if (this._data.tokens === undefined) this._data.tokens = 0;
    if (this._data.streak === undefined) this._data.streak = 0;
    if (this._data.dailyBonusClaimed === undefined) this._data.dailyBonusClaimed = false;
    if (!this._data.quests) this._data.quests = [];
    if (!this._data.achievements) this._data.achievements = [];

    this.subscribeToEvents();
    this.checkDailyReset();
  }

  private subscribeToEvents(): void {
    eventBus.on('economy:balance:updated', (data) => {
      if (this.userId && data.userId === this.userId) {
        this._data.balance = data.newBalance;
        this.save();
      }
    }, this);

    eventBus.on('user:changed', (data) => {
      this.userId = data.userId;
      this.load();
    }, this);

    console.log('📡 TasksStore подписан на события');
  }

  // ==========================================
  // ЕЖЕДНЕВНЫЙ СБРОС (кэш)
  // ==========================================

  private checkDailyReset(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this._data.lastResetDate !== today) {
      this._data.lastResetDate = today;
      
      const quests = this._data.quests || [];
      for (const quest of quests) {
        quest.progress = 0;
        quest.completed = false;
        quest.claimed = false;
      }
      
      this._data.dailyBonusClaimed = false;
      this.save();
    }
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
      console.log('🔄 [TasksStore] Синхронизация...');

      const result = await apiClient.syncTasks();

      if (result.success) {
        if (result.balance !== undefined) {
          this._data.balance = result.balance;
        }

        if (result.dailyBonus?.streak !== undefined) {
          this._data.streak = result.dailyBonus.streak;
          this._data.dailyBonusClaimed = result.dailyBonus.claimed_today || false;
        }

        if (result.quests && Array.isArray(result.quests)) {
          this._mergeQuests(result.quests);
        }

        if (result.achievements && Array.isArray(result.achievements)) {
          this._mergeAchievements(result.achievements);
        }

        this._data.lastSync = new Date().toISOString();
        this.save();

        this._emitChange('tasks:synced', {
          balance: this._data.balance,
          streak: this._data.streak,
          quests: this._data.quests,
          achievements: this._data.achievements,
        });

        console.log('✅ [TasksStore] Синхронизация завершена');
        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ [TasksStore] Ошибка синхронизации:', err);
      return false;
    } finally {
      this._isSyncing = false;
    }
  }

  private _mergeQuests(serverQuests: any[]): void {
    const questMap = new Map<string, IDailyQuest>();
    for (const q of this._data.quests) {
      questMap.set(q.id, q);
    }

    for (const sq of serverQuests) {
      const existing = questMap.get(sq.id);
      const config = getLocalizedQuest(sq.id);

      if (existing) {
        existing.progress = sq.progress || 0;
        existing.completed = sq.completed || false;
        existing.claimed = sq.claimed || false;
        if (config) {
          existing.target = config.target;
          existing.reward = config.reward;
          // Для совместимости с типами IDailyQuest
          existing.title = typeof config.title === 'string' ? config.title : JSON.stringify(config.title);
          existing.description = typeof config.description === 'string' ? config.description : JSON.stringify(config.description);
        }
      } else if (config) {
        const newQuest: IDailyQuest = {
          id: sq.id,
          title: typeof config.title === 'string' ? config.title : JSON.stringify(config.title),
          description: typeof config.description === 'string' ? config.description : JSON.stringify(config.description),
          target: config.target,
          reward: config.reward,
          progress: sq.progress || 0,
          completed: sq.completed || false,
          claimed: sq.claimed || false,
          type: 'daily',
        };
        this._data.quests.push(newQuest);
      }
    }

    const serverQuestIds = new Set(serverQuests.map(q => q.id));
    this._data.quests = this._data.quests.filter(q => serverQuestIds.has(q.id));
  }

  private _mergeAchievements(serverAchievements: any[]): void {
    const achievementMap = new Map<string, IAchievement>();
    for (const a of this._data.achievements) {
      achievementMap.set(a.id, a);
    }

    for (const sa of serverAchievements) {
      const existing = achievementMap.get(sa.id);
      const config = getLocalizedAchievement(sa.id);

      if (existing) {
        existing.progress = sa.progress || 0;
        existing.unlocked = sa.unlocked || false;
        existing.claimed = sa.claimed || false;
        if (config) {
          existing.target = config.target;
          existing.reward = config.reward;
          existing.title = typeof config.title === 'string' ? config.title : JSON.stringify(config.title);
          existing.description = typeof config.description === 'string' ? config.description : JSON.stringify(config.description);
        }
      } else if (config) {
        const newAchievement: IAchievement = {
          id: sa.id,
          title: typeof config.title === 'string' ? config.title : JSON.stringify(config.title),
          description: typeof config.description === 'string' ? config.description : JSON.stringify(config.description),
          target: config.target,
          reward: config.reward,
          progress: sa.progress || 0,
          unlocked: sa.unlocked || false,
          claimed: sa.claimed || false,
        };
        this._data.achievements.push(newAchievement);
      }
    }

    const serverAchievementIds = new Set(serverAchievements.map(a => a.id));
    for (const config of ACHIEVEMENTS) {
      if (!serverAchievementIds.has(config.id)) {
        const newAchievement: IAchievement = {
          id: config.id,
          title: typeof config.title === 'string' ? config.title : JSON.stringify(config.title),
          description: typeof config.description === 'string' ? config.description : JSON.stringify(config.description),
          target: config.target,
          reward: config.reward,
          progress: 0,
          unlocked: false,
          claimed: false,
        };
        this._data.achievements.push(newAchievement);
      }
    }
  }

  // ==========================================
  // ЕЖЕДНЕВНЫЙ БОНУС
  // ==========================================

  async claimDailyBonus(): Promise<{ bonus: number; streak: number } | null> {
    if (!this.userId) return null;
    if (this._data.dailyBonusClaimed) return null;

    try {
      const result = await apiClient.claimDailyBonus();

      if (result.success) {
        this._data.balance = result.newBalance || this._data.balance;
        this._data.streak = result.streak || 0;
        this._data.dailyBonusClaimed = true;
        this.save();

        this._emitChange('tasks:daily_bonus_claimed', {
          bonus: result.bonus,
          streak: result.streak,
          newBalance: result.newBalance,
        });

        return {
          bonus: result.bonus || DAILY_BONUS_AMOUNT,
          streak: result.streak || 0,
        };
      }

      return null;
    } catch (err) {
      console.error('❌ [TasksStore.claimDailyBonus] Error:', err);
      return null;
    }
  }

  canClaimDailyBonus(): boolean {
    return !this._data.dailyBonusClaimed;
  }

  // ==========================================
  // ЗАДАНИЯ
  // ==========================================

  async updateQuest(questId: string, increment: number = 1): Promise<boolean> {
    if (!this.userId) return false;

    const quest = this._data.quests.find(q => q.id === questId);
    if (quest && (quest.completed || quest.claimed)) {
      return false;
    }

    try {
      const result = await apiClient.updateQuestProgress(questId, increment);

      if (result.success) {
        const q = this._data.quests.find(q => q.id === questId);
        if (q) {
          q.progress = result.progress || 0;
          q.completed = result.completed || false;
          q.claimed = result.claimed || false;
          this.save();
        }

        if (result.completed) {
          this._emitChange('tasks:quest_completed', { questId });
        }

        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ [TasksStore.updateQuest] Error:', err);
      return false;
    }
  }

  async claimQuest(questId: string): Promise<{ reward: number } | null> {
    if (!this.userId) return null;

    const quest = this._data.quests.find(q => q.id === questId);
    if (!quest || !quest.completed || quest.claimed) return null;

    const config = getLocalizedQuest(questId);
    if (!config) return null;

    try {
      const result = await apiClient.claimQuestReward(questId, config.reward);

      if (result.success) {
        quest.claimed = true;
        this._data.balance = result.newBalance || this._data.balance;
        this.save();

        this._emitChange('tasks:quest_claimed', {
          questId,
          reward: result.reward,
          newBalance: result.newBalance,
        });

        return { reward: result.reward || 0 };
      }

      return null;
    } catch (err) {
      console.error('❌ [TasksStore.claimQuest] Error:', err);
      return null;
    }
  }

  // ==========================================
  // ДОСТИЖЕНИЯ
  // ==========================================

  async updateAchievement(achievementId: string, increment: number = 1): Promise<boolean> {
    if (!this.userId) return false;

    const achievement = this._data.achievements.find(a => a.id === achievementId);
    if (achievement && (achievement.unlocked || achievement.claimed)) {
      return false;
    }

    try {
      const result = await apiClient.updateAchievementProgress(achievementId, increment);

      if (result.success) {
        const a = this._data.achievements.find(a => a.id === achievementId);
        if (a) {
          a.progress = result.progress || 0;
          a.unlocked = result.unlocked || false;
          a.claimed = result.claimed || false;
          this.save();
        }

        if (result.unlocked) {
          this._emitChange('tasks:achievement_unlocked', { achievementId });
        }

        return true;
      }

      return false;
    } catch (err) {
      console.error('❌ [TasksStore.updateAchievement] Error:', err);
      return false;
    }
  }

  async claimAchievement(achievementId: string): Promise<{ reward: number } | null> {
    if (!this.userId) return null;

    const achievement = this._data.achievements.find(a => a.id === achievementId);
    if (!achievement || !achievement.unlocked || achievement.claimed) return null;

    const config = getLocalizedAchievement(achievementId);
    if (!config) return null;

    try {
      const result = await apiClient.claimAchievementReward(achievementId, config.reward);

      if (result.success) {
        achievement.claimed = true;
        this._data.balance = result.newBalance || this._data.balance;
        this.save();

        this._emitChange('tasks:achievement_claimed', {
          achievementId,
          reward: result.reward,
          newBalance: result.newBalance,
        });

        return { reward: result.reward || 0 };
      }

      return null;
    } catch (err) {
      console.error('❌ [TasksStore.claimAchievement] Error:', err);
      return null;
    }
  }

  // ==========================================
  // ГЕТТЕРЫ
  // ==========================================

  getBalance(): number {
    return this._data.balance || 0;
  }

  getTokens(): number {
    return this._data.tokens || 0;
  }

  getStreak(): number {
    return this._data.streak || 0;
  }

  get dailyQuests(): IDailyQuest[] {
    return this._data.quests || [];
  }

  get achievements(): IAchievement[] {
    return this._data.achievements || [];
  }

  // ==========================================
  // МЕТОДЫ ДЛЯ ИГР (произвольные ключи)
  // ==========================================

  getGameData<T = any>(key: string, defaultValue: T): T {
    return (this._data[key] as T) ?? defaultValue;
  }

  setGameData<T = any>(key: string, value: T): void {
    this._data[key] = value;
    this.save();
  }

  // ==========================================
  // ТОКЕНЫ (остаются локальными)
  // ==========================================

  addTokens(amount: number, reason: string = 'Покупка'): number {
    const oldTokens = this._data.tokens;
    this._data.tokens = (this._data.tokens || 0) + amount;
    this.save();
    this._emitChange('tasks:tokens_changed', {
      oldTokens,
      newTokens: this._data.tokens,
      delta: amount,
      reason,
    });
    return this._data.tokens;
  }

  spendToken(): boolean {
    if (this._data.tokens <= 0) return false;
    const oldTokens = this._data.tokens;
    this._data.tokens--;
    this.save();
    this._emitChange('tasks:tokens_changed', {
      oldTokens,
      newTokens: this._data.tokens,
      delta: -1,
      reason: 'Использование',
    });
    return true;
  }

  // ==========================================
  // ОБМЕН (остаётся локальным)
  // ==========================================

  exchangeCoinsForTokens(coins: number): { success: boolean; tokens?: number; message?: string } {
    const rate = 10;
    if (coins < rate) return { success: false, message: 'Минимум 10 монет' };
    if (this._data.balance < coins) return { success: false, message: 'Недостаточно монет' };

    const tokens = Math.floor(coins / rate);
    this._data.balance -= coins;
    this._data.tokens = (this._data.tokens || 0) + tokens;
    this.save();

    this._emitChange('tasks:exchange', { coins, tokens });
    return { success: true, tokens };
  }

  // ==========================================
  // ОЧИСТКА
  // ==========================================

  clear(): void {
    this._data = {
      balance: 0,
      tokens: 0,
      streak: 0,
      dailyBonusClaimed: false,
      quests: [],
      achievements: [],
      lastSync: null,
      lastResetDate: null,
    };
    this.save();
    console.log('🧹 TasksStore очищен');
  }

  // ==========================================
  // ЗАГРУЗКА ПРИ ВХОДЕ
  // ==========================================

  load(): ITasksCacheData {
    // Загружаем из localStorage
    super.load();

    // Если есть userId — синхронизируем (асинхронно)
    if (this.userId) {
      this.sync().catch(err => {
        console.warn('⚠️ [TasksStore] Фоновая синхронизация не удалась:', err);
      });
    }

    return this._data;
  }
}

// Создаем экземпляр
export const tasksStore = new TasksStore();
console.log('✅ TasksStore v6.1.0 загружен');
