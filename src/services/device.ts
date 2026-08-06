// ============================================
// src/services/device.ts
// Управление устройствами и fingerprint
// Версия: 2.0.0 - TypeScript
// ============================================

import { apiClient } from './api';
import { userStore } from '@/store/UserStore';

export interface IDeviceInfo {
  fingerprint: string;
  deviceType: string;
  platform: string;
  isTelegramWebApp: boolean;
}

export class DeviceService {
  constructor() {}

  // ==========================================
  // ГЕНЕРАЦИЯ УНИКАЛЬНОГО FINGERPRINT
  // ==========================================

  generateFingerprint(): IDeviceInfo {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    
    const components = [
      user?.id || 'unknown',
      navigator.userAgent || 'unknown',
      tg?.platform || 'unknown',
      navigator.language || 'unknown',
      navigator.hardwareConcurrency || 'unknown',
      screen.width + 'x' + screen.height,
      screen.colorDepth || 'unknown',
      (navigator as any).deviceMemory || 'unknown',
      tg?.version || 'unknown',
      tg?.isExpanded || false,
      new Date().getTimezoneOffset()
    ];
    
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    
    const isTelegramWebApp = !!tg?.initData;
    const platform = tg?.platform || 'web';
    const deviceType = isTelegramWebApp ? `tg_${platform}` : 'web';
    
    const fingerprint = `device_${user?.id}_${Math.abs(hash)}_${deviceType}`;
    
    return {
      fingerprint: fingerprint,
      deviceType: deviceType,
      platform: platform,
      isTelegramWebApp: isTelegramWebApp
    };
  }

  // ==========================================
  // ПОЛУЧЕНИЕ СОХРАНЕННОГО FINGERPRINT
  // ==========================================

  getStoredFingerprint(): string {
    if (userStore && userStore.getDeviceFingerprint()) {
      return userStore.getDeviceFingerprint()!;
    }
    
    const saved = localStorage.getItem('device_fingerprint');
    if (saved) return saved;
    
    const { fingerprint } = this.generateFingerprint();
    localStorage.setItem('device_fingerprint', fingerprint);
    return fingerprint;
  }

  // ==========================================
  // РЕГИСТРАЦИЯ УСТРОЙСТВА
  // ==========================================

  async register(): Promise<boolean> {
    if (!userStore || !userStore.canSync()) {
      console.log('⏭️ Синхронизация отключена, устройство не регистрируется');
      return false;
    }

    const { fingerprint, deviceType, platform } = this.generateFingerprint();
    const initData = (window as any).Telegram?.WebApp?.initData;

    if (!initData) {
      console.error('❌ Нет initData для регистрации устройства');
      return false;
    }

    try {
      console.log('📤 Отправляем запрос на регистрацию устройства...');
      
      const data = await apiClient.post('/users/register-device', {
        deviceFingerprint: fingerprint,
        deviceType: deviceType,
        platform: platform
      });

      if (data.success) {
        if (data.signedFingerprint) {
          localStorage.setItem('device_fingerprint_signed', data.signedFingerprint);
          if (userStore) {
            userStore.setDeviceFingerprint(fingerprint, data.signedFingerprint);
          }
        }
        console.log(data.isNew ? '🆕 Новое устройство зарегистрировано' : '🔄 Устройство уже зарегистрировано');
        return true;
      }
      console.error('❌ Ошибка регистрации устройства:', data.error);
      return false;
    } catch (err) {
      console.error('❌ Ошибка регистрации устройства:', err);
      return false;
    }
  }

  // ==========================================
  // ПОЛУЧЕНИЕ ПОДПИСАННОГО FINGERPRINT
  // ==========================================

  getSignedFingerprint(): string | null {
    if (userStore) {
      return userStore.getDeviceFingerprint();
    }
    const signed = localStorage.getItem('device_fingerprint_signed');
    if (signed) return signed;
    return this.getStoredFingerprint();
  }
}

// Создаем экземпляр
export const deviceService = new DeviceService();
console.log('✅ DeviceService v2.0.0 загружен');
