// ============================================
// src/modules/chat/open-chat.ts
// Чат, открытый на экране прямо сейчас
// Версия: 1.0.0 — единственный источник для отправки: запрос уходит только в открытый
//                  чат (активный чат темы после удаления переключается на другой — туда
//                  отправлять нельзя)
// ============================================

import type { UUID } from '@app-types';

let openChatId: UUID | null = null;

/** ChatModule: чат показан (id) или закрыт / удалён (null) */
export function setOpenChatId(chatId: UUID | null): void {
  openChatId = chatId;
}

/** Открытый на экране чат или null */
export function getOpenChatId(): UUID | null {
  return openChatId;
}

export function isChatOpen(chatId: UUID | null | undefined): boolean {
  return !!chatId && chatId === openChatId;
}
