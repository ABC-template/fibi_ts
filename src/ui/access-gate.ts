// ============================================
// src/ui/access-gate.ts
// Заглушка «нет доступа» поверх всего приложения:
//   channel_required — подписка на канал обязательна (галочка в админке):
//                      «Подписаться» и «Я подписался — проверить»
//   blocked          — доступ ограничен администратором (причина и срок)
// Показывается по ответу /auth/check и по любому ответу API с кодом
// blocked / channel_required (api.ts шлёт событие fibi:access-denied).
// Версия: 1.0.0
// ============================================

import { escapeHtml } from '@/utils/html';
import { hideSplash } from '@/ui/splash';

export type AccessGateReason = 'channel_required' | 'blocked';

export interface IAccessGateInfo {
  reason: AccessGateReason;
  channelUrl?: string | null;
  blockReason?: string | null;
  blockExpiresAt?: string | null;
}

const OVERLAY_ID = 'access-gate-overlay';
let current: AccessGateReason | null = null;
let lastInfo: IAccessGateInfo | null = null;

function tg(): any {
  return (window as any).Telegram?.WebApp || null;
}

function openLink(url: string): void {
  const app = tg();
  try {
    if (/^https:\/\/t\.me\//i.test(url) && app?.openTelegramLink) {
      app.openTelegramLink(url);
      return;
    }
    if (app?.openLink) {
      app.openLink(url);
      return;
    }
  } catch {
    // ниже — обычное открытие
  }
  window.open(url, '_blank', 'noopener');
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Проверить подписку на сервере; true — доступ открыт */
async function recheckChannel(): Promise<{ ok: boolean; channelUrl: string | null; message?: string }> {
  try {
    const { apiClient } = await import('@/services/api');
    const res = await apiClient.post('/auth/channel', {}, { retries: 1 });
    return {
      ok: res?.channelRequired === false && res?.blocked !== true,
      channelUrl: res?.channelUrl || null,
    };
  } catch (err) {
    return { ok: false, channelUrl: null, message: (err as Error).message };
  }
}

function render(info: IAccessGateInfo): string {
  if (info.reason === 'blocked') {
    const until = fmtDate(info.blockExpiresAt);
    return `
      <div class="ag-icon">⛔</div>
      <h2 class="ag-title">Доступ ограничен</h2>
      <p class="ag-text">Администратор ограничил доступ к приложению${until ? ` до ${escapeHtml(until)}` : ''}.</p>
      ${info.blockReason ? `<p class="ag-note">Причина: ${escapeHtml(info.blockReason)}</p>` : ''}
      <button type="button" class="ag-btn ag-secondary" data-ag="reload">🔄 Проверить снова</button>
    `;
  }

  return `
    <div class="ag-icon">📢</div>
    <h2 class="ag-title">Подпишитесь на канал</h2>
    <p class="ag-text">Приложение доступно подписчикам нашего канала. Подпишитесь и вернитесь сюда.</p>
    ${info.channelUrl ? '<button type="button" class="ag-btn ag-primary" data-ag="subscribe">📢 Подписаться</button>' : ''}
    <button type="button" class="ag-btn ${info.channelUrl ? 'ag-secondary' : 'ag-primary'}" data-ag="check">✅ Я подписался — проверить</button>
    <p class="ag-note" data-ag-status hidden></p>
  `;
}

const STYLE = `
  #${OVERLAY_ID} {
    position: fixed; inset: 0; z-index: 2147483000;
    display: flex; align-items: center; justify-content: center; padding: 24px;
    background: var(--app-bg-primary, var(--tg-theme-bg-color, #111));
    color: var(--app-text-primary, var(--tg-theme-text-color, #fff));
    font-family: var(--app-font-family, -apple-system, system-ui, sans-serif);
  }
  #${OVERLAY_ID} .ag-box { width: 100%; max-width: 360px; text-align: center; display: flex; flex-direction: column; gap: 12px; }
  #${OVERLAY_ID} .ag-icon { font-size: 56px; line-height: 1; }
  #${OVERLAY_ID} .ag-title { margin: 0; font-size: 22px; font-weight: 700; }
  #${OVERLAY_ID} .ag-text { margin: 0; font-size: 15px; line-height: 1.5; color: var(--app-text-secondary, inherit); }
  #${OVERLAY_ID} .ag-note { margin: 0; font-size: 13px; color: var(--app-text-tertiary, #999); word-break: break-word; }
  #${OVERLAY_ID} .ag-btn { width: 100%; padding: 13px 16px; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
  #${OVERLAY_ID} .ag-btn:disabled { opacity: 0.6; }
  #${OVERLAY_ID} .ag-primary { background: var(--app-accent-primary, var(--tg-theme-button-color, #2481cc)); color: var(--app-text-inverse, var(--tg-theme-button-text-color, #fff)); }
  #${OVERLAY_ID} .ag-secondary { background: var(--app-bg-tertiary, rgba(127,127,127,0.18)); color: inherit; }
`;

/** Показать заглушку (повторный вызов с той же причиной ничего не меняет) */
export function showAccessGate(info: IAccessGateInfo): void {
  // Ссылка могла прийти только в одном из ответов — не теряем её
  if (!info.channelUrl && lastInfo?.channelUrl) info = { ...info, channelUrl: lastInfo.channelUrl };
  if (current === info.reason && document.getElementById(OVERLAY_ID)) return;
  current = info.reason;
  lastInfo = info;

  try {
    hideSplash();
  } catch {
    // сплеш уже скрыт
  }

  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `<style>${STYLE}</style><div class="ag-box">${render(info)}</div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('[data-ag="subscribe"]')?.addEventListener('click', () => {
    if (info.channelUrl) openLink(info.channelUrl);
  });

  overlay.querySelector('[data-ag="reload"]')?.addEventListener('click', () => location.reload());

  const checkBtn = overlay.querySelector('[data-ag="check"]') as HTMLButtonElement | null;
  const status = overlay.querySelector('[data-ag-status]') as HTMLElement | null;
  checkBtn?.addEventListener('click', async () => {
    checkBtn.disabled = true;
    const old = checkBtn.textContent;
    checkBtn.textContent = '⏳ Проверяем...';
    const res = await recheckChannel();
    if (res.ok) {
      checkBtn.textContent = '✅ Готово!';
      setTimeout(() => location.reload(), 400);
      return;
    }
    // Ссылку на канал узнали только сейчас — перерисовать с кнопкой «Подписаться»
    if (res.channelUrl && !info.channelUrl) {
      current = null;
      showAccessGate({ ...info, channelUrl: res.channelUrl });
      return;
    }
    checkBtn.disabled = false;
    checkBtn.textContent = old;
    if (status) {
      status.hidden = false;
      status.textContent = res.message || 'Подписка пока не найдена. Подпишитесь на канал и нажмите ещё раз.';
    }
  });
}

/** Ответ API с кодом отказа → заглушка (событие шлёт api.ts) */
window.addEventListener('fibi:access-denied', (e: Event) => {
  const detail = (e as CustomEvent).detail || {};
  const reason: AccessGateReason = detail.code === 'blocked' ? 'blocked' : 'channel_required';
  showAccessGate({
    reason,
    channelUrl: detail.channelUrl || null,
    blockReason: detail.blockReason || null,
    blockExpiresAt: detail.blockExpiresAt || null,
  });
});

(window as any).showAccessGate = showAccessGate;
