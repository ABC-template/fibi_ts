// ============================================
// src/store/UserStore.ts
// Пользователь: Telegram ID, роль, синхронизация, тариф
// Версия: 6.4.0 — удалены неиспользуемые поля устройства (fingerprint, тип, платформа),
//                  имя/фото/username и методы isAdmin, getAvatarUrl, getDisplayName
//          6.3.0 — убраны trialUsed / markTrialUsed (пробного периода больше нет)
//          6.2.0 — доступ к админке (isCreator) по флагу сервера adminPanel
//                  (список ADMIN_TELEGRAM_IDS / CREATOR_ID), без ID в коде
//          6.1.0 — хранится тариф (subscription_tier) и дата окончания с сервера
//          6.0.0 — без usedToday/dailyLimit
// ============================================

import { BaseStore } from './BaseStore';
import type { IUserStoreData, UserRole } from '@app-types';

export class UserStore extends BaseStore<IUserStoreData> {
  constructor() {
    super('user');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        userId: null,
        role: 'trial',
        syncEnabled: false,
        premium_until: null,
      };
      this.save();
    }

    // ✅ Инициализация новых полей (с проверкой)
    if (!('premium_until' in this._data)) {
      this._data.premium_until = null;
    }

    this.initFromTelegram();
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ ИЗ TELEGRAM
  // ==========================================

  private initFromTelegram(): void {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    
    if (user) {
      const currentUserId = user.id;
      const storedUserId = this._data.userId;
      
      if (storedUserId && storedUserId !== currentUserId) {
        console.log(`🔄 Пользователь сменился: ${storedUserId} → ${currentUserId}`);
        this._data.userId = currentUserId;
        this._data.languageCode = user.language_code || 'ru';
        this.save();
        this._emitChange('user:changed', { 
          userId: currentUserId, 
          username: user.username 
        });
      } else if (!storedUserId) {
        this._data.userId = currentUserId;
        this._data.languageCode = user.language_code || 'ru';
        this.save();
        this._emitChange('user:created', { 
          userId: currentUserId, 
          username: user.username 
        });
      }
    }
  }

  // ==========================================
  // ГЕТТЕРЫ
  // ==========================================

  get userId(): number | null {
    return this._data.userId;
  }

  set userId(value: number | null) {
    this._data.userId = value;
    this.save();
  }

  get languageCode(): string {
    return this._data.languageCode || 'ru';
  }

  get role(): UserRole {
    return this._data.role || 'trial';
  }


  get syncEnabled(): boolean {
    return this._data.syncEnabled || false;
  }

  /** Доступ к админ-панели — решает сервер (auth/check → adminPanel) */
  get isCreator(): boolean {
    return this._data.adminPanel === true;
  }

  // ✅ НОВЫЕ ГЕТТЕРЫ
  get premiumUntil(): string | null {
    return this._data.premium_until || null;
  }

  /** Тариф для цен: trial / ключ платного тарифа (для admin/creator — как пришёл с сервера) */
  get subscriptionTier(): string {
    return this._data.subscription_tier || 'trial';
  }

  // ==========================================
  // СЕТТЕРЫ
  // ==========================================

  /** Тариф и дата окончания — из ответа auth/check */
  setSubscription(tier: string | null | undefined, premiumUntil: string | null | undefined): void {
    this._data.subscription_tier = tier || 'trial';
    this._data.premium_until = premiumUntil || null;
    this.save();
  }

  /** Флаг доступа к админ-панели из ответа auth/check */
  setAdminPanel(value: boolean): void {
    this._data.adminPanel = value === true;
    this.save();
  }

  setRole(role: UserRole, syncEnabled: boolean): void {
    const oldRole = this._data.role;
    this._data.role = role;
    this._data.syncEnabled = syncEnabled;
    this.save();
    console.log(`👤 [UserStore] Роль обновлена: ${oldRole} → ${role}`);
    this._emitChange('user:role_changed', {
      oldRole,
      newRole: role,
      syncEnabled,
    });
  }



  // ==========================================
  // ПРОВЕРКИ
  // ==========================================

  isPro(): boolean {
    return ['premium', 'admin', 'creator'].includes(this.role);
  }


  canSync(): boolean {
    return this.syncEnabled === true && this.isPro();
  }



}

export const userStore = new UserStore();
