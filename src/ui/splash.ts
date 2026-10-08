// ============================================
// src/ui/splash.ts
// Минимальный сплэш: серая сова на чёрном фоне
// Версия: 3.0.0
// ============================================

export function initSplash(): void {
  const el = document.getElementById('splash-screen');
  if (el) {
    el.classList.remove('hidden');
    el.style.display = 'flex';
  }
}

/** Прогресс больше не показываем — оставляем API для app.ts */
export function updateSplashProgress(_percent: number, _status?: string): void {
  // no-op
}

export function hideSplash(): void {
  const el = document.getElementById('splash-screen');
  if (!el) return;

  el.classList.add('hidden');
  window.setTimeout(() => {
    el.style.display = 'none';
  }, 350);
}

(window as any).initSplash = initSplash;
(window as any).updateSplashProgress = updateSplashProgress;
(window as any).hideSplash = hideSplash;

console.log('✅ Splash v3.0.0 (minimal owl)');
