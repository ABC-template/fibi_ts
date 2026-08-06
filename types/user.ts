// ============================================
// types/user.ts
// Типы для пользователя и аутентификации
// ============================================

import { UserRole, UserLanguage, UUID, ISODateString } from './common';

/** Пользователь (из Telegram) */
export interface ITelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: UserLanguage;
  photo_url?: string;
  is_premium?: boolean;
}

/** Пользователь (из БД) */
export interface IAppUser {
  id: UUID;
  telegram_id: number;
  username?: string;
  role: UserRole;
  user_lang: UserLanguage;
  password_hash?: string;
  sync_token?: string;
  sync_token_updated_at?: ISODateString;
  premium_until?: ISODateString;
  data_deadline?: ISODateString;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Результат аутентификации */
export interface IAuthResult {
  user: ITelegramUser | null;
  userId: number | null;
  authUserId: UUID | null;
  jwtToken?: string;
  error: string | null;
  status?: number;
}

/** Ответ от /auth/check */
export interface IAuthCheckResponse {
  isMember: boolean;
  role: UserRole;
  dailyLimit: number;
  syncEnabled: boolean;
  syncToken: string | null;
  userId: number;
  authUserId: UUID;
  userUuid: UUID;
  jwtToken: string;
  expiresIn: number;
  isNewUser: boolean;
  dataDeadline?: ISODateString | null;
  serverModels: Record<string, boolean>;
}

/** Статистика пользователя */
export interface IUserStats {
  total_chats: number;
  total_messages: number;
  total_favorites: number;
  used_today?: number;
  daily_limit?: number;
}

/** Устройство пользователя */
export interface IUserDevice {
  id: UUID;
  user_id: number;
  device_fingerprint: string;
  raw_fingerprint?: string;
  signed_fingerprint?: string;
  platform: 'android' | 'ios' | 'web';
  is_active: boolean;
  last_seen: ISODateString;
  created_at: ISODateString;
}
