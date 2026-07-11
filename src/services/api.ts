// ============================================
// src/services/api.ts
// Базовый API-клиент с JWT и sync_token
// Версия: 5.0.0 - TypeScript
// ============================================

import { BaseStore } from '@/store/BaseStore';

export class ApiError extends Error {
  public status: number;
  public details: any;

  constructor(message: string, status: number, details: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export interface IApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface IApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  cached?: boolean;
}

export class ApiClient {
  private initData: string | null = null;
  private timeout: number = 30000;
  private retries: number = 3;
  private retryDelay: number = 1000;
  private jwtToken: string | null = null;
  private syncToken: string | null = null;

  constructor() {
    this.initFromTelegram();
    this.loadTokens();
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ
  // ==========================================

  private initFromTelegram(): void {
    const tg = (window as any).Telegram?.WebApp;
    this.initData = tg?.initData || null;
    
    if (!this.initData) {
      console.warn('⚠️ Telegram initData не найден');
    }
  }

  // ==========================================
  // ЗАГРУЗКА ТОКЕНОВ
  // ==========================================

  private loadTokens(): void {
    const tempStore = new BaseStore('temp');
    
    // JWT с привязкой к пользователю
    const telegramId = this.getTelegramId();
    if (telegramId) {
      this.jwtToken = tempStore.getJWT();
    } else {
      // Fallback: ищем любой JWT
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('jwt_token_')) {
          this.jwtToken = localStorage.getItem(key);
          break;
        }
      }
    }
    
    // sync_token — ТОЛЬКО ПО КЛЮЧУ БЕЗ ID!
    this.syncToken = tempStore.getSyncToken();
    
    if (this.syncToken) {
      console.log(`🔑 Найден sync_token: ${this.syncToken.substring(0, 8)}...`);
    } else {
      console.log('ℹ️ sync_token не найден');
    }
  }

  private getTelegramId(): number | null {
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
  // БАЗОВЫЙ ЗАПРОС
  // ==========================================

  async request<T = any>(endpoint: string, options: IApiRequestOptions = {}): Promise<T> {
    // Загружаем свежие токены
    this.loadTokens();
    
    const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': this.initData || ''
    };
    
    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }
    
    if (this.syncToken) {
      headers['x-sync-token'] = this.syncToken;
      console.log(`📤 Отправляем sync_token: ${this.syncToken.substring(0, 8)}...`);
    } else {
      console.log('📤 sync_token не отправлен (не найден)');
    }
    
    const timeout = options.timeout || this.timeout;
    const retries = options.retries || this.retries;
    const retryDelay = options.retryDelay || this.retryDelay;
    
    const defaultOptions: RequestInit = {
      method: 'GET',
      headers: headers,
      signal: AbortSignal.timeout(timeout)
    };
    
    const mergedOptions: RequestInit = {
      ...defaultOptions,
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      }
    };
    
    if (options.body && typeof options.body === 'object') {
      mergedOptions.body = JSON.stringify(options.body);
    }
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, mergedOptions);
        
        if (response.status === 304) {
          return { success: true, cached: true, status: 304 } as T;
        }
        
        if (response.status === 401 || response.status === 403) {
          console.warn(`⚠️ Ошибка аутентификации ${response.status}, пробуем обновить JWT...`);
          
          // Пробуем обновить через AuthService
          const authService = (window as any).authService;
          if (authService) {
            try {
              const result = await authService.checkSubscription();
              if (result.jwtToken) {
                const tempStore = new BaseStore('temp');
                tempStore.saveJWT(result.jwtToken);
                this.jwtToken = result.jwtToken;
                
                if (result.syncToken) {
                  tempStore.saveSyncToken(result.syncToken);
                  this.syncToken = result.syncToken;
                }
                
                const newHeaders = { ...headers };
                newHeaders['Authorization'] = `Bearer ${result.jwtToken}`;
                if (this.syncToken) {
                  newHeaders['x-sync-token'] = this.syncToken;
                }
                
                const newOptions = { ...mergedOptions };
                (newOptions as any).headers = newHeaders;
                
                return this.request(endpoint, options);
              }
            } catch (refreshErr) {
              console.error('❌ Не удалось обновить JWT:', refreshErr);
            }
          }
          
          throw new ApiError('Authentication failed', response.status);
        }
        
        const contentType = response.headers.get('content-type') || '';
        
        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}`;
          let errorDetails = null;
          
          if (contentType.includes('application/json')) {
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorData.message || errorMessage;
              errorDetails = errorData;
            } catch (e) {}
          } else {
            try {
              const text = await response.text();
              if (text && text.length < 200) {
                errorMessage = text;
              }
            } catch (e) {}
          }
          
          console.error(`❌ API Error [${endpoint}]:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorMessage,
            details: errorDetails,
            attempt: attempt
          });
          
          throw new ApiError(errorMessage, response.status, errorDetails);
        }
        
        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return { success: true, status: 204 } as T;
        }
        
        if (contentType.includes('application/json')) {
          const data = await response.json();
          return data as T;
        }
        
        return response as T;
        
      } catch (err) {
        lastError = err as Error;
        
        if (err instanceof ApiError && err.status < 500) {
          throw err;
        }
        
        if (attempt < retries && 
            (err instanceof Error && (err.name === 'AbortError' || err.name === 'TypeError' || err.message?.includes('network')))) {
          
          const delay = retryDelay * Math.pow(2, attempt - 1);
          console.log(`🔄 Повторная попытка ${attempt}/${retries} через ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        break;
      }
    }
    
    console.error(`❌ API Error [${endpoint}]: Все попытки неудачны`, lastError);
    throw lastError || new ApiError('Request failed', 500);
  }

  // ==========================================
  // ОБЕРТКИ
  // ==========================================

  async get<T = any>(endpoint: string, options: IApiRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T = any>(endpoint: string, body?: any, options: IApiRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { 
      ...options, 
      method: 'POST',
      body: body
    });
  }

  async put<T = any>(endpoint: string, body?: any, options: IApiRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { 
      ...options, 
      method: 'PUT',
      body: body
    });
  }

  async patch<T = any>(endpoint: string, body?: any, options: IApiRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { 
      ...options, 
      method: 'PATCH',
      body: body
    });
  }

  async delete<T = any>(endpoint: string, options: IApiRequestOptions = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // ==========================================
  // СТРИМИНГ
  // ==========================================

  async stream(
    endpoint: string,
    body: any,
    onChunk: (chunk: string, accumulated: string) => void
  ): Promise<string> {
    this.loadTokens();
    const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': this.initData || ''
    };
    
    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }
    
    if (this.syncToken) {
      headers['x-sync-token'] = this.syncToken;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Stream error ${response.status}: ${text.substring(0, 200)}`);
    }
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const jsonStr = trimmedLine.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                accumulatedText += content;
                if (onChunk) {
                  onChunk(content, accumulatedText);
                }
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }
        }
      }
    } catch (err) {
      console.error('Stream reading error:', err);
      throw err;
    }
    
    return accumulatedText;
  }
}

// Создаем экземпляр
export const apiClient = new ApiClient();
console.log('✅ ApiClient v5.0.0 загружен');
