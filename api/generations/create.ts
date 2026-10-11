// ============================================
// api/generations/create.ts
// Создание генерации (image / video)
// Версия: 3.0.0
//   - фото: отдельный API OpenRouter POST /images с реальными параметрами
//     (разрешение, соотношение сторон, качество, фон, n, референсы). Ответ идёт
//     потоком с «пробелами-пульсом»: Vercel требует начать ответ за ~25 с, а
//     генерация может идти дольше; пробелы перед JSON парсер игнорирует
//   - видео: асинхронное задание POST /videos. create отвечает сразу (сообщение в
//     статусе processing), результат приходит вебхуком /api/generations/webhook или
//     забирается опросом /api/generations/status. Замок чата держится до конца
//     задания (токен замка лежит в metadata сообщения)
//   - одно активное видео на пользователя
//   - энергия: оценка до старта по generation_config.pricing; списание после
//     успеха по фактической стоимости (usage.cost × energy_per_usd × коэффициент)
//   - аудио пока не поддерживается и отклоняется явно
//   2.2.0 и ранее: замок чата, списание после успеха, референсы из приватного
//   Storage, результаты только как storage_path, валидация по generation_config
// ============================================

import { authenticate } from '../_lib/auth';
import { handleCORS, errorResponse, jsonResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { getMarkupForTier } from '../_lib/markup-helper';
import { checkTokenAvailability } from '../_lib/tokens';
import { HttpError } from '../_lib/http-error';
import { keepAliveJson } from '../_lib/keepalive';
import {
  loadGenerativeAgent,
  maxInputsForMode,
  modeAcceptsImages,
  resolveMode,
  validateParams,
  validatePrompts,
} from '../_lib/generation';
import {
  MEDIA_LIMITS,
  UUID_RE,
  assertStoragePaths,
  getOwnedFiles,
  mediaTypeFromMime,
} from '../_lib/media';
import type { IMediaFileRow } from '../_lib/media';
import {
  VIDEO_LOCK_TTL_SEC,
  acquireChatLock,
  chatBusyResponse,
} from '../_lib/chat-lock';
import type { IChatLock } from '../_lib/chat-lock';
import {
  appBaseUrl,
  energyForUsd,
  estimateUsd,
  generateImages,
  readPricing,
  signReferenceUrls,
  submitVideoJob,
} from '../_lib/openrouter-media';
import {
  VIDEO_MAX_AGE_MS,
  chargeForGeneration,
  finalizeVideoJob,
  loadFinalMessages,
  patchMessage,
  persistBytes,
  updateGenerationStatus,
} from '../_lib/generation-store';
import type { IStoredMedia } from '../_lib/generation-store';

export const config = { runtime: 'edge' };

interface ICreateBody {
  agent_id: string;
  chat_id: string;
  prompt: string;
  params?: Record<string, any>;
  /** Только storage_path: остальное сервер берёт из media_files */
  media_inputs?: Array<{ storage_path: string }>;
  negative_prompt?: string;
}

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let lock: IChatLock | null = null;
  // Сообщение без финального статуса: если обработчик упадёт, в catch оно
  // помечается failed, а не висит в «Генерация...»
  let openMessageId: string | null = null;
  let dbConfig: any = null;

  try {
    const auth = await authenticate(request, true);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const userId = auth.userId;
    const body: ICreateBody = await request.json();

    if (!body.agent_id || !body.chat_id) {
      return errorResponse('agent_id, chat_id and prompt are required', 400);
    }
    if (!UUID_RE.test(String(body.chat_id))) {
      return errorResponse('Invalid chat_id', 400);
    }

    const config = getSupabaseConfig('service');
    dbConfig = config;

    // 1. Агент + доступ
    const { agent, user } = await loadGenerativeAgent(body.agent_id, userId, config);
    const gen = agent.generation_config || {};
    const modality: 'image' | 'video' = agent.modality;

    if (modality !== 'image' && modality !== 'video') {
      return errorResponse('Генерация этого типа пока не поддерживается', 400);
    }

    // 2. Чат принадлежит пользователю и этому агенту
    const chats = await supabaseFetch(
      `chats?id=eq.${body.chat_id}&select=id,user_id,agent_id,deleted_at`,
      { method: 'GET' },
      config
    );
    const chat = Array.isArray(chats) ? chats[0] : null;
    if (!chat || Number(chat.user_id) !== Number(userId) || chat.deleted_at) {
      return errorResponse('Chat not found', 404);
    }
    if (chat.agent_id !== agent.id) {
      return errorResponse('Chat does not belong to this agent', 400);
    }

    // 3. Валидация по generation_config
    const mode = resolveMode(gen, body.params?.mode);
    const params = validateParams(gen, body.params);
    const { prompt, negative } = validatePrompts(gen, body.prompt, body.negative_prompt);

    // 4. Референсы
    const inputPaths = assertStoragePaths(
      (body.media_inputs || []).map((m) => m?.storage_path),
      MEDIA_LIMITS.maxInputsPerRequest
    );
    const modeInput = resolveModeInput(mode);

    if (inputPaths.length > 0) {
      if (!modeAcceptsImages(mode) || modeInput === 'none') {
        return errorResponse('This mode does not accept image references', 400);
      }
      const limit = Math.min(
        maxInputsForMode(mode),
        modeInput === 'first_frame' ? 1 : modeInput === 'first_last_frames' ? 2 : 99
      );
      if (inputPaths.length > limit) {
        return errorResponse(`Too many references (max ${limit})`, 400);
      }
    } else if (mode?.requires_media) {
      return errorResponse('This mode requires at least one reference', 400);
    }

    const inputFiles = await loadInputFiles(userId, body.chat_id, inputPaths, config);

    // 5. Оценка стоимости и проверка энергии
    const markup = getMarkupForTier(agent, user?.subscription_tier || null);
    const pricing = readPricing(gen);
    const estimatedCost = energyForUsd(estimateUsd(pricing, params), pricing, agent, markup);

    const tokenCheck = await checkTokenAvailability(userId, estimatedCost, config);
    if (!tokenCheck.available) {
      return errorResponse(
        tokenCheck.reason === 'daily_limit' ? 'Daily limit exceeded' : 'Insufficient energy',
        429
      );
    }

    // 6. Одно активное видео на пользователя
    if (modality === 'video') {
      const active = await findActiveVideo(userId, config);
      if (active) {
        return errorResponse('У вас уже идёт генерация видео. Дождитесь результата.', 409);
      }
    }

    // 7. Замок чата: дальше всё под ним. Если замок свободен, а в чате висят
    //    сообщения pending/processing — прошлая попытка умерла.
    const acquired = await acquireChatLock(
      userId,
      body.chat_id,
      'generation',
      config,
      modality === 'video' ? VIDEO_LOCK_TTL_SEC : undefined
    );
    if (!acquired.ok) {
      return chatBusyResponse(acquired.retryAfter);
    }
    lock = acquired.lock;

    await failStaleGenerations(body.chat_id, config);

    const mediaInputsMeta = inputFiles.map((f) => ({
      type: 'image' as const,
      storage_path: f.storage_path,
      mime: f.mime,
      size_bytes: f.size_bytes,
    }));

    // 8. user-msg (запрос)
    const requestMsg = await supabaseFetch(
      'messages',
      {
        method: 'POST',
        body: JSON.stringify({
          chat_id: body.chat_id,
          msg_type: 'user-msg',
          text: prompt,
          metadata: {
            kind: 'generation_request',
            modality,
            params,
            prompt,
            media_inputs: mediaInputsMeta,
            negative_prompt: negative,
          },
        }),
      },
      config
    );

    // Привязываем только что загруженные файлы к чату (повторно используемые уже привязаны)
    const toAttach = inputFiles.filter((f) => f.status === 'uploaded').map((f) => f.id);
    if (toAttach.length > 0) {
      await supabaseFetch(
        `media_files?id=in.(${toAttach.join(',')})`,
        { method: 'PATCH', body: JSON.stringify({ status: 'attached', chat_id: body.chat_id }) },
        config
      );
    }

    // 9. ai-msg со статусом processing
    const resultMsg = await supabaseFetch(
      'messages',
      {
        method: 'POST',
        body: JSON.stringify({
          chat_id: body.chat_id,
          msg_type: 'ai-msg',
          text: 'Генерация...',
          metadata: {
            kind: 'generation',
            modality,
            status: 'processing',
            params,
            prompt,
            negative_prompt: negative,
            media_inputs: mediaInputsMeta,
            cost: estimatedCost,
            media: [],
            error: null,
            model_id: agent.model_id,
            progress: 0.3,
            // Видео: замок снимается при завершении задания, а не в этой функции
            lock_token: modality === 'video' ? lock.token : undefined,
          },
        }),
      },
      config
    );

    const messageId: string = resultMsg?.id;
    openMessageId = messageId || null;
    const requestMessageId: string = requestMsg?.id;

    const referenceUrls = await signReferenceUrls(
      inputFiles.map((f) => f.storage_path),
      config
    );

    // ---------- Видео: отправляем задание и отвечаем сразу ----------
    if (modality === 'video') {
      const base = appBaseUrl();
      let submitted;
      try {
        submitted = await submitVideoJob({
          model: agent.model_id,
          prompt,
          negative,
          params,
          input: modeInput,
          referenceUrls,
          callbackUrl: base ? `${base}/api/generations/webhook` : null,
        });
      } catch (e) {
        await updateGenerationStatus(messageId, 'failed', (e as Error).message, config, { cost: 0 });
        openMessageId = null;
        return jsonResponse(
          await buildResult(config, body.chat_id, requestMessageId, messageId, {
            status: 'failed',
            error: (e as Error).message,
          })
        );
      }

      await patchMessage(
        messageId,
        { job_id: submitted.job.id, key_index: submitted.keyIndex },
        config
      );

      // Замок теперь принадлежит заданию: его снимет finalizeVideoJob
      lock = null;
      openMessageId = null;

      return jsonResponse(
        await buildResult(config, body.chat_id, requestMessageId, messageId, {
          status: 'processing',
        })
      );
    }

    // ---------- Фото: поток с пульсом, пока модель работает ----------
    const imageLock = lock;
    lock = null;
    openMessageId = null;

    return keepAliveJson(
      async () => {
      try {
        return await runImageGeneration({
          userId,
          chatId: body.chat_id,
          agent,
          markup,
          pricing,
          params,
          prompt,
          negative,
          referenceUrls,
          messageId,
          requestMessageId,
          config,
        });
      } finally {
        await imageLock.release();
      }
      },
      async (err) => {
        await updateGenerationStatus(messageId, 'failed', err.message || 'Internal error', config, { cost: 0 });
      }
    );
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('Generation create error:', err);
    if (openMessageId && dbConfig) {
      try {
        await updateGenerationStatus(openMessageId, 'failed', (err as Error).message || 'Internal error', dbConfig, { cost: 0 });
      } catch (markErr) {
        console.error('Failed to mark generation as failed:', (markErr as Error).message);
      }
    }
    return errorResponse((err as Error).message || 'Internal error', 500);
  } finally {
    if (lock) await lock.release();
  }
}

/** Как режим использует загруженные изображения */
function resolveModeInput(mode: any | null): string {
  if (!mode) return 'none';
  if (typeof mode.input === 'string') return mode.input;
  return modeAcceptsImages(mode) ? 'references' : 'none';
}

/** Тело ответа create: строки обоих сообщений + статус */
async function buildResult(
  config: any,
  chatId: string,
  requestMessageId: string,
  messageId: string,
  extra: { status: string; error?: string; cost?: number; media?: IStoredMedia[] }
): Promise<Record<string, any>> {
  const rows = await loadFinalMessages([requestMessageId, messageId], chatId, config);
  return {
    success: true,
    message_id: messageId,
    request_message_id: requestMessageId,
    request_message: rows.find((r) => r.id === requestMessageId) || null,
    message: rows.find((r) => r.id === messageId) || null,
    ...extra,
  };
}

async function runImageGeneration(ctx: {
  userId: number;
  chatId: string;
  agent: any;
  markup: number;
  pricing: ReturnType<typeof readPricing>;
  params: Record<string, any>;
  prompt: string;
  negative: string | null;
  referenceUrls: string[];
  messageId: string;
  requestMessageId: string;
  config: any;
}): Promise<Record<string, any>> {
  const { userId, chatId, agent, config, messageId } = ctx;

  let stored: IStoredMedia[] = [];
  let costUsd: number | null = null;
  let errorText: string | null = null;

  try {
    const result = await generateImages({
      model: agent.model_id,
      prompt: ctx.prompt,
      negative: ctx.negative,
      params: ctx.params,
      referenceUrls: ctx.referenceUrls,
    });
    costUsd = result.costUsd;
    stored = await persistBytes(userId, chatId, result.items, config);
  } catch (e) {
    errorText = (e as Error).message || 'Generation failed';
    stored = [];
  }

  let finalCost = 0;
  if (stored.length > 0) {
    // Списание — только после того, как результат сохранён
    const usd = costUsd !== null && costUsd > 0 ? costUsd : estimateUsd(ctx.pricing, ctx.params);
    const amount = energyForUsd(usd, ctx.pricing, agent, ctx.markup);
    finalCost = await chargeForGeneration(userId, amount, 'image', chatId, config);

    await patchMessage(
      messageId,
      {
        status: 'done',
        error: null,
        progress: 1,
        cost: finalCost,
        cost_usd: costUsd,
        media: stored,
      },
      config,
      'Готово'
    );
  } else {
    await updateGenerationStatus(messageId, 'failed', errorText || 'Generation failed', config, { cost: 0 });
  }

  return buildResult(config, chatId, ctx.requestMessageId, messageId, {
    status: stored.length > 0 ? 'done' : 'failed',
    cost: finalCost,
    media: stored.length > 0 ? stored : undefined,
    error: stored.length > 0 ? undefined : errorText || undefined,
  });
}

/** Активное (не просроченное) видео-задание пользователя в любом его чате */
async function findActiveVideo(userId: number, config: any): Promise<boolean> {
  const cutoff = new Date(Date.now() - VIDEO_MAX_AGE_MS).toISOString();
  const rows = await supabaseFetch(
    `messages?select=id,chats!inner(user_id)&chats.user_id=eq.${userId}` +
      `&msg_type=eq.ai-msg&deleted_at=is.null` +
      `&metadata->>kind=eq.generation&metadata->>modality=eq.video` +
      `&metadata->>status=in.(pending,processing)&created_at=gt.${encodeURIComponent(cutoff)}&limit=1`,
    { method: 'GET' },
    config
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Сообщения pending/processing в чате, когда замок свободен, — следы упавшей
 * попытки. Видео-задания доводит до конца finalizeVideoJob (оно же закроет просроченные),
 * остальные помечаются failed.
 */
async function failStaleGenerations(chatId: string, config: any): Promise<void> {
  try {
    const stale = await supabaseFetch(
      `messages?chat_id=eq.${chatId}&msg_type=eq.ai-msg` +
        `&metadata->>kind=eq.generation&metadata->>status=in.(pending,processing)&select=id,metadata`,
      { method: 'GET' },
      config
    );
    for (const row of Array.isArray(stale) ? stale : []) {
      if (row.metadata?.modality === 'video') {
        await finalizeVideoJob(row.id, config);
      } else {
        await updateGenerationStatus(row.id, 'failed', 'Генерация прервана', config, { cost: 0 });
      }
    }
  } catch (err) {
    console.error('failStaleGenerations error:', (err as Error).message);
  }
}

/**
 * Референсы: должны существовать, принадлежать пользователю, быть изображениями.
 * Свежие (uploaded) подходят всегда; уже привязанные (attached) — только к этому же чату
 * (так работает «Повторить»).
 */
async function loadInputFiles(
  userId: number,
  chatId: string,
  paths: string[],
  config: any
): Promise<IMediaFileRow[]> {
  if (paths.length === 0) return [];

  const rows = await getOwnedFiles(userId, paths, config);
  if (rows.length !== paths.length) {
    throw new HttpError(400, 'Reference file not found');
  }

  for (const row of rows) {
    if (row.kind !== 'input' || mediaTypeFromMime(row.mime) !== 'image') {
      throw new HttpError(400, 'Invalid reference file');
    }
    if (row.status === 'attached' && row.chat_id !== chatId) {
      throw new HttpError(400, 'Reference file belongs to another chat');
    }
  }

  // Сохраняем порядок, в котором их прислал клиент
  return paths.map((p) => rows.find((r) => r.storage_path === p) as IMediaFileRow);
}
