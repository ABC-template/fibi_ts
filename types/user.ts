// ============================================
// types/user.ts
// Типы для пользователя и аутентификации
// Версия: 2.2.0 - удалён IUserDevice (устройства не регистрируются); удалён IUserStats (эндпоинт /users/stats не вызывался)
//          2.0.0 - без password_hash и JWT; IAuthCheckResponse — только в types/api.ts
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
  error: string | null;
  status?: number;
}
