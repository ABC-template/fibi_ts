// ============================================
// src/core/event-bus.ts
// Центральная шина событий для реактивности
// Версия: 2.0.0 - TypeScript
// ============================================

type EventCallback<T = any> = (data: T, sender?: any, event?: string) => void;

interface IListener {
  callback: EventCallback;
  context: any | null;
  id: string;
}

export class EventBus {
  private listeners: Map<string, IListener[]> = new Map();
  private onceListeners: Map<string, IListener[]> = new Map();
  private _isDebug: boolean = false;

  constructor(debug: boolean = false) {
    this._isDebug = debug;
  }

  /**
   * Подписаться на событие
   */
  on<T = any>(event: string, callback: EventCallback<T>, context: any = null): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const listener: IListener = {
      callback: callback as EventCallback,
      context: context || null,
      id: Date.now() + '_' + Math.random().toString(36).substring(2, 6)
    };

    this.listeners.get(event)!.push(listener);

    if (this._isDebug) {
      console.log(`📡 [EventBus] Подписка на "${event}" (id: ${listener.id})`);
    }

    return () => this.off(event, listener.id);
  }

  /**
   * Подписаться на событие один раз
   */
  once<T = any>(event: string, callback: EventCallback<T>, context: any = null): () => void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, []);
    }

    const listener: IListener = {
      callback: callback as EventCallback,
      context: context || null,
      id: Date.now() + '_' + Math.random().toString(36).substring(2, 6)
    };

    this.onceListeners.get(event)!.push(listener);

    if (this._isDebug) {
      console.log(`📡 [EventBus] Подписка "один раз" на "${event}" (id: ${listener.id})`);
    }

    return () => this.off(event, listener.id);
  }

  /**
   * Отписаться от события
   */
  off(event: string, listenerId: string): boolean {
    let removed = false;

    if (this.listeners.has(event)) {
      const initialLength = this.listeners.get(event)!.length;
      this.listeners.set(
        event,
        this.listeners.get(event)!.filter(l => l.id !== listenerId)
      );
      if (this.listeners.get(event)!.length < initialLength) {
        removed = true;
      }
    }

    if (this.onceListeners.has(event)) {
      const initialLength = this.onceListeners.get(event)!.length;
      this.onceListeners.set(
        event,
        this.onceListeners.get(event)!.filter(l => l.id !== listenerId)
      );
      if (this.onceListeners.get(event)!.length < initialLength) {
        removed = true;
      }
    }

    if (this._isDebug && removed) {
      console.log(`📡 [EventBus] Отписка от "${event}" (id: ${listenerId})`);
    }

    return removed;
  }

  /**
   * Отписаться от всех событий для конкретного контекста
   */
  offAll(context: any): number {
    let count = 0;

    for (const [event, listeners] of this.listeners) {
      const filtered = listeners.filter(l => l.context !== context);
      if (filtered.length < listeners.length) {
        count += listeners.length - filtered.length;
        this.listeners.set(event, filtered);
      }
    }

    for (const [event, listeners] of this.onceListeners) {
      const filtered = listeners.filter(l => l.context !== context);
      if (filtered.length < listeners.length) {
        count += listeners.length - filtered.length;
        this.onceListeners.set(event, filtered);
      }
    }

    if (this._isDebug && count > 0) {
      console.log(`📡 [EventBus] Отписка от всех событий для контекста (${count} подписок)`);
    }

    return count;
  }

  /**
   * Полная очистка всех подписок
   */
  clear(): void {
    const total = this.listeners.size + this.onceListeners.size;
    this.listeners.clear();
    this.onceListeners.clear();

    if (this._isDebug) {
      console.log(`📡 [EventBus] Полная очистка (${total} событий)`);
    }
  }

  /**
   * Вызвать событие
   */
  emit<T = any>(event: string, data: T = null as any, sender: any = null): void {
    if (this._isDebug) {
      console.log(`📡 [EventBus] Событие "${event}"`, data);
    }

    if (this.listeners.has(event)) {
      const listeners = [...this.listeners.get(event)!];
      for (const listener of listeners) {
        try {
          listener.callback.call(listener.context, data, sender, event);
        } catch (err) {
          console.error(`❌ [EventBus] Ошибка в обработчике "${event}":`, err);
        }
      }
    }

    if (this.onceListeners.has(event)) {
      const listeners = [...this.onceListeners.get(event)!];
      this.onceListeners.delete(event);

      for (const listener of listeners) {
        try {
          listener.callback.call(listener.context, data, sender, event);
        } catch (err) {
          console.error(`❌ [EventBus] Ошибка в once-обработчике "${event}":`, err);
        }
      }
    }
  }

  /**
   * Включить/выключить отладку
   */
  setDebug(enabled: boolean): void {
    this._isDebug = enabled;
    console.log(`📡 [EventBus] Отладка ${enabled ? 'включена' : 'выключена'}`);
  }

  /**
   * Получить количество подписок на событие
   */
  listenerCount(event: string): number {
    let count = 0;
    if (this.listeners.has(event)) {
      count += this.listeners.get(event)!.length;
    }
    if (this.onceListeners.has(event)) {
      count += this.onceListeners.get(event)!.length;
    }
    return count;
  }

  /**
   * Получить все события
   */
  getEvents(): string[] {
    const events = new Set<string>();
    for (const key of this.listeners.keys()) {
      events.add(key);
    }
    for (const key of this.onceListeners.keys()) {
      events.add(key);
    }
    return Array.from(events);
  }
}

// Создаем глобальный экземпляр
export const eventBus = new EventBus(
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
);

console.log('✅ EventBus v2.0.0 загружен');
