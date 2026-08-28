// ============================================
// src/modules/admin/core/admin-registry.ts
// Реестр вкладок админ-панели
// Версия: 1.0.0
// ============================================

import { IAdminTab, IAdminTabConstructor } from './admin-tab.interface';

class AdminRegistry {
  private tabs: Map<string, IAdminTabConstructor> = new Map();
  private instances: Map<string, IAdminTab> = new Map();

  /**
   * Зарегистрировать вкладку
   */
  register(tabId: string, TabClass: IAdminTabConstructor): void {
    if (this.tabs.has(tabId)) {
      console.warn(`⚠️ Вкладка ${tabId} уже зарегистрирована`);
      return;
    }
    this.tabs.set(tabId, TabClass);
    console.log(`📦 Вкладка зарегистрирована: ${tabId}`);
  }

  /**
   * Получить экземпляр вкладки (создает при первом запросе)
   */
  getInstance(tabId: string): IAdminTab | null {
    if (this.instances.has(tabId)) {
      return this.instances.get(tabId)!;
    }

    const TabClass = this.tabs.get(tabId);
    if (!TabClass) {
      console.warn(`⚠️ Вкладка ${tabId} не найдена`);
      return null;
    }

    const instance = new TabClass();
    this.instances.set(tabId, instance);
    return instance;
  }

  /**
   * Получить все зарегистрированные вкладки
   */
  getAllTabs(): IAdminTab[] {
    const result: IAdminTab[] = [];
    for (const [id] of this.tabs) {
      const instance = this.getInstance(id);
      if (instance) {
        result.push(instance);
      }
    }
    return result.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Получить все ID зарегистрированных вкладок
   */
  getTabIds(): string[] {
    return Array.from(this.tabs.keys());
  }

  /**
   * Проверить, зарегистрирована ли вкладка
   */
  hasTab(tabId: string): boolean {
    return this.tabs.has(tabId);
  }

  /**
   * Очистить все экземпляры
   */
  clearInstances(): void {
    for (const [id, instance] of this.instances) {
      try {
        instance.destroy();
      } catch (err) {
        console.warn(`⚠️ Ошибка очистки вкладки ${id}:`, err);
      }
    }
    this.instances.clear();
  }

  /**
   * Очистить все (полный сброс)
   */
  clear(): void {
    this.clearInstances();
    this.tabs.clear();
    console.log('🧹 AdminRegistry очищен');
  }
}

export const adminRegistry = new AdminRegistry();
console.log('✅ AdminRegistry v1.0.0 загружен');
