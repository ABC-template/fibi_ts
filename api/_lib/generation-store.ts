// ============================================
// api/_lib/generation-store.ts
// Общее для create / webhook / status: запись результатов генерации в Storage,
// списание энергии, обновление сообщений и завершение видео-задания.
// finalizeVideoJob идемпотентна: вебхук OpenRouter и опрос статуса из приложения
// могут прийти одновременно — результат сохранится и будет оплачен ровно один раз.
// Версия: 1.0.0
// ============================================

import { supabaseFetch, supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { getMarkupForTier } from './markup-helper';
import {
  MEDIA_LIMITS,
  UUID_RE,
  deleteMediaRows,
  extFromMime,
  isAllowedMime,
  mediaTypeFromMime,
  uploadObject,
} from './media';
import { releaseChatLockByToken, VIDEO_LOCK_TTL_SEC } from './chat-lock';
import { downloadVideo, energyForUsd, estimateUsd, getVideoJob, readPricing } from './openrouter-media';

export interface IStoredMedia {
  type: 'image' | 'video' | 'audio';
  storage_path: string;
  mime: string;
  size_bytes: number;
}

/** Видео-задание считается потерянным, если не завершилось за это время */
export const VIDEO_MAX_AGE_MS = VIDEO_LOCK_TTL_SEC * 1000;
/** Заявка на завершение, которую никто не довёл до конца, можно перехватить через это время */
const FINALIZE_RECLAIM_MS = 3 * 60 * 1000;
/** Если задание отправлено, а job_id не записан (функция умерла) — через это время сдаёмся */
const NO_JOB_GRACE_MS = 2 * 60 * 1000;
const MAX_FINALIZE_ATTEMPTS = 5;

// ============================================
// Сообщения
// ============================================

/** Обновить metadata сообщения (слияние с текущим) и, при необходимости, текст */
export async function patchMessage(
  messageId: string,
  patch: Record<string, any>,
  config: ISupabaseConfig,
  text?: string
): Promise<void> {
  if (!messageId) return;
  const current = await supabaseFetch(
    `messages?id=eq.${messageId}&select=metadata`,
    { method: 'GET' },
    config
  );
  const meta = (Array.isArray(current) && current[0]?.metadata) || {};
  const merged: Record<string, any> = { ...meta, ...patch };
  for (const k of Object.keys(merged)) {
    if (merged[k] === undefined) delete merged[k];
  }
  const body: Record<string, any> = { metadata: merged };
  if (text !== undefined) body.text = text;
  await supabaseFetch(
    `messages?id=eq.${messageId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    config
  );
}

/** Статус «в работе» / «ошибка» без потери остальных полей metadata */
export async function updateGenerationStatus(
  messageId: string,
  status: string,
  error: string | null,
  config: ISupabaseConfig,
  extra: Record<string, any> = {}
): Promise<void> {
  await patchMessage(
    messageId,
    {
      ...extra,
      status,
      error,
      progress: status === 'processing' ? 0.3 : status === 'done' ? 1 : 0,
    },
    config
  );
}

/**
 * Итоговые строки сообщений + отметка об изменении чата (chats.updated_at: по ней
 * клиенты других устройств понимают, что чат изменился). Сбой не ломает ответ.
 */
export async function loadFinalMessages(
  ids: string[],
  chatId: string,
  config: ISupabaseConfig
): Promise<any[]> {
  await touchChat(chatId, config);
  try {
    const valid = ids.filter((id) => typeof id === 'string' && UUID_RE.test(id));
    if (valid.length === 0) return [];
    const rows = await supabaseFetch(
      `messages?id=in.(${valid.join(',')})&select=*`,
      { method: 'GET' },
      config
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('Failed to load final messages:', (err as Error).message);
    return [];
  }
}

export async function touchChat(chatId: string, config: ISupabaseConfig): Promise<void> {
  try {
    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      { method: 'PATCH', body: JSON.stringify({ updated_at: new Date().toISOString() }) },
      config
    );
  } catch (err) {
    console.error('Failed to touch chat:', (err as Error).message);
  }
}

// ============================================
// Хранилище результатов
// ============================================

/**
 * Кладёт результаты в Storage и учитывает их в media_files.
 * Порядок: запись → загрузка; при сбое загрузки запись откатывается,
 * а уже сохранённые файлы этого вызова удаляются (в сообщении ничего не появится).
 */
export async function persistBytes(
  userId: number,
  chatId: string,
  items: Array<{ bytes: Uint8Array; mime: string }>,
  config: ISupabaseConfig
): Promise<IStoredMedia[]> {
  const stored: IStoredMedia[] = [];
  const rowIds: string[] = [];

  try {
    for (const { bytes, mime } of items) {
      if (bytes.length === 0) throw new Error('Empty result');
      if (bytes.length > MEDIA_LIMITS.outputMaxBytes) throw new Error('Result is too large');
      if (!isAllowedMime(mime)) throw new Error(`Unsupported result type: ${mime || 'unknown'}`);

      const ext = extFromMime(mime) as string;
      const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;

      const row = await supabaseFetch(
        'media_files',
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            chat_id: chatId,
            storage_path: storagePath,
            kind: 'output',
            mime,
            size_bytes: bytes.length,
            status: 'attached',
          }),
        },
        config
      );
      rowIds.push(row.id);

      await uploadObject(storagePath, bytes, mime, config);

      stored.push({
        type: mediaTypeFromMime(mime) as IStoredMedia['type'],
        storage_path: storagePath,
        mime,
        size_bytes: bytes.length,
      });
    }
  } catch (err) {
    // Откат: записи в media_files удаляем, объекты Storage убирает очистка по записям
    if (rowIds.length > 0) {
      try {
        await deleteMediaRows(rowIds, config);
      } catch (e) {
        console.error('persistBytes rollback failed:', (e as Error).message);
      }
    }
    throw err;
  }

  return stored;
}

// ============================================
// Энергия
// ============================================

/**
 * Списание энергии за успешную генерацию. Возвращает фактически списанную сумму
 * (0 для admin/creator). Если списать не удалось, результат всё равно отдаётся,
 * а сбой пишется в system_logs.
 */
export async function chargeForGeneration(
  userId: number,
  amount: number,
  modality: string,
  chatId: string,
  config: ISupabaseConfig
): Promise<number> {
  try {
    const spend = await supabaseRPC(
      'spend_abstract_tokens',
      {
        p_user_id: userId,
        p_amount: amount,
        p_source: 'generation',
        p_description: `Генерация (${modality})`,
      },
      config
    );

    if (spend?.success) {
      return spend.bypass ? 0 : amount;
    }

    await logGenerationIssue(userId, 'generation_charge_failed', `Не удалось списать ${amount} за успешную генерацию: ${spend?.error || 'unknown'}`, { amount, chat_id: chatId }, config);
    return 0;
  } catch (err) {
    await logGenerationIssue(userId, 'generation_charge_failed', `Не удалось списать ${amount} за успешную генерацию: ${(err as Error).message}`, { amount, chat_id: chatId }, config);
    return 0;
  }
}

export async function logGenerationIssue(
  userId: number,
  eventType: string,
  message: string,
  metadata: Record<string, any>,
  config: ISupabaseConfig
): Promise<void> {
  try {
    await supabaseFetch(
      'system_logs',
      {
        method: 'POST',
        body: JSON.stringify({
          level: 'warning',
          event_type: eventType,
          message: `${message} (пользователь ${userId})`,
          user_id: userId,
          metadata,
        }),
      },
      config
    );
  } catch (err) {
    console.error('logGenerationIssue error:', (err as Error).message);
  }
}

// ============================================
// Видео-задание
// ============================================

export type VideoFinalizeState = 'running' | 'done' | 'failed' | 'noop';

export interface IVideoFinalizeResult {
  state: VideoFinalizeState;
  /** Актуальная строка сообщения (null, если сообщения нет) */
  row: any | null;
}

/** Условный PATCH: возвращает true, если строка подошла под фильтр и была обновлена */
async function conditionalPatch(
  messageId: string,
  filter: string,
  metadata: Record<string, any>,
  text: string | undefined,
  config: ISupabaseConfig
): Promise<boolean> {
  const body: Record<string, any> = { metadata };
  if (text !== undefined) body.text = text;
  const res = await supabaseFetch(
    `messages?id=eq.${messageId}&${filter}`,
    { method: 'PATCH', body: JSON.stringify(body), headers: { Prefer: 'return=representation' } },
    config
  );
  return Array.isArray(res) && res.length > 0;
}

async function loadMessage(messageId: string, config: ISupabaseConfig): Promise<any | null> {
  const rows = await supabaseFetch(
    `messages?id=eq.${messageId}&select=*,chats!inner(user_id,agent_id)`,
    { method: 'GET' },
    config
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function stripChat(row: any): any {
  if (!row) return row;
  const { chats, ...rest } = row;
  return rest;
}

/** Пометить задание проваленным (однократно) и снять замок чата */
async function failVideoMessage(
  row: any,
  error: string,
  config: ISupabaseConfig
): Promise<IVideoFinalizeResult> {
  const meta = row.metadata || {};
  const next = { ...meta, status: 'failed', error, cost: 0, progress: 0, finalizing: undefined };
  delete next.finalizing;

  await conditionalPatch(
    row.id,
    'metadata->>status=in.(pending,processing)',
    next,
    'Не удалось сгенерировать',
    config
  );
  await releaseChatLockByToken(row.chats.user_id, row.chat_id, meta.lock_token, config);
  await touchChat(row.chat_id, config);

  const fresh = await loadMessage(row.id, config);
  return { state: 'failed', row: stripChat(fresh) };
}

/**
 * Довести видео-задание до конца. Вызывается из вебхука и из опроса статуса.
 * Источник истины — состояние задания у OpenRouter (запрашивается нашим ключом),
 * содержимое вебхука не используется.
 */
export async function finalizeVideoJob(
  messageId: string,
  config: ISupabaseConfig
): Promise<IVideoFinalizeResult> {
  let row = await loadMessage(messageId, config);
  if (!row) return { state: 'noop', row: null };

  let meta = row.metadata || {};
  const userId = Number(row.chats.user_id);

  if (meta.kind !== 'generation' || meta.modality !== 'video') {
    return { state: 'noop', row: stripChat(row) };
  }
  if (meta.status === 'done') return { state: 'done', row: stripChat(row) };
  if (meta.status === 'failed') return { state: 'failed', row: stripChat(row) };

  const age = Date.now() - new Date(row.created_at).getTime();

  if (!meta.job_id) {
    if (age > NO_JOB_GRACE_MS) return failVideoMessage(row, 'Задание не было отправлено', config);
    return { state: 'running', row: stripChat(row) };
  }

  let job;
  try {
    job = await getVideoJob(meta.job_id, meta.key_index);
  } catch (err) {
    console.error('getVideoJob failed:', (err as Error).message);
    if (age > VIDEO_MAX_AGE_MS) return failVideoMessage(row, 'Время ожидания истекло', config);
    return { state: 'running', row: stripChat(row) };
  }

  if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'expired') {
    return failVideoMessage(row, job.error || 'Генерация не удалась', config);
  }

  if (job.status !== 'completed') {
    if (age > VIDEO_MAX_AGE_MS) return failVideoMessage(row, 'Время ожидания истекло', config);
    if (job.status === 'in_progress' && meta.status === 'pending') {
      await patchMessage(row.id, { status: 'processing', progress: 0.3 }, config);
      row = await loadMessage(messageId, config);
    }
    return { state: 'running', row: stripChat(row) };
  }

  // --- completed: забираем результат ровно один раз ---

  const now = Date.now();
  const prevClaim: string | undefined = meta.finalizing;
  if (prevClaim && now - new Date(prevClaim).getTime() < FINALIZE_RECLAIM_MS) {
    return { state: 'running', row: stripChat(row) };
  }

  const attempts = Number(meta.finalize_attempts) || 0;
  if (attempts >= MAX_FINALIZE_ATTEMPTS) {
    await logGenerationIssue(userId, 'video_finalize_failed', `Видео ${meta.job_id} готово, но сохранить не удалось: ${meta.finalize_error || 'unknown'}`, { job_id: meta.job_id, message_id: row.id }, config);
    return failVideoMessage(row, 'Не удалось сохранить результат', config);
  }

  const claimedAt = new Date().toISOString();
  const claimFilter =
    'metadata->>status=in.(pending,processing)&' +
    (prevClaim ? `metadata->>finalizing=eq.${encodeURIComponent(prevClaim)}` : 'metadata->>finalizing=is.null');
  const claimed = await conditionalPatch(
    row.id,
    claimFilter,
    { ...meta, status: 'processing', finalizing: claimedAt, finalize_attempts: attempts + 1 },
    undefined,
    config
  );
  if (!claimed) {
    // Кто-то другой уже завершает (или завершил)
    const fresh = await loadMessage(messageId, config);
    const st = fresh?.metadata?.status;
    return { state: st === 'done' ? 'done' : st === 'failed' ? 'failed' : 'running', row: stripChat(fresh) };
  }

  try {
    // а) сохранить файл (если уже сохранён прошлой попыткой — пропустить)
    let media: IStoredMedia[] = Array.isArray(meta.media) ? meta.media : [];
    if (media.length === 0) {
      const file = await downloadVideo(job, meta.job_id, meta.key_index);
      media = await persistBytes(userId, row.chat_id, [file], config);
      await patchMessage(row.id, { media }, config);
    }

    // б) списать энергию (если прошлая попытка уже списала — не повторять)
    let charged: number;
    if (typeof meta.charged === 'number') {
      charged = meta.charged;
    } else {
      charged = await chargeForVideo(row, meta, job, userId, config);
      await patchMessage(row.id, { charged }, config);
    }

    // в) готово
    await patchMessage(
      row.id,
      {
        status: 'done',
        error: null,
        progress: 1,
        cost: charged,
        cost_usd: job.costUsd,
        media,
        finalizing: undefined,
        finalize_error: undefined,
      },
      config,
      'Готово'
    );
  } catch (err) {
    const message = (err as Error).message || 'finalize error';
    console.error('finalizeVideoJob error:', message);
    // Освободить заявку, чтобы следующий опрос повторил попытку
    await patchMessage(row.id, { finalizing: undefined, finalize_error: message }, config);
    const fresh = await loadMessage(messageId, config);
    return { state: 'running', row: stripChat(fresh) };
  }

  await releaseChatLockByToken(userId, row.chat_id, meta.lock_token, config);
  await touchChat(row.chat_id, config);

  const fresh = await loadMessage(messageId, config);
  return { state: 'done', row: stripChat(fresh) };
}

async function chargeForVideo(
  row: any,
  meta: any,
  job: { costUsd: number | null; isByok: boolean },
  userId: number,
  config: ISupabaseConfig
): Promise<number> {
  const agents = await supabaseFetch(
    `ai_agents?id=eq.${row.chats.agent_id}&select=*`,
    { method: 'GET' },
    config
  );
  const agent = Array.isArray(agents) ? agents[0] : null;
  if (!agent) return 0;

  const users = await supabaseFetch(
    `users?telegram_id=eq.${userId}&select=subscription_tier`,
    { method: 'GET' },
    config
  );
  const tier = (Array.isArray(users) && users[0]?.subscription_tier) || null;
  const markup = getMarkupForTier(agent, tier);

  const pricing = readPricing(agent.generation_config);
  // Фактическая стоимость у OpenRouter; для BYOK или при отсутствии — по прайсу
  const usd =
    job.costUsd !== null && !job.isByok && job.costUsd > 0
      ? job.costUsd
      : estimateUsd(pricing, meta.params || {});

  const amount = energyForUsd(usd, pricing, agent, markup);
  return chargeForGeneration(userId, amount, 'video', row.chat_id, config);
}
