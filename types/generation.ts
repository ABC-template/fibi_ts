// ============================================
// types/generation.ts
// Типы для генеративных агентов (image / video / audio)
// ============================================

import type { UUID, ISODateString } from './common';
import type { IAgentName } from './agents';

/** Модальность генерации */
export type GenerationModality = 'image' | 'video' | 'audio';

/** Статус генерации */
export type GenerationStatus = 'pending' | 'processing' | 'done' | 'failed';

/** Тип медиа */
export type MediaType = 'image' | 'video' | 'audio';

/**
 * Один медиа-файл (результат или референс).
 * В БД хранится только storage_path (приватный бакет generation-media);
 * url — подписанная ссылка, существует только на клиенте и получается
 * через POST /api/media/sign.
 */
export interface IGenerationMedia {
  type: MediaType;
  storage_path: string;
  mime: string;
  size_bytes: number;
  /** Только клиент, не сохраняется */
  url?: string;
}

/** Параметры формы (произвольный объект, схема задаётся generation_config) */
export type GenerationParams = Record<string, string | number | boolean | null>;

/** Metadata сообщения-результата */
export interface IGenerationResultMetadata {
  kind: 'generation';
  modality: GenerationModality;
  status: GenerationStatus;
  params: GenerationParams;
  prompt: string;
  negative_prompt?: string | null;
  /** Референсы, с которыми делалась генерация (для «Повторить») */
  media_inputs?: IGenerationMedia[];
  cost?: number;
  media: IGenerationMedia[];
  error?: string | null;
  model_id?: string;
  progress?: number | null; // 0..1
  created_via?: 'form';
}

/** Metadata сообщения-запроса */
export interface IGenerationRequestMetadata {
  kind: 'generation_request';
  modality: GenerationModality;
  params: GenerationParams;
  prompt: string;
  negative_prompt?: string | null;
  media_inputs?: IGenerationMedia[];
}

export type IGenerationMetadata = IGenerationResultMetadata | IGenerationRequestMetadata;

/**
 * Как режим использует загруженные изображения (соответствует API OpenRouter):
 *  none → только текст; references → input_references (изображения или правка);
 *  first_frame → первый кадр видео; first_last_frames → первый и последний кадры.
 */
export type GenerationModeInput = 'none' | 'references' | 'first_frame' | 'first_last_frames';

/** Описание одного режима в generation_config */
export interface IGenerationMode {
  key: string;
  label: IAgentName;
  input?: GenerationModeInput;
  requires_media?: boolean;
  media_types?: MediaType[];
  max_media?: number;
  description?: IAgentName;
}

/** Описание одного параметра формы */
export interface IGenerationParam {
  key: string;
  type: 'select' | 'number' | 'boolean' | 'text' | 'slider';
  label: IAgentName;
  options?: Array<string | { value: string; label: IAgentName }>;
  min?: number;
  max?: number;
  step?: number;
  default?: string | number | boolean;
  required?: boolean;
  placeholder?: IAgentName;
}

/** Настройки промпта */
export interface IGenerationPromptConfig {
  required?: boolean;
  max_length?: number;
  placeholder?: IAgentName;
}

/**
 * Цена генерации. Реальное списание считается по фактической стоимости из ответа
 * OpenRouter; эта запись нужна для оценки в форме и проверки энергии до старта.
 *  per_second → prices[разрешение] × длительность (ключ 'default' — единая цена);
 *               со звуком берётся audio_prices (если заданы)
 *  per_image  → usd за одно изображение (OpenRouter отдаёт цену за токены,
 *               поэтому оценку задаёт администратор)
 * Энергия = usd × energy_per_usd × коэффициент агента, не меньше min_charge.
 */
export interface IGenerationPricing {
  kind: 'per_second' | 'per_image';
  prices?: Record<string, number>;
  audio_prices?: Record<string, number>;
  usd?: number;
  energy_per_usd: number;
}

/** Возможности модели OpenRouter (из /images/models и /videos/models) */
export interface IModelCapabilities {
  kind: 'image' | 'video';
  resolutions: string[];
  aspect_ratios: string[];
  /** Только видео, секунды */
  durations: number[];
  /** Только изображения */
  qualities: string[];
  backgrounds: string[];
  /** Максимум изображений за один запрос (image) */
  max_n: number;
  /** Максимум референсов (image) */
  max_input_references: number;
  /** Какие кадры принимает модель (video) */
  frame_images: Array<'first_frame' | 'last_frame'>;
  generate_audio: boolean;
  seed: boolean;
  /** Прайс-лист модели как есть (видео): sku → $ */
  pricing_skus: Record<string, number>;
}

/** Полный generation_config агента */
export interface IGenerationConfig {
  modes?: IGenerationMode[];
  params?: IGenerationParam[];
  prompt?: IGenerationPromptConfig;
  negative_prompt?: {
    enabled?: boolean;
    max_length?: number;
    placeholder?: IAgentName;
  };
  pricing?: IGenerationPricing;
  /** Дополнительные настройки (лимиты, подсказки и т.д.) */
  [key: string]: any;
}

/** Запрос на создание генерации */
export interface ICreateGenerationRequest {
  agent_id: UUID;
  chat_id: UUID;
  prompt: string;
  params: GenerationParams;
  /** Только пути: тип и размер сервер берёт из media_files */
  media_inputs?: Array<{ storage_path: string }>;
  negative_prompt?: string;
}

/** Строка сообщения из БД (так её отдаёт сервер) */
export interface IGenerationServerMessage {
  id: UUID;
  chat_id: UUID;
  msg_type: 'user-msg' | 'ai-msg';
  text: string;
  is_favorite?: boolean;
  created_at: string;
  deleted_at?: string | null;
  metadata: IGenerationMetadata | null;
}

/** Ответ на создание генерации */
export interface ICreateGenerationResponse {
  success: boolean;
  message_id?: UUID;
  request_message_id?: UUID;
  /** Итоговые строки обоих сообщений (null, если их не удалось перечитать) */
  request_message?: IGenerationServerMessage | null;
  message?: IGenerationServerMessage | null;
  status?: GenerationStatus;
  error?: string;
  cost?: number;
  media?: IGenerationMedia[];
}

/** Ответ POST /api/media/upload-url */
export interface IMediaUploadUrlResponse {
  success: boolean;
  file_id: UUID;
  storage_path: string;
  /** Одноразовая ссылка: клиент делает PUT с телом файла и заголовком Content-Type */
  upload_url: string;
}

/** Ответ POST /api/media/confirm */
export interface IMediaConfirmResponse {
  success: boolean;
  file_id: UUID;
  storage_path: string;
  type: MediaType;
  mime: string;
  size_bytes: number;
}

/** Ответ POST /api/media/sign: карта storage_path → подписанный URL */
export interface IMediaSignResponse {
  success: boolean;
  urls: Record<string, string>;
  /** Пути, которых у пользователя больше нет (удалены из облака) */
  missing?: string[];
  expires_in: number;
}
