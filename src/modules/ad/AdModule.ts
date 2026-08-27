// ============================================
// src/modules/ad/AdModule.ts
// Модуль рекламы (минимальная связанность)
// Версия: 1.0.0
// ============================================

import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';

export interface IAdOptions {
  /** Тип рекламы: rewarded (с наградой), interstitial (межстраничная), banner */
  type: 'rewarded' | 'interstitial' | 'banner';
  /** Количество монет за просмотр (для rewarded) */
  rewardCoins?: number;
  /** Источник запроса (для логирования) */
  source?: string;
  /** Дополнительные метаданные */
  metadata?: Record<string, any>;
  /** Callback при успешном просмотре */
  onReward?: () => void;
  /** Callback при ошибке */
  onError?: (error: string) => void;
  /** Callback при закрытии */
  onClose?: () => void;
}

export interface IAdResult {
  success: boolean;
  rewarded: boolean;
  coinsEarned?: number;
  error?: string;
}

// ✅ ПРИМЕЧАНИЕ: Этот класс НЕ ИМПОРТИРУЕТ внешние SDK напрямую.
// Вместо этого он загружает их динамически и вызывает через window.
// Это позволяет легко удалить модуль, не затрагивая другие части приложения.
export class AdModule {
  private isInitialized: boolean = false;
  private isAdLoading: boolean = false;
  private adsgram: any = null;
  private userId: number | null = null;

  // Настройки по умолчанию
  private defaultRewardCoins: number = 5;
  private config: {
    blockId?: string;
    debug: boolean;
  } = {
    debug: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
  };

  constructor() {
    this.userId = userStore.userId;
    this._subscribeToEvents();
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToEvents(): void {
    // ✅ Подписываемся на запросы показа рекламы через EventBus
    eventBus.on('ad:show', this.show.bind(this));
    eventBus.on('ad:show:rewarded', (options) => {
      this.show({ ...options, type: 'rewarded' });
    });
    eventBus.on('ad:show:interstitial', (options) => {
      this.show({ ...options, type: 'interstitial' });
    });

    // Обновляем userId при смене пользователя
    eventBus.on('user:changed', (data) => {
      this.userId = data.userId;
    });

    console.log('📡 AdModule подписан на события');
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ
  // ==========================================

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('ℹ️ AdModule уже инициализирован');
      return;
    }

    try {
      // Загружаем конфигурацию (можно получать с сервера)
      await this._loadConfig();

      // Инициализируем SDK (динамическая загрузка)
      await this._initSDK();

      this.isInitialized = true;
      console.log('✅ AdModule инициализирован');

      // Отправляем событие об инициализации
      eventBus.emit('ad:initialized', { success: true });

    } catch (err) {
      console.error('❌ Ошибка инициализации AdModule:', err);
      eventBus.emit('ad:initialized', { success: false, error: (err as Error).message });
    }
  }

  // ==========================================
  // ЗАГРУЗКА КОНФИГУРАЦИИ
  // ==========================================

  private async _loadConfig(): Promise<void> {
    try {
      // Можно получать конфиг с сервера
      // const response = await fetch('/api/ad/config');
      // const config = await response.json();
      // this.config = { ...this.config, ...config };

      // Или использовать переменные окружения
      // this.config.blockId = process.env.ADSGRAM_BLOCK_ID;

      if (this.config.debug) {
        console.log('🔧 AdModule config:', this.config);
      }
    } catch (err) {
      console.warn('⚠️ Не удалось загрузить конфиг рекламы, используем defaults');
    }
  }

  // ==========================================
  // ЗАГРУЗКА SDK (динамическая)
  // ==========================================

  private async _initSDK(): Promise<void> {
    // ✅ Проверяем, не загружен ли SDK уже
    if (typeof (window as any).Adsgram !== 'undefined') {
      this.adsgram = (window as any).Adsgram;
      console.log('✅ Adsgram SDK уже загружен');
      return;
    }

    // ✅ Загружаем SDK динамически
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.adsgram.ai/js/adsgram.js';
      script.async = true;
      script.onload = () => {
        // После загрузки SDK доступен через window.Adsgram
        if (typeof (window as any).Adsgram !== 'undefined') {
          this.adsgram = (window as any).Adsgram;
          console.log('✅ Adsgram SDK загружен динамически');
          resolve();
        } else {
          reject(new Error('Adsgram SDK не найден после загрузки'));
        }
      };
      script.onerror = () => {
        reject(new Error('Не удалось загрузить Adsgram SDK'));
      };
      document.head.appendChild(script);
    });
  }

  // ==========================================
  // ПОКАЗ РЕКЛАМЫ (ОСНОВНОЙ МЕТОД)
  // ==========================================

  async show(options: IAdOptions): Promise<IAdResult> {
    // Проверяем инициализацию
    if (!this.isInitialized) {
      console.warn('⚠️ AdModule не инициализирован, пробуем инициализировать...');
      await this.init();
      if (!this.isInitialized) {
        return { success: false, rewarded: false, error: 'AdModule not initialized' };
      }
    }

    // Проверяем, что SDK загружен
    if (!this.adsgram) {
      return { success: false, rewarded: false, error: 'Ad SDK not loaded' };
    }

    // Проверяем, не идёт ли уже показ
    if (this.isAdLoading) {
      return { success: false, rewarded: false, error: 'Ad is already loading' };
    }

    // Проверяем настройки
    const type = options.type || 'rewarded';
    const rewardCoins = options.rewardCoins || this.defaultRewardCoins;
    const source = options.source || 'ad:unknown';

    this.isAdLoading = true;

    try {
      // ✅ Показываем рекламу в зависимости от типа
      let result: IAdResult;

      switch (type) {
        case 'rewarded':
          result = await this._showRewardedAd(options, rewardCoins, source);
          break;
        case 'interstitial':
          result = await this._showInterstitialAd(options);
          break;
        case 'banner':
          result = await this._showBannerAd(options);
          break;
        default:
          result = { success: false, rewarded: false, error: `Unknown ad type: ${type}` };
      }

      // ✅ Логируем результат
      if (this.config.debug) {
        console.log('📊 Ad result:', result);
      }

      return result;

    } catch (err) {
      const error = (err as Error).message;
      console.error('❌ Ошибка показа рекламы:', error);
      return { success: false, rewarded: false, error };
    } finally {
      this.isAdLoading = false;
    }
  }

  // ==========================================
  // REWARDED AD (с наградой)
  // ==========================================

  private _showRewardedAd(
    options: IAdOptions,
    rewardCoins: number,
    source: string
  ): Promise<IAdResult> {
    return new Promise((resolve) => {
      // ✅ Проверяем, что SDK поддерживает rewarded ads
      if (!this.adsgram || !this.adsgram.showRewardedAd) {
        resolve({ success: false, rewarded: false, error: 'Rewarded ads not supported' });
        return;
      }

      // ✅ Показываем рекламу через SDK
      // Это пример для Adsgram — подставь свой API
      this.adsgram.showRewardedAd({
        blockId: this.config.blockId || 'default',
        onReward: () => {
          // ✅ ПОЛЬЗОВАТЕЛЬ ПОСМОТРЕЛ РЕКЛАМУ → НАЧИСЛЯЕМ НАГРАДУ
          console.log(`🎉 Пользователь получил награду: ${rewardCoins} монет (${source})`);

          // Начисляем монеты через экономику
          if (this.userId) {
            eventBus.emit('economy:earn', {
              userId: this.userId,
              source: source,
              amount: rewardCoins,
              metadata: {
                ...options.metadata,
                adType: 'rewarded',
              },
            });
          }

          // Вызываем callback
          if (options.onReward) {
            options.onReward();
          }

          resolve({
            success: true,
            rewarded: true,
            coinsEarned: rewardCoins,
          });
        },
        onError: (error: any) => {
          console.error('❌ Ошибка рекламы:', error);

          if (options.onError) {
            options.onError(typeof error === 'string' ? error : error?.message || 'Unknown error');
          }

          resolve({
            success: false,
            rewarded: false,
            error: typeof error === 'string' ? error : error?.message || 'Ad error',
          });
        },
        onClose: () => {
          console.log('👋 Реклама закрыта');

          if (options.onClose) {
            options.onClose();
          }
        },
      });
    });
  }

  // ==========================================
  // INTERSTITIAL AD (межстраничная)
  // ==========================================

  private _showInterstitialAd(options: IAdOptions): Promise<IAdResult> {
    return new Promise((resolve) => {
      // ✅ Аналогично, но без награды
      if (!this.adsgram || !this.adsgram.showInterstitialAd) {
        resolve({ success: false, rewarded: false, error: 'Interstitial ads not supported' });
        return;
      }

      this.adsgram.showInterstitialAd({
        blockId: this.config.blockId || 'default',
        onAdShown: () => {
          console.log('📺 Interstitial ad shown');

          // Межстраничная реклама — без награды
          // Можно показать что-то в UI
          resolve({
            success: true,
            rewarded: false,
          });
        },
        onError: (error: any) => {
          console.error('❌ Ошибка interstitial:', error);

          if (options.onError) {
            options.onError(typeof error === 'string' ? error : error?.message || 'Unknown error');
          }

          resolve({
            success: false,
            rewarded: false,
            error: typeof error === 'string' ? error : error?.message || 'Ad error',
          });
        },
        onClose: () => {
          console.log('👋 Interstitial ad closed');

          if (options.onClose) {
            options.onClose();
          }
        },
      });
    });
  }

  // ==========================================
  // BANNER AD (не требует действий)
  // ==========================================

  private _showBannerAd(options: IAdOptions): Promise<IAdResult> {
    return new Promise((resolve) => {
      // ✅ Баннер — просто показываем
      if (!this.adsgram || !this.adsgram.showBannerAd) {
        resolve({ success: false, rewarded: false, error: 'Banner ads not supported' });
        return;
      }

      this.adsgram.showBannerAd({
        blockId: this.config.blockId || 'default',
        onAdLoaded: () => {
          console.log('📢 Banner ad loaded');
          resolve({
            success: true,
            rewarded: false,
          });
        },
        onError: (error: any) => {
          console.error('❌ Ошибка banner:', error);

          if (options.onError) {
            options.onError(typeof error === 'string' ? error : error?.message || 'Unknown error');
          }

          resolve({
            success: false,
            rewarded: false,
            error: typeof error === 'string' ? error : error?.message || 'Ad error',
          });
        },
      });
    });
  }

  // ==========================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================

  /**
   * Проверить, доступна ли реклама
   */
  isAdAvailable(): boolean {
    if (!this.isInitialized || !this.adsgram) {
      return false;
    }
    // ✅ Можно проверить через SDK
    // return this.adsgram.isAdAvailable();
    return true;
  }

  /**
   * Получить настройки
   */
  getConfig(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Обновить настройки
   */
  updateConfig(config: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...config };
    console.log('🔧 AdModule config обновлён');
  }

  /**
   * Дестрой
   */
  destroy(): void {
    this.isInitialized = false;
    this.adsgram = null;
    console.log('🗑️ AdModule уничтожен');
  }

  /**
   * Проверка, инициализирован ли модуль
   */
  isReady(): boolean {
    return this.isInitialized && !!this.adsgram;
  }
}

// ==========================================
// ЭКЗЕМПЛЯР
// ==========================================

export const adModule = new AdModule();

// Привязываем к window для глобального доступа
(window as any).adModule = adModule;

console.log('✅ AdModule v1.0.0 загружен');
