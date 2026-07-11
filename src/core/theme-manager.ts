// ============================================
// src/core/theme-manager.ts
// Управление темами оформления
// Версия: 3.0.0 - TypeScript
// ============================================

export type ThemeType = 'light' | 'amoled';

export class ThemeManager {
  private supportedThemes: ThemeType[] = ['light', 'amoled'];
  private defaultTheme: ThemeType = 'light';
  private currentTheme: ThemeType | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    const savedTheme = this.loadTheme();
    
    if (savedTheme && this.supportedThemes.includes(savedTheme as ThemeType)) {
      this.applyTheme(savedTheme as ThemeType);
    } else {
      const tgTheme = this.detectTelegramTheme();
      this.applyTheme(tgTheme);
    }
    
    console.log('🎨 ThemeManager инициализирован. Тема:', this.currentTheme);
  }

  private detectTelegramTheme(): ThemeType {
    const tg = (window as any).Telegram?.WebApp;
    const colorScheme = tg?.colorScheme || 'light';
    return colorScheme === 'dark' ? 'amoled' : 'light';
  }

  private loadTheme(): string | null {
    try {
      return localStorage.getItem('app_theme');
    } catch {
      return null;
    }
  }

  private saveTheme(theme: ThemeType): void {
    try {
      localStorage.setItem('app_theme', theme);
    } catch (e) {
      console.warn('Failed to save theme:', e);
    }
  }

  applyTheme(theme: ThemeType): void {
    if (!this.supportedThemes.includes(theme)) {
      theme = this.defaultTheme;
    }
    
    this.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    this.saveTheme(theme);
    this.updateThemeUI(theme);
    
    console.log('🎨 Тема применена:', theme);
  }

  toggleTheme(): ThemeType {
    const currentIndex = this.supportedThemes.indexOf(this.currentTheme || this.defaultTheme);
    const nextIndex = (currentIndex + 1) % this.supportedThemes.length;
    const nextTheme = this.supportedThemes[nextIndex];
    this.applyTheme(nextTheme);
    return nextTheme;
  }

  setTheme(theme: ThemeType): boolean {
    if (this.supportedThemes.includes(theme)) {
      this.applyTheme(theme);
      return true;
    }
    return false;
  }

  private updateThemeUI(theme: ThemeType): void {
    document.querySelectorAll('[data-theme-btn]').forEach(btn => {
      const btnTheme = btn.getAttribute('data-theme-btn');
      btn.classList.toggle('active', btnTheme === theme);
    });
  }

  getCurrentTheme(): ThemeType {
    return this.currentTheme || this.defaultTheme;
  }

  isDark(): boolean {
    return this.currentTheme === 'amoled';
  }
}

// Создаем экземпляр
export const themeManager = new ThemeManager();
console.log('✅ ThemeManager v3.0.0 загружен');
