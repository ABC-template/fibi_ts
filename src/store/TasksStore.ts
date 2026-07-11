// ============================================
// src/store/TasksStore.ts
// Хранилище заданий, баланса, прогресса
// Версия: 3.0.1 - FIXED TYPES
// ============================================

import { BaseStore } from './BaseStore';
import type {
  ITasksStoreData,
  IDailyQuest,
  IAchievement,
  IExchangeResult,
  IDailyBonusResult
} from '@types';

export class TasksStore extends BaseStore<ITasksStoreData> {
  constructor() {
    super('tasks');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        balance: 0,
        tokens: 0,
        dailyQuests: [],
        achievements: [],
        lastResetDate: null,
        streakDays: 0,
        lastLoginDate: null,
        claimedDailyBonus: false
      };
      this.save();
    }

    if (this._data.balance === undefined) this._data.balance = 0;
    if (this._data.tokens === undefined) this._data.tokens = 0;
    if (!this._data.dailyQuests) this._data.dailyQuests = [];
    if (!this._data.achievements) this._data.achievements = [];
    if (this._data.streakDays === undefined) this._data.streakDays = 0;
    if (this._data.claimedDailyBonus === undefined) this._data.claimedDailyBonus = false;
    if (this._data.lastResetDate === undefined) this._data.lastResetDate = null;
    if (this._data.lastLoginDate === undefined) this._data.lastLoginDate = null;

    this.save();

    this.checkDailyReset();
    this.initQuests();
    this.initAchievements();
    this.save();
  }

  // ==========================================
  // ЕЖЕДНЕВНЫЙ СБРОС
  // ==========================================

  private checkDailyReset(): void {
    const today = new Date().toDateString();
    if (this._data.lastResetDate !== today) {
      this._data.dailyQuests = this._data.dailyQuests.map(q => ({
        ...q,
        progress: 0,
        completed: false,
        claimed: false
      }));
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();
      
      if (this._data.lastLoginDate === yesterdayStr) {
        this._data.streakDays++;
      } else if (this._data.lastLoginDate !== today) {
        this._data.streakDays = 1;
      }
      
      this._data.lastResetDate = today;
      this._data.claimedDailyBonus = false;
      
      console.log(`📅 Ежедневный сброс заданий. Стрик: ${this._data.streakDays} дней`);
      this.save();
      this._emitChange('tasks:daily_reset', { 
        streak: this._data.streakDays,
        quests: this._data.dailyQuests.length
      });
    }
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ ЗАДАНИЙ
  // ==========================================

  private initQuests(): void {
    if (this._data.dailyQuests.length === 0) {
      this._data.dailyQuests = [
        {
          id: 'send_message_1',
          title: '📝 Отправить 1 сообщение',
          description: 'Напиши сообщение в чат с AI',
          target: 1,
          progress: 0,
          reward: 5,
          completed: false,
          claimed: false,
          type: 'daily'
        },
        {
          id: 'send_message_5',
          title: '📝 Отправить 5 сообщений',
          description: 'Отправь 5 сообщений в чат с AI',
          target: 5,
          progress: 0,
          reward: 10,
          completed: false,
          claimed: false,
          type: 'daily'
        },
        {
          id: 'add_todo',
          title: '✅ Добавить задачу в To-Do',
          description: 'Создай новую задачу в органайзере',
          target: 1,
          progress: 0,
          reward: 3,
          completed: false,
          claimed: false,
          type: 'daily'
        },
        {
          id: 'complete_todo_3',
          title: '✅ Выполнить 3 задачи',
          description: 'Отметь 3 задачи как выполненные',
          target: 3,
          progress: 0,
          reward: 8,
          completed: false,
          claimed: false,
          type: 'daily'
        },
        {
          id: 'create_reminder',
          title: '⏰ Создать напоминание',
          description: 'Поставь будильник в органайзере',
          target: 1,
          progress: 0,
          reward: 5,
          completed: false,
          claimed: false,
          type: 'daily'
        },
        {
          id: 'daily_login',
          title: '📆 Ежедневный вход',
          description: `Заходи в приложение ${this._data.streakDays + 1} день подряд`,
          target: 1,
          progress: 0,
          reward: 2 + this._data.streakDays,
          completed: false,
          claimed: false,
          type: 'daily',
          bonus: true
        }
      ];
      this.save();
      this._emitChange('tasks:quests_initialized', { 
        count: this._data.dailyQuests.length 
      });
    }
  }

  private initAchievements(): void {
    if (this._data.achievements.length === 0) {
      this._data.achievements = [
        {
          id: 'first_chat',
          title: '🚀 Первый чат',
          description: 'Создай свой первый чат',
          reward: 10,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 1
        },
        {
          id: 'chat_100',
          title: '💬 100 сообщений',
          description: 'Отправь 100 сообщений в чатах',
          reward: 50,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 100
        },
        {
          id: 'todo_50',
          title: '📋 50 задач в To-Do',
          description: 'Добавь 50 задач в органайзер',
          reward: 30,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 50
        },
        {
          id: 'assistants_5',
          title: '👥 5 ассистентов',
          description: 'Используй 5 разных ассистентов',
          reward: 40,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 5
        },
        {
          id: 'streak_7',
          title: '🔥 Стрик 7 дней',
          description: 'Заходи в приложение 7 дней подряд',
          reward: 50,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 7
        },
        {
          id: 'streak_30',
          title: '🔥 Стрик 30 дней',
          description: 'Заходи в приложение 30 дней подряд',
          reward: 200,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 30
        },
        {
          id: 'coins_100',
          title: '🪙 100 монет',
          description: 'Заработай 100 Fibi Coins',
          reward: 20,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 100
        },
        {
          id: 'reminder_10',
          title: '⏰ 10 напоминаний',
          description: 'Создай 10 напоминаний',
          reward: 25,
          unlocked: false,
          claimed: false,
          progress: 0,
          target: 10
        }
      ];
      this.save();
      this._emitChange('tasks:achievements_initialized', { 
        count: this._data.achievements.length 
      });
    }
  }

  // ==========================================
  // ОБНОВЛЕНИЕ ПРОГРЕССА
  // ==========================================

  updateQuestProgress(questId: string, increment: number = 1): void {
    const quest = this._data.dailyQuests.find(q => q.id === questId);
    if (!quest || quest.completed || quest.claimed) return;
    
    quest.progress = Math.min(quest.progress + increment, quest.target);
    
    if (quest.progress >= quest.target) {
      quest.completed = true;
      console.log(`✅ Задание выполнено: ${quest.title}`);
      this._emitChange('tasks:quest_completed', { quest });
    }
    
    this.save();
    this._emitChange('tasks:quest_progress', { questId, progress: quest.progress });
  }

  updateAchievementProgress(achievementId: string, increment: number = 1): void {
    const achievement = this._data.achievements.find(a => a.id === achievementId);
    if (!achievement || achievement.unlocked) return;
    
    achievement.progress = Math.min(achievement.progress + increment, achievement.target);
    
    if (achievement.progress >= achievement.target) {
      achievement.unlocked = true;
      console.log(`🏆 Достижение разблокировано: ${achievement.title}`);
      this.addBalance(achievement.reward, `Достижение: ${achievement.title}`);
      this._emitChange('tasks:achievement_unlocked', { achievement });
    }
    
    this.save();
    this._emitChange('tasks:achievement_progress', { 
      achievementId, 
      progress: achievement.progress 
    });
  }

  // ==========================================
  // БАЛАНС
  // ==========================================

  getBalance(): number {
    return this._data.balance || 0;
  }

  getTokens(): number {
    return this._data.tokens || 0;
  }

  addBalance(amount: number, reason: string = 'Награда'): number {
    const oldBalance = this._data.balance;
    this._data.balance = (this._data.balance || 0) + amount;
    this.save();
    console.log(`🪙 +${amount} монет (${reason}). Баланс: ${this._data.balance}`);
    
    this._emitChange('tasks:balance_changed', { 
      oldBalance, 
      newBalance: this._data.balance,
      delta: amount,
      reason
    });
    
    if (this._data.balance >= 100) {
      this.updateAchievementProgress('coins_100', 100);
    }
    return this._data.balance;
  }

  spendBalance(amount: number, reason: string = 'Трата'): boolean {
    if (this._data.balance < amount) return false;
    const oldBalance = this._data.balance;
    this._data.balance -= amount;
    this.save();
    console.log(`🪙 -${amount} монет (${reason}). Баланс: ${this._data.balance}`);
    
    this._emitChange('tasks:balance_changed', { 
      oldBalance, 
      newBalance: this._data.balance,
      delta: -amount,
      reason
    });
    return true;
  }

  addTokens(amount: number, reason: string = 'Покупка'): number {
    const oldTokens = this._data.tokens;
    this._data.tokens = (this._data.tokens || 0) + amount;
    this.save();
    console.log(`🔑 +${amount} токенов (${reason}). Токенов: ${this._data.tokens}`);
    
    this._emitChange('tasks:tokens_changed', { 
      oldTokens, 
      newTokens: this._data.tokens,
      delta: amount,
      reason
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
      reason: 'Использование'
    });
    return true;
  }

  // ==========================================
  // ЕЖЕДНЕВНЫЙ БОНУС
  // ==========================================

  claimDailyBonus(): IDailyBonusResult | false {
    if (this._data.claimedDailyBonus) return false;
    
    const bonus = 2 + this._data.streakDays;
    this.addBalance(bonus, 'Ежедневный бонус');
    this._data.claimedDailyBonus = true;
    this._data.lastLoginDate = new Date().toDateString();
    this._data.streakDays = Math.min(this._data.streakDays + 1, 365);
    
    if (this._data.streakDays >= 7) {
      this.updateAchievementProgress('streak_7', 7);
    }
    if (this._data.streakDays >= 30) {
      this.updateAchievementProgress('streak_30', 30);
    }
    
    this.save();
    this._emitChange('tasks:daily_bonus_claimed', { bonus, streak: this._data.streakDays });
    return { bonus, streak: this._data.streakDays };
  }

  canClaimDailyBonus(): boolean {
    return !this._data.claimedDailyBonus;
  }

  // ==========================================
  // ОБМЕН
  // ==========================================

  exchangeCoinsForTokens(coins: number): IExchangeResult {
    const rate = 10;
    if (coins < rate) return { success: false, message: 'Минимум 10 монет' };
    if (this._data.balance < coins) return { success: false, message: 'Недостаточно монет' };
    
    const tokens = Math.floor(coins / rate);
    this.spendBalance(coins, `Обмен ${coins} монет на ${tokens} токенов`);
    this.addTokens(tokens, `Обмен ${coins} монет`);
    
    this._emitChange('tasks:exchange', { coins, tokens });
    return { success: true, tokens, coins };
  }

  // ==========================================
  // СБРОС ВСЕХ ДАННЫХ
  // ==========================================

  reset(): void {
    const userId = this.getTelegramId();
    const key = this.getStorageKey();
    localStorage.removeItem(key);
    this._data = {
      balance: 0,
      tokens: 0,
      dailyQuests: [],
      achievements: [],
      lastResetDate: null,
      streakDays: 0,
      lastLoginDate: null,
      claimedDailyBonus: false
    };
    this.initQuests();
    this.initAchievements();
    this.save();
    console.log('🔄 Таски сброшены');
    this._emitChange('tasks:reset', {});
  }

  get dailyQuests(): IDailyQuest[] {
    return this._data.dailyQuests || [];
  }

  get achievements(): IAchievement[] {
    return this._data.achievements || [];
  }

  get streakDays(): number {
    return this._data.streakDays || 0;
  }
}

// Создаем экземпляр
export const tasksStore = new TasksStore();
console.log('✅ TasksStore v3.0.1 загружен');
