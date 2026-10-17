// ============================================
// src/store/generation-live.ts
// «Живая» генерация: сообщение в статусе pending/processing, которое ещё не
// считается потерянным. Окно разное: фото ждём минуты, видео — до 20 минут
// (сервер держит замок чата и само задание столько же).
// Версия: 1.1.0 — окно аудио (озвучка, музыка): 6 минут — сервер ждёт модель до ~5
//          1.0.0
// ============================================

import type { IChat, IMessage } from '@app-types';

export const LIVE_WINDOW_MS: Record<string, number> = {
  image: 5 * 60 * 1000,
  video: 21 * 60 * 1000,
  audio: 6 * 60 * 1000,
};

const DEFAULT_WINDOW_MS = LIVE_WINDOW_MS.image;

export function liveWindowMs(modality: unknown): number {
  return LIVE_WINDOW_MS[String(modality)] ?? DEFAULT_WINDOW_MS;
}

/** Сообщение-результат генерации, которое ещё в работе */
export function isLiveGeneration(msg: IMessage | null | undefined): boolean {
  const meta = (msg as any)?.metadata;
  if (!msg || msg.deleted_at || meta?.kind !== 'generation') return false;
  if (meta.status !== 'pending' && meta.status !== 'processing') return false;
  const created = new Date(msg.created_at || 0).getTime();
  return Date.now() - created < liveWindowMs(meta.modality);
}

/** В чате идёт генерация: удалять его нельзя */
export function chatHasLiveGeneration(chat: IChat | null | undefined): boolean {
  return (chat?.messages || []).some((m) => isLiveGeneration(m));
}

export const CHAT_BUSY_DELETE_HINT = 'Дождитесь окончания генерации, чтобы удалить чат';
