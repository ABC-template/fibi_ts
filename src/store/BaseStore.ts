// ============================================
// src/store/BaseStore.ts
// Базовый класс для всех хранилищ с изоляцией данных
// Версия: 4.0.0 - FIXED
// ============================================

import { eventBus } from '@/core/event-bus';

export class BaseStore<T extends Record<string, any> = Record<string, any>> {
  protected storeName: string;
  public _data: T;  // ← сделали public для доступа из app.ts
  protected _loaded: boolean = false;
  protected _eventBus = eventBus;

  constructor(storeName: string) {
    this.storeName = storeName;
    this._data = {} as T;
  }

  // ==========================================
  // ПОЛУЧЕНИЕ ID ПОЛЬЗОВАТЕЛЯ
  // ==========================================

  protected getTelegramId(): number | null {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData;
      if (initData) {
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        if (userStr) {
          try {
            const user = JSON.parse(decodeURIComponent(userStr));
            if (user?.id) return user.id;
          } catch (e) {}
        }
      }
      
      const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      return user?.id || null;
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // ФОРМИРОВАНИЕ КЛЮЧА ДЛЯ STORAGE
  // ==========================================

  protected getStorageKey(subKey: string = ''): string {
    const telegramId = this.getTelegramId();
    const id = telegramId || 'default';
    
    const prefixMap: Record<string, string> = {
      'chat': 'tg_chat_histories_',
      'user': 'user_store_data_',
      'organizer': 'organizer_',
      'tasks': 'tasks_',
      'jwt': 'jwt_token_',
      'temp': 'temp_'
    };
    
    const prefix = prefixMap[this.storeName] || `${this.storeName}_`;
    if (subKey) {
      return `${prefix}${id}_${subKey}`;
    }
    return `${prefix}${id}`;
  }

  // ==========================================
  // ЗАГРУЗКА / СОХРАНЕНИЕ
  // ==========================================

  load(): T {
    const storageKey = this.getStorageKey();
    try {
      const data = localStorage.getItem(storageKey);
      if (data) {
        try {
          this._data = JSON.parse(data);
        } catch (parseError) {
          console.warn(`⚠️ Ошибка парсинга ${this.storeName}:`, parseError);
          this._data = {} as T;
        }
      } else {
        this._data = {} as T;
      }
      this._loaded = true;
    } catch (e) {
      console.warn(`⚠️ Ошибка загрузки ${this.storeName}:`, e);
      this._data = {} as T;
      this._loaded = true;
    }
    return this._data;
  }

  save(): void {
    const storageKey = this.getStorageKey();
    try {
      localStorage.setItem(storageKey, JSON.stringify(this._data));
      this._emitChange('data:saved', { store: this.storeName });
    } catch (e) {
      console.error(`❌ Ошибка сохранения ${this.storeName}:`, e);
    }
  }

  // ==========================================
  // JWT (с привязкой к пользователю)
  // ==========================================

  saveJWT(token: string | null): void {
    const telegramId = this.getTelegramId();
    const id = telegramId || 'default';
    if (!token) {
      localStorage.removeItem(`jwt_token_${id}`);
      return;
    }
    localStorage.setItem(`jwt_token_${id}`, token);
    console.log(`🔑 JWT сохранен`);
    this._emitChange('auth:jwt_updated', { token: token ? 'present' : 'null' });
  }

  getJWT(): string | null {
    const telegramId = this.getTelegramId();
    const id = telegramId || 'default';
    return localStorage.getItem(`jwt_token_${id}`);
  }

  clearJWT(): void {
    const telegramId = this.getTelegramId();
    const id = telegramId || 'default';
    localStorage.removeItem(`jwt_token_${id}`);
    console.log(`🗑️ JWT удален`);
    this._emitChange('auth:jwt_cleared', {});
  }

  // ==========================================
  // SYNC TOKEN (БЕЗ ПРИВЯЗКИ К ПОЛЬЗОВАТЕЛЮ!)
  // ==========================================

  saveSyncToken(token: string | null): void {
    if (!token) {
      localStorage.removeItem('sync_token');
      return;
    }
    localStorage.setItem('sync_token', token);
    console.log(`🔄 SyncToken сохранен: ${token.substring(0, 8)}...`);
    this._emitChange('sync:token_updated', { token: token.substring(0, 8) + '...' });
  }

  getSyncToken(): string | null {
    return localStorage.getItem('sync_token');
  }

  clearSyncToken(): void {
    localStorage.removeItem('sync_token');
    console.log(`🗑️ SyncToken удален`);
    this._emitChange('sync:token_cleared', {});
  }

  // ==========================================
  // ОЧИСТКА (данные + токены)
  // ==========================================

  clear(): void {
    const telegramId = this.getTelegramId();
    const id = telegramId || 'default';
    
    this._data = {} as T;
    this.save();
    
    localStorage.removeItem(`jwt_token_${id}`);
    localStorage.removeItem('sync_token');
    
    console.log(`🧹 Данные ${this.storeName} и sync_token очищены для пользователя ${id}`);
    this._emitChange('store:cleared', { store: this.storeName });
  }

  // ==========================================
  // ОБЩИЕ МЕТОДЫ ДЛЯ РАБОТЫ С ДАННЫМИ
  // ==========================================

  get<K extends keyof T>(key: K, defaultValue: T[K] | null = null): T[K] | null {
    if (!this._loaded) this.load();
    return this._data[key] !== undefined ? this._data[key] : defaultValue;
  }

  set<K extends keyof T>(key: K, value: T[K]): T[K] {
    if (!this._loaded) this.load();
    this._data[key] = value;
    this.save();
    return value;
  }

  remove<K extends keyof T>(key: K): void {
    if (!this._loaded) this.load();
    delete this._data[key];
    this.save();
  }

  has<K extends keyof T>(key: K): boolean {
    if (!this._loaded) this.load();
    return this._data[key] !== undefined;
  }

  getAll(): T {
    if (!this._loaded) this.load();
    return { ...this._data };
  }

  setAll(data: T): void {
    this._data = { ...data };
    this.save();
  }

  reset(): void {
    this._data = {} as T;
    this._loaded = false;
    console.log(`🔄 Кеш ${this.storeName} сброшен`);
    this._emitChange('store:reset', { store: this.storeName });
  }

  reload(): T {
    this._loaded = false;
    return this.load();
  }

  // ==========================================
  // РАБОТА С СОБЫТИЯМИ
  // ==========================================

  protected _emitChange(event: string, data: any = null): void {
    this._eventBus.emit(event, data, this);
  }

  on(event: string, callback: (data: any) => void, context: any = null): () => void {
    return this._eventBus.on(event, callback, context);
  }

  once(event: string, callback: (data: any) => void, context: any = null): () => void {
    return this._eventBus.once(event, callback, context);
  }

  off(event: string, listenerId: string): boolean {
    return this._eventBus.off(event, listenerId);
  }

  offAll(context: any): number {
    return this._eventBus.offAll(context);
  }

  // ==========================================
  // ГЕНЕРАЦИЯ UUID
  // ==========================================

  generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
