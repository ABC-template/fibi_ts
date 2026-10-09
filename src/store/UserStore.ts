// ============================================
// src/store/UserStore.ts
// Пользователь, настройки, лимиты, устройство
// Версия: 6.0.0 — без usedToday/dailyLimit
// ============================================

import { BaseStore } from './BaseStore';
import type { IUserStoreData, UserRole, IUserDevice } from '@app-types';

export class UserStore extends BaseStore<IUserStoreData> {
  constructor() {
    super('user');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        userId: null,
        role: 'trial',
        syncEnabled: false,
        deviceFingerprint: null,
        signedFingerprint: null,
        deviceType: 'web',
        devicePlatform: 'web',
        premium_until: null,
        trialUsed: false,
      };
      this.save();
    }

    // ✅ Инициализация новых полей (с проверкой)
    if (!('premium_until' in this._data)) {
      this._data.premium_until = null;
    }
    if (!('trialUsed' in this._data)) {
      this._data.trialUsed = false;
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
        this._data.username = user.username || null;
        this._data.firstName = user.first_name || '';
        this._data.lastName = user.last_name || '';
        this._data.languageCode = user.language_code || 'ru';
        this._data.photoUrl = user.photo_url || null;
        this.save();
        this._emitChange('user:changed', { 
          userId: currentUserId, 
          username: user.username 
        });
      } else if (!storedUserId) {
        this._data.userId = currentUserId;
        this._data.username = user.username || null;
        this._data.firstName = user.first_name || '';
        this._data.lastName = user.last_name || '';
        this._data.languageCode = user.language_code || 'ru';
        this._data.photoUrl = user.photo_url || null;
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

  get username(): string | null | undefined {
    return this._data.username;
  }

  get firstName(): string {
    return this._data.firstName || '';
  }

  get lastName(): string {
    return this._data.lastName || '';
  }

  get languageCode(): string {
    return this._data.languageCode || 'ru';
  }

  get photoUrl(): string | null | undefined {
    return this._data.photoUrl || null;
  }

  get role(): UserRole {
    return this._data.role || 'trial';
  }


  get syncEnabled(): boolean {
    return this._data.syncEnabled || false;
  }

  get deviceFingerprint(): string | null {
    return this._data.deviceFingerprint || null;
  }

  get signedFingerprint(): string | null {
    return this._data.signedFingerprint || null;
  }

  get deviceType(): string {
    return this._data.deviceType || 'web';
  }

  get devicePlatform(): string {
    return this._data.devicePlatform || 'web';
  }

  get isCreator(): boolean {
    return this.userId === 1541531808;
  }

  // ✅ НОВЫЕ ГЕТТЕРЫ
  get premiumUntil(): string | null {
    return this._data.premium_until || null;
  }

  get trialUsed(): boolean {
    return this._data.trialUsed || false;
  }

  // ==========================================
  // СЕТТЕРЫ
  // ==========================================

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



  setDeviceFingerprint(fingerprint: string, signed: string, deviceType: string = 'web', platform: string = 'web'): void {
    this._data.deviceFingerprint = fingerprint;
    this._data.signedFingerprint = signed || fingerprint;
    this._data.deviceType = deviceType;
    this._data.devicePlatform = platform;
    this.save();
    this._emitChange('user:device_registered', { deviceType, platform });
  }

  getDeviceFingerprint(): string | null {
    return this._data.signedFingerprint || this._data.deviceFingerprint || null;
  }

  // ✅ НОВЫЙ МЕТОД
  markTrialUsed(): void {
    this._data.trialUsed = true;
    this.save();
    this._emitChange('user:trial_used', {});
  }

  // ==========================================
  // ПРОВЕРКИ
  // ==========================================

  isPro(): boolean {
    return ['premium', 'admin', 'creator'].includes(this.role);
  }

  isAdmin(): boolean {
    return ['admin', 'creator'].includes(this.role);
  }


  canSync(): boolean {
    return this.syncEnabled === true && this.isPro();
  }



  getAvatarUrl(): string {
    return this.photoUrl || 'https://gravatar.com/avatar/00000000000000000000000000000000?d=mp';
  }

  getDisplayName(): string {
    let name = this.firstName;
    if (this.lastName) {
      name += ' ' + this.lastName;
    }
    return name || 'Пользователь';
  }

  // ==========================================
  // СИНХРОНИЗАЦИЯ ЛИМИТА С СЕРВЕРОМ
  // ==========================================

}

export const userStore = new UserStore();
console.log('✅ UserStore v6.0.0 загружен (без request-quota)');
