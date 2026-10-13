// ============================================
// src/services/auth.ts
// Сервис авторизации (Telegram initData; без JWT)
// Версия: 7.2.0 - в результате access (блокировка / нужна подписка на канал, ссылка)
//          7.1.0 - в результате previousRole (роль до проверки): app.ts читал user_role уже
//                 после перезаписи, и переходы trial ↔ PRO никогда не срабатывали
//          7.0.0 - JWT и его таймер обновления убраны; токен Realtime из ответа передаётся
//                 в syncService; флаг админки (adminPanel) — с сервера; офлайн-режим
//                 берёт роль из последнего успешного входа
//          5.3.0 - в результат входа передаются баланс, бонус дня и ежедневный вход (checkin)
//          5.2.0 - тариф и дата окончания подписки сохраняются в UserStore
//          5.1.1 - замена @types → @app-types
// ============================================

import { apiClient } from './api';
import { userStore } from '@/store/UserStore';
import { BaseStore } from '@/store/BaseStore';
import type { IAuthCheckResponse } from '@app-types';

export interface IAccessInfo {
  blocked: boolean;
  blockReason: string | null;
  blockExpiresAt: string | null;
  channelRequired: boolean;
  channelUrl: string | null;
}

export interface IAuthResult {
  isMember: boolean;
  /** Доступ к приложению (null — офлайн, неизвестно) */
  access?: IAccessInfo | null;
  role: string;
  /** Роль до этой проверки (из прошлого входа) — для переходов trial ↔ PRO */
  previousRole: string | null;
  syncEnabled: boolean;
  syncToken: string | null;
  dataDeadline: string | null;
  isNewUser: boolean;
  serverModels: Record<string, boolean>;
  /** Баланс энергии на момент входа */
  tokens?: { bonus: number; permanent: number; total: number };
  /** Сколько бонусной энергии начислено сегодня при входе */
  today_bonus_added?: number;
  /** Ежедневный вход, выполненный сервером (null — не удалось) */
  checkin?: {
    claimed: boolean;
    streak: number;
    base: number;
    bonus: number;
    reward: number;
    coins: number | null;
  } | null;
}

export class AuthService {
  private readonly SESSION_TIMEOUT = 25 * 60 * 1000;

  getUserId(): number | null {
    const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    return user?.id || null;
  }

  // ==========================================
  // ПРОВЕРКА ПОДПИСКИ
  // ==========================================

  async checkSubscription(): Promise<IAuthResult> {
    // Читаем до того, как ответ сервера перезапишет user_role
    const previousRole = localStorage.getItem('user_role');
    try {
      const data = await apiClient.get<IAuthCheckResponse>('/auth/check');
      
      if ((data as any).error) {
        console.error('Ошибка проверки подписки:', (data as any).error);
        return this.fallbackToOffline(previousRole);
      }

      const newSyncToken = data.syncToken;

      // Токен Realtime (только при разрешённой синхронизации)
      const syncService = (window as any).syncService;
      if (syncService?.setRealtimeToken) {
        syncService.setRealtimeToken(data.syncEnabled === true ? data.realtime || null : null);
      }

      if (newSyncToken) {
        console.log(`🔑 sync_token получен с сервера: ${newSyncToken.substring(0, 8)}... (будет сохранен после проверки)`);
      }

      // Обновляем userStore с серверными данными
      userStore.setRole(
        data.role || 'trial',
        data.syncEnabled === true
      );

      userStore.setSubscription(
        data.subscription_tier,
        data.premium_until,
        data.trial_used
      );

      userStore.setAdminPanel(data.adminPanel === true);

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

      const access = (data as any).access || null;
      return {
        isMember: data.isMember !== false,
        access: access
          ? {
              blocked: access.blocked === true,
              blockReason: access.blockReason ?? null,
              blockExpiresAt: access.blockExpiresAt ?? null,
              channelRequired: access.channelRequired === true,
              channelUrl: access.channelUrl ?? null,
            }
          : null,
        role: data.role || 'trial',
        previousRole,
        syncEnabled: data.syncEnabled === true,
        syncToken: newSyncToken || null,
        dataDeadline: data.dataDeadline || null,
        isNewUser: data.isNewUser || false,
        serverModels: data.serverModels || {},
        tokens: data.tokens,
        today_bonus_added: data.today_bonus_added || 0,
        checkin: data.checkin ?? null
      };

    } catch (err) {
      console.error('Auth check error:', err);
      return this.fallbackToOffline(previousRole);
    }
  }

  // ==========================================
  // ПОЛУЧЕНИЕ ТОКЕНОВ
  // ==========================================

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
    const tempStore = new BaseStore('temp');
    tempStore.clearSyncToken();
    localStorage.removeItem('session_active');

    if ((window as any).syncService) {
      (window as any).syncService.setRealtimeToken(null);
      (window as any).syncService.unsubscribe();
    }

    console.log('👋 Выход выполнен');
  }

  // ==========================================
  // ОФЛАЙН-РЕЖИМ
  // ==========================================

  /**
   * Сервер недоступен: работаем локально с ролью последнего успешного входа.
   * Синхронизация без сервера невозможна — выключена.
   */
  private fallbackToOffline(previousRole: string | null): IAuthResult {
    const savedRole = previousRole || 'trial';
    const known = ['trial', 'premium', 'admin', 'creator'].includes(savedRole);

    return {
      isMember: known,
      role: known ? savedRole : 'guest',
      previousRole,
      syncEnabled: false,
      syncToken: this.getSyncToken() || null,
      dataDeadline: localStorage.getItem('data_deadline') || null,
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

export const authService = new AuthService();
console.log('✅ AuthService v7.0.0 загружен');
