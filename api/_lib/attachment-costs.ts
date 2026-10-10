// ============================================
// api/_lib/attachment-costs.ts  +  можно шарить с клиентом
// Оценка стоимости вложений в ⚡
// Версия: 1.0.0 — таблица v2 + коэффициент по тарифу
// ============================================

export type AttachmentKind =
  | 'image'
  | 'text'
  | 'office'
  | 'code'
  | 'audio'
  | 'video'
  | 'unknown';

export interface AttachmentEstimateInput {
  mime?: string | null;
  filename?: string | null;
  sizeBytes?: number | null;
  textContent?: string | null; // уже извлечённый текст (для .md/.txt и т.п.)
  durationSec?: number | null; // для audio/video
}

/** Базовые стоимости (утверждённая таблица v2) */
const BASE: Record<AttachmentKind, number> = {
  image: 500,
  text: 120,
  office: 250,
  code: 90,
  audio: 180,
  video: 800,
  unknown: 350,
};

const MIN_COST = 40;
const MAX_COST_PER_FILE = 2500;

/** Глобальные множители по тарифу (Вариант A) */
export const ATTACHMENT_MULTIPLIER_BY_TIER: Record<string, number> = {
  trial: 1.4,
  basic: 1.2,
  plus: 1.1,
  pro: 1.0,
  ultra: 0.9,
};

function detectKind(mime?: string | null, filename?: string | null): AttachmentKind {
  const m = (mime || '').toLowerCase();
  const name = (filename || '').toLowerCase();

  if (m.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) return 'image';
  if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm)$/i.test(name)) return 'audio';
  if (m.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(name)) return 'video';

  if (/\.(txt|md|csv|json|log)$/i.test(name) || m.startsWith('text/')) return 'text';
  if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(name)) return 'office';
  if (/\.(js|ts|tsx|jsx|py|html|css|sql|go|rs|java|c|cpp|h|php|rb|sh)$/i.test(name)) return 'code';

  return 'unknown';
}

/**
 * Оценка одного вложения в ⚡ (без учёта tier-множителя).
 */
export function estimateAttachmentBase(input: AttachmentEstimateInput): number {
  const kind = detectKind(input.mime, input.filename);
  let cost = BASE[kind];

  const sizeMB = (input.sizeBytes || 0) / (1024 * 1024);
  const textLen = (input.textContent || '').length;
  const duration = input.durationSec || 0;

  switch (kind) {
    case 'image':
      if (sizeMB > 1) cost += Math.ceil((sizeMB - 1) / 0.5) * 80;
      break;
    case 'text':
      cost += Math.ceil(textLen / 400) * 1.5;
      break;
    case 'office':
      cost += Math.ceil(textLen / 600) * 1.5;
      break;
    case 'code':
      cost += Math.ceil(textLen / 350) * 1.5;
      break;
    case 'audio':
      cost += Math.ceil(duration / 30) * 50;
      break;
    case 'video':
      cost += Math.ceil(duration / 10) * 200;
      break;
  }

  if (sizeMB > 5) cost *= 1.4;

  cost = Math.max(MIN_COST, Math.min(MAX_COST_PER_FILE, Math.ceil(cost)));
  return cost;
}

/**
 * Итоговая стоимость с учётом тарифа.
 */
export function estimateAttachmentCost(
  input: AttachmentEstimateInput,
  userTier: string | null
): number {
  const base = estimateAttachmentBase(input);
  const tier = userTier || 'trial';
  const mult = ATTACHMENT_MULTIPLIER_BY_TIER[tier] ?? 1.0;
  return Math.ceil(base * mult);
}

/**
 * Сумма по массиву вложений.
 */
export function estimateAttachmentsTotal(
  items: AttachmentEstimateInput[],
  userTier: string | null
): number {
  return items.reduce((sum, item) => sum + estimateAttachmentCost(item, userTier), 0);
}
