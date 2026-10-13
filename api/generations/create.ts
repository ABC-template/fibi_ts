// ============================================
// api/generations/create.ts
// Создание генерации (image / video)
// Версия: 3.4.0 — лимит частоты (generation_create)
//          3.3.0 — референс принимается только после /media/confirm (confirmed_at)
//          3.2.0 — резерв энергии (sql/energy_holds.sql): перед стартом стоимость
//                  замораживается атомарно; одна генерация (фото или видео) на
//                  пользователя — вторая получает 409 { code: 'generation_busy', chat_id }
//                  со ссылкой на чат, где идёт первая; после результата заморозка
//                  снимается и списывается факт, при ошибке — снимается без списания;
//                  истёкшая подписка считается trial при расчёте коэффициента
//          3.1.0 — без отдельного сообщения-запроса (user-msg): всё о запросе — в metadata
//                  результата (под карточкой уже есть промпт, в просмотрщике — параметры)
//          3.0.0
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
import { reserveEnergy, releaseEnergy } from '../_lib/energy-hold';
import { HttpError } from '../_lib/http-error';
import { enforceRateLimit } from '../_lib/rate-limit';
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

/** Заморозка энергии живёт дольше задания: видео — замок + 5 минут, фото — 10 минут */
const VIDEO_HOLD_TTL_SEC = VIDEO_LOCK_TTL_SEC + 5 * 60;
const IMAGE_HOLD_TTL_SEC = 10 * 60;
/** Фактическая стоимость может превысить оценку: замораживаем с запасом */
const HOLD_MARGIN = 1.25;

export const GENERATION_BUSY_MESSAGE = 'Дождитесь окончания генерации.';
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
  // Заморозка энергии: снимается в finally, пока не передана заданию
  let holdId: string | null = null;
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

    const limited = await enforceRateLimit('generation_create', userId);
    if (limited) return limited;
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

    // 5. Оценка стоимости
    const premiumExpired = !!user?.premium_until && new Date(user.premium_until).getTime() < Date.now();
    const tier = premiumExpired ? null : user?.subscription_tier || null;
    const markup = getMarkupForTier(agent, tier);
    const pricing = readPricing(gen);
    const estimatedCost = energyForUsd(estimateUsd(pricing, params), pricing, agent, markup);

    // 6. Заморозка энергии + одна генерация на пользователя (атомарно в БД)
    const reservation = await reserveEnergy(
      userId,
      estimatedCost,
      Math.ceil(estimatedCost * HOLD_MARGIN),
      'generation',
      body.chat_id,
      modality === 'video' ? VIDEO_HOLD_TTL_SEC : IMAGE_HOLD_TTL_SEC,
      config
    );
    if (!reservation.ok) {
      if (reservation.reason === 'generation_busy') {
        return jsonResponse(
          {
            error: GENERATION_BUSY_MESSAGE,
            code: 'generation_busy',
            chat_id: reservation.busyChatId,
          },
          409
        );
      }
      const free = Math.max(0, reservation.total - reservation.held);
      return jsonResponse(
        {
          error: reservation.reason === 'daily_limit'
            ? `⏳ Дневной лимит тарифа: нужно ~${estimatedCost} ⚡, сегодня потрачено ${reservation.spentToday} / ${reservation.dailyLimit} ⚡.`
            : `⚠️ Недостаточно энергии: нужно ~${estimatedCost} ⚡, доступно ${free} ⚡.` +
              (reservation.held > 0 ? ` Ещё ${reservation.held} ⚡ заняты идущими запросами.` : ''),
          code: reservation.reason === 'daily_limit' ? 'daily_limit' : 'insufficient_energy',
          needed: estimatedCost,
          available: free,
        },
        429
      );
    }
    holdId = reservation.holdId;

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

    // Привязываем только что загруженные файлы к чату (повторно используемые уже привязаны)
    const toAttach = inputFiles.filter((f) => f.status === 'uploaded').map((f) => f.id);
    if (toAttach.length > 0) {
      await supabaseFetch(
        `media_files?id=in.(${toAttach.join(',')})`,
        { method: 'PATCH', body: JSON.stringify({ status: 'attached', chat_id: body.chat_id }) },
        config
      );
    }

    // 8. Сообщение-результат со статусом processing. Отдельного сообщения-запроса нет:
    //    промпт, параметры и референсы хранятся в metadata результата
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
            // Заморозка энергии: снимается при завершении (списание или отказ)
            hold_id: holdId || undefined,
            // Видео: замок снимается при завершении задания, а не в этой функции
            lock_token: modality === 'video' ? lock.token : undefined,
          },
        }),
      },
      config
    );

    const messageId: string = resultMsg?.id;
    openMessageId = messageId || null;

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
        // Замок и заморозку снимет finally
        return jsonResponse(
          await buildResult(config, body.chat_id, messageId, {
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

      // Замок и заморозка теперь принадлежат заданию: их снимет finalizeVideoJob
      lock = null;
      holdId = null;
      openMessageId = null;

      return jsonResponse(
        await buildResult(config, body.chat_id, messageId, {
          status: 'processing',
        })
      );
    }

    // ---------- Фото: поток с пульсом, пока модель работает ----------
    const imageLock = lock;
    const imageHoldId = holdId;
    lock = null;
    holdId = null;
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
          holdId: imageHoldId,
          config,
        });
      } finally {
        // Списание (settle) уже сняло заморозку; иначе — снимаем без списания
        await releaseEnergy(imageHoldId, config);
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
    if (holdId && dbConfig) await releaseEnergy(holdId, dbConfig);
    if (lock) await lock.release();
  }
}

/** Как режим использует загруженные изображения */
function resolveModeInput(mode: any | null): string {
  if (!mode) return 'none';
  if (typeof mode.input === 'string') return mode.input;
  return modeAcceptsImages(mode) ? 'references' : 'none';
}

/** Тело ответа create: строка сообщения-результата + статус */
async function buildResult(
  config: any,
  chatId: string,
  messageId: string,
  extra: { status: string; error?: string; cost?: number; media?: IStoredMedia[] }
): Promise<Record<string, any>> {
  const rows = await loadFinalMessages([messageId], chatId, config);
  return {
    success: true,
    message_id: messageId,
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
  holdId: string | null;
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
    finalCost = await chargeForGeneration(userId, amount, 'image', chatId, config, ctx.holdId);

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

  return buildResult(config, chatId, messageId, {
    status: stored.length > 0 ? 'done' : 'failed',
    cost: finalCost,
    media: stored.length > 0 ? stored : undefined,
    error: stored.length > 0 ? undefined : errorText || undefined,
  });
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
        await releaseEnergy(row.metadata?.hold_id, config);
      }
    }
  } catch (err) {
    console.error('failStaleGenerations error:', (err as Error).message);
  }
}

/**
 * Референсы: должны существовать, принадлежать пользователю, быть изображениями.
 * Свежие (uploaded) — только подтверждённые /media/confirm; уже привязанные (attached) — только к этому же чату
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
    // Без /media/confirm фактические размер и тип файла не проверены
    if (!row.confirmed_at) {
      throw new HttpError(400, 'Reference file is not confirmed');
    }
    if (row.status === 'attached' && row.chat_id !== chatId) {
      throw new HttpError(400, 'Reference file belongs to another chat');
    }
  }

  // Сохраняем порядок, в котором их прислал клиент
  return paths.map((p) => rows.find((r) => r.storage_path === p) as IMediaFileRow);
}
