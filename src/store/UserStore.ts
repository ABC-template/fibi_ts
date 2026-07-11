// ============================================
// src/store/UserStore.ts
// Пользователь, настройки, лимиты, устройство
// Версия: 4.0.1 - FIXED TYPES
// ============================================

import { BaseStore } from './BaseStore';
import type { IUserStoreData, UserRole, IUserDevice } from '@types';

export class UserStore extends BaseStore<IUserStoreData> {
  constructor() {
    super('user');
    this.load();

    if (Object.keys(this._data).length === 0) {
      this._data = {
        userId: null,
        role: 'trial',
        dailyLimit: 5,
        usedToday: 0,
        syncEnabled: false,
        deviceFingerprint: null,
        signedFingerprint: null,
        deviceType: 'web',
        devicePlatform: 'web'
      };
      this.save();
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
        this._data.usedToday = 0;
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

  get dailyLimit(): number {
    return this._data.dailyLimit || 5;
  }

  get usedToday(): number {
    return this._data.usedToday || 0;
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

  // ==========================================
  // СЕТТЕРЫ
  // ==========================================

  setRole(role: UserRole, dailyLimit: number, syncEnabled: boolean): void {
    const oldRole = this._data.role;
    this._data.role = role;
    this._data.dailyLimit = dailyLimit;
    this._data.syncEnabled = syncEnabled;
    this.save();
    
    this._emitChange('user:role_changed', { 
      oldRole, 
      newRole: role, 
      dailyLimit, 
      syncEnabled 
    });
  }

  incrementUsage(): number {
    this._data.usedToday = (this._data.usedToday || 0) + 1;
    this.save();
    
    this._emitChange('user:usage_incremented', { 
      used: this._data.usedToday, 
      limit: this.dailyLimit 
    });
    
    return this._data.usedToday;
  }

  resetDailyUsage(): void {
    this._data.usedToday = 0;
    this.save();
    this._emitChange('user:usage_reset', {});
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

  // ==========================================
  // ПРОВЕРКИ
  // ==========================================

  isPro(): boolean {
    return ['premium', 'admin', 'creator'].includes(this.role);
  }

  isAdmin(): boolean {
    return ['admin', 'creator'].includes(this.role);
  }

  hasUnlimited(): boolean {
    return this.dailyLimit >= 9999;
  }

  canSync(): boolean {
    return this.syncEnabled === true && this.isPro();
  }

  hasRemainingQuota(): boolean {
    if (this.hasUnlimited()) return true;
    return this.usedToday < this.dailyLimit;
  }

  getRemainingQuota(): number {
    if (this.hasUnlimited()) return Infinity;
    return Math.max(0, this.dailyLimit - this.usedToday);
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
}

// Создаем экземпляр
export const userStore = new UserStore();
console.log('✅ UserStore v4.0.1 загружен');
