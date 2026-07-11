// ============================================
// src/services/auth.ts
// Сервис авторизации (с JWT и авто-рефрешем)
// Версия: 5.0.2 - FIXED TYPES
// ============================================

import { apiClient } from './api';
import { userStore } from '@/store/UserStore';
import { BaseStore } from '@/store/BaseStore';
import type { IAuthCheckResponse } from '@types';

export interface IAuthResult {
  isMember: boolean;
  role: string;
  dailyLimit: number;
  syncEnabled: boolean;
  syncToken: string | null;
  dataDeadline: string | null;
  jwtToken: string | null;
  authUserId: string | null;
  isNewUser: boolean;
  serverModels: Record<string, boolean>;
}

export class AuthService {
  private jwtToken: string | null = null;
  private authUserId: string | null = null;
  private syncToken: string | null = null;
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly SESSION_TIMEOUT = 25 * 60 * 1000;
  private readonly REFRESH_INTERVAL = 55 * 60 * 1000;

  constructor() {
    this.startRefreshTimer();
  }

  getUserId(): number | null {
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    return user?.id || null;
  }

  // ==========================================
  // ТАЙМЕР РЕФРЕША JWT
  // ==========================================

  private startRefreshTimer(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
      this.refreshJWT();
    }, this.REFRESH_INTERVAL);
  }

  async refreshJWT(): Promise<void> {
    try {
      console.log('🔄 Автоматический рефреш JWT...');
      const result = await this.checkSubscription();
      if (result.jwtToken) {
        this.jwtToken = result.jwtToken;
        this.authUserId = result.authUserId;
        const tempStore = new BaseStore('temp');
        tempStore.saveJWT(result.jwtToken);
        console.log('✅ JWT обновлен');
        
        if ((window as any).syncService) {
          (window as any).syncService.reconnect();
        }
      }
      this.startRefreshTimer();
    } catch (err) {
      console.error('❌ Ошибка рефреша JWT:', err);
      this.startRefreshTimer();
    }
  }

  // ==========================================
  // ПРОВЕРКА ПОДПИСКИ
  // ==========================================

  async checkSubscription(): Promise<IAuthResult> {
    try {
      const data = await apiClient.get<IAuthCheckResponse>('/auth/check');
      
      if ((data as any).error) {
        console.error('Ошибка проверки подписки:', (data as any).error);
        return this.fallbackToOffline();
      }

      const newSyncToken = data.syncToken;

      if (data.jwtToken) {
        this.jwtToken = data.jwtToken;
        const tempStore = new BaseStore('temp');
        tempStore.saveJWT(data.jwtToken);
        console.log('✅ JWT токен сохранен');
      }

      if (data.authUserId) {
        this.authUserId = data.authUserId;
        localStorage.setItem('auth_user_id', data.authUserId);
      }

      if (newSyncToken) {
        console.log(`🔑 sync_token получен с сервера: ${newSyncToken.substring(0, 8)}... (будет сохранен после проверки)`);
      }

      userStore.setRole(
        data.role || 'trial',
        data.dailyLimit || 5,
        data.syncEnabled === true
      );

      if (data.userId) {
        userStore.userId = data.userId;
      }

      if (data.dataDeadline) {
        localStorage.setItem('data_deadline', data.dataDeadline);
      } else {
        localStorage.removeItem('data_deadline');
      }

      localStorage.setItem('user_role', data.role || 'trial');
      localStorage.setItem('session_active', 'true');
      localStorage.setItem('session_start', String(Date.now()));

      userStore.save();

      return {
        isMember: data.isMember !== false,
        role: data.role || 'trial',
        dailyLimit: data.dailyLimit || 5,
        syncEnabled: data.syncEnabled === true,
        syncToken: newSyncToken || null,
        dataDeadline: data.dataDeadline || null,
        jwtToken: data.jwtToken || null,
        authUserId: data.authUserId || null,
        isNewUser: data.isNewUser || false,
        serverModels: data.serverModels || {}
      };

    } catch (err) {
      console.error('Auth check error:', err);
      return this.fallbackToOffline();
    }
  }

  // ==========================================
  // ПОЛУЧЕНИЕ ТОКЕНОВ
  // ==========================================

  getJWT(): string | null {
    const tempStore = new BaseStore('temp');
    return tempStore.getJWT();
  }

  getAuthUserId(): string | null {
    return this.authUserId || localStorage.getItem('auth_user_id') || null;
  }

  getSyncToken(): string | null {
    const tempStore = new BaseStore('temp');
    return tempStore.getSyncToken();
  }

  // ==========================================
  // ПРОВЕРКА НЕОБХОДИМОСТИ ПОЛНОЙ ПЕРЕЗАГРУЗКИ
  // ==========================================

  needFullReload(serverToken: string | null): boolean {
    const tempStore = new BaseStore('temp');
    const localToken = tempStore.getSyncToken();
    
    console.log(`🔍 needFullReload: localToken=${localToken ? localToken.substring(0, 8) + '...' : 'null'}, serverToken=${serverToken ? serverToken.substring(0, 8) + '...' : 'null'}`);
    
    if (!localToken) {
      console.log('🔄 Нет локального sync_token → полная загрузка');
      return true;
    }
    
    if (!serverToken) {
      console.log('⚠️ Нет серверного sync_token → полная загрузка');
      return true;
    }
    
    if (serverToken !== localToken) {
      console.log(`🔄 sync_token не совпадает: ${localToken.substring(0, 8)} → ${serverToken.substring(0, 8)}`);
      return true;
    }
    
    console.log('✅ sync_token совпадает → используем кеш');
    return false;
  }

  // ==========================================
  // ПРОВЕРКА СЕССИИ
  // ==========================================

  checkSession(): 'new_session' | 'current_session' {
    const sessionStart = parseInt(localStorage.getItem('session_start') || '0');
    const isActive = localStorage.getItem('session_active') === 'true';
    const isExpired = (Date.now() - sessionStart) > this.SESSION_TIMEOUT;

    if (!isActive || isExpired) {
      localStorage.setItem('session_active', 'true');
      localStorage.setItem('session_start', String(Date.now()));
      return 'new_session';
    }
    return 'current_session';
  }

  // ==========================================
  // ВЫХОД
  // ==========================================

  logout(): void {
    this.jwtToken = null;
    this.authUserId = null;
    this.syncToken = null;
    
    const tempStore = new BaseStore('temp');
    tempStore.clearJWT();
    tempStore.clearSyncToken();
    
    localStorage.removeItem('auth_user_id');
    localStorage.removeItem('session_active');
    
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    
    if ((window as any).syncService) {
      (window as any).syncService.unsubscribe();
    }
    
    console.log('👋 Выход выполнен');
  }

  // ==========================================
  // ОФЛАЙН-РЕЖИМ
  // ==========================================

  private fallbackToOffline(): IAuthResult {
    if (userStore.isCreator) {
      userStore.setRole('creator', 9999, true);
      userStore.save();
      return {
        isMember: true,
        role: 'creator',
        dailyLimit: 9999,
        syncEnabled: true,
        syncToken: this.getSyncToken() || null,
        dataDeadline: localStorage.getItem('data_deadline') || null,
        jwtToken: this.getJWT() || null,
        authUserId: localStorage.getItem('auth_user_id') || null,
        isNewUser: false,
        serverModels: {}
      };
    }

    const savedRole = localStorage.getItem('user_role');
    if (savedRole === 'admin' || savedRole === 'creator') {
      userStore.setRole(savedRole as any, 9999, true);
      userStore.save();
      return {
        isMember: true,
        role: savedRole,
        dailyLimit: 9999,
        syncEnabled: true,
        syncToken: this.getSyncToken() || null,
        dataDeadline: localStorage.getItem('data_deadline') || null,
        jwtToken: this.getJWT() || null,
        authUserId: localStorage.getItem('auth_user_id') || null,
        isNewUser: false,
        serverModels: {}
      };
    }

    userStore.setRole('guest', 0, false);
    userStore.save();
    return {
      isMember: false,
      role: 'guest',
      dailyLimit: 0,
      syncEnabled: false,
      syncToken: null,
      dataDeadline: null,
      jwtToken: null,
      authUserId: null,
      isNewUser: false,
      serverModels: {}
    };
  }

  // ==========================================
  // СТАТИСТИКА ПОЛЬЗОВАТЕЛЯ
  // ==========================================

  async getUserStats(): Promise<any> {
    try {
      const data = await apiClient.get('/users/stats');
      if (data.success && data.stats) {
        return data.stats;
      }
      return null;
    } catch (err) {
      console.error('Get user stats error:', err);
      return null;
    }
  }
}

// Создаем экземпляр
export const authService = new AuthService();
console.log('✅ AuthService v5.0.2 загружен');
