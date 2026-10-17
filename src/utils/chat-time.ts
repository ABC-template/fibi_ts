// ============================================
// src/utils/chat-time.ts
// Время и даты сообщений чата (как в Telegram)
// Версия: 1.0.0 — время под сообщением (ЧЧ:ММ) и разделители дней
//                  «Сегодня / Вчера / 15 октября [2025]»
// ============================================

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function toDate(iso?: string | null): Date {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Ключ дня в локальном времени: 2026-10-17 */
export function dayKey(iso?: string | null): string {
  const d = toDate(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Время сообщения: 14:05 */
export function formatMessageTime(iso?: string | null): string {
  const d = toDate(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Подпись разделителя дня: Сегодня / Вчера / 15 октября / 15 октября 2025 */
export function formatDayLabel(iso?: string | null): string {
  const d = toDate(iso);
  const key = dayKey(d.toISOString());
  const now = new Date();
  if (key === dayKey(now.toISOString())) return 'Сегодня';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) return 'Вчера';
  const base = `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
