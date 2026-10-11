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

/** Один медиа-файл (результат или вход) */
export interface IGenerationMedia {
  type: MediaType;
  url: string;
  storage_path?: string;
  mime?: string;
  width?: number | null;
  height?: number | null;
  duration_sec?: number | null;
  size_bytes?: number | null;
  filename?: string;
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
  media_inputs?: IGenerationMedia[];
}

export type IGenerationMetadata = IGenerationResultMetadata | IGenerationRequestMetadata;

/** Описание одного режима в generation_config */
export interface IGenerationMode {
  key: string;
  label: IAgentName;
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
  /** Дополнительные настройки (лимиты, подсказки и т.д.) */
  [key: string]: any;
}

/** Запрос на создание генерации */
export interface ICreateGenerationRequest {
  agent_id: UUID;
  chat_id: UUID;
  prompt: string;
  params: GenerationParams;
  media_inputs?: IGenerationMedia[];
  negative_prompt?: string;
}

/** Ответ на создание генерации */
export interface ICreateGenerationResponse {
  success: boolean;
  message_id?: UUID;
  request_message_id?: UUID;
  status?: GenerationStatus;
  error?: string;
  cost?: number;
}
