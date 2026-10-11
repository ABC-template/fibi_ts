// ============================================
// api/generations/create.ts
// Создание генерации (image / video / audio)
// Версия: 2.2.0
//   - ответ содержит готовые строки обеих сообщений (клиент кладёт их в хранилище без
//     повторной загрузки чата), chats.updated_at обновляется (другие устройства увидят результат)
//   2.1.0:
//   - замок чата: пока в чате идёт запрос, второй отклоняется (409)
//   - энергия списывается ПОСЛЕ успешного сохранения результата
//     (как в текстовом стриме): неудачная генерация ничего не стоит
//   - серверная валидация по generation_config (режим, params, промпты)
//   - референсы (media_inputs) из приватного Storage, модель получает
//     короткоживущие подписанные ссылки (image_url)
//   - negative_prompt и media_inputs сохраняются в metadata (для «Повторить»)
//   - результаты сохраняются в Storage, в metadata только storage_path
//   - проверка, что чат принадлежит пользователю и агенту
// ============================================

import { authenticate } from '../_lib/auth';
import { handleCORS, errorResponse, jsonResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch, supabaseRPC } from '../_lib/supabase-client';
import { getMarkupForTier } from '../_lib/markup-helper';
import { checkTokenAvailability } from '../_lib/tokens';
import { HttpError } from '../_lib/http-error';
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
  deleteMediaRows,
  extFromMime,
  getOwnedFiles,
  isAllowedMime,
  mediaTypeFromMime,
  mimeFromUrlExt,
  signUrls,
  uploadObject,
} from '../_lib/media';
import type { IMediaFileRow } from '../_lib/media';
import {
  acquireChatLock,
  chatBusyResponse,
} from '../_lib/chat-lock';
import type { IChatLock } from '../_lib/chat-lock';

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

interface IStoredMedia {
  type: 'image' | 'video' | 'audio';
  storage_path: string;
  mime: string;
  size_bytes: number;
}

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let lock: IChatLock | null = null;
  // Сообщение, которое ещё не получило финальный статус: если обработчик упадёт,
  // в catch оно помечается failed, а не висит в «Генерация...»
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

    if (inputPaths.length > 0) {
      if (!modeAcceptsImages(mode)) {
        return errorResponse('This mode does not accept image references', 400);
      }
      if (inputPaths.length > maxInputsForMode(mode)) {
        return errorResponse(`Too many references (max ${maxInputsForMode(mode)})`, 400);
      }
    } else if (mode?.requires_media) {
      return errorResponse('This mode requires at least one reference', 400);
    }

    const inputFiles = await loadInputFiles(userId, body.chat_id, inputPaths, config);

    // 5. Оценка стоимости (пока упрощённо: min_charge * markup)
    // TODO: учитывать params, media, generation_config
    const markup = getMarkupForTier(agent, user?.subscription_tier || null);
    const estimatedCost = Math.max(
      Math.ceil((agent.min_charge || 1) * markup),
      agent.min_charge || 1
    );

    // 6. Проверка энергии
    const tokenCheck = await checkTokenAvailability(userId, estimatedCost, config);
    if (!tokenCheck.available) {
      return errorResponse(
        tokenCheck.reason === 'daily_limit' ? 'Daily limit exceeded' : 'Insufficient energy',
        429
      );
    }

    // 7. Замок чата: дальше всё под ним. Если замок свободен, а в чате висят
    //    сообщения pending/processing — прошлая попытка умерла (упала функция).
    const acquired = await acquireChatLock(userId, body.chat_id, 'generation', config);
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
            modality: agent.modality,
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

    // 9. ai-msg со статусом pending
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
            modality: agent.modality,
            status: 'pending',
            params,
            prompt,
            negative_prompt: negative,
            media_inputs: mediaInputsMeta,
            cost: estimatedCost,
            media: [],
            error: null,
            model_id: agent.model_id,
            progress: 0,
          },
        }),
      },
      config
    );

    const messageId = resultMsg?.id;
    openMessageId = messageId || null;
    const requestMessageId = requestMsg?.id;

    // 10. Вызов модели (OpenRouter chat completions, non-streaming).
    //     Энергия на этом этапе НЕ списывается.
    const keys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const k = process.env[`ROUTER_KEY${i}`];
      if (k) keys.push(k);
    }

    if (keys.length === 0) {
      await updateGenerationStatus(messageId, 'failed', 'No OpenRouter keys', config, { cost: 0 });
      return errorResponse('Server keys not configured', 500);
    }

    await updateGenerationStatus(messageId, 'processing', null, config);

    let extracted: Array<{ type: string; url: string }> = [];
    let errorText: string | null = null;

    const systemHint = agent.system_prompt || `You are a ${agent.modality} generation assistant.`;
    const userText = buildUserContent(prompt, params, negative);

    // Модель получает короткоживущие подписанные ссылки на референсы
    let userContent: any = userText;
    if (inputFiles.length > 0) {
      const urls = await signUrls(
        inputFiles.map((f) => f.storage_path),
        MEDIA_LIMITS.modelSignTtlSec,
        config
      );
      userContent = [
        { type: 'text', text: userText },
        ...inputFiles
          .filter((f) => urls[f.storage_path])
          .map((f) => ({ type: 'image_url', image_url: { url: urls[f.storage_path] } })),
      ];
    }

    for (const key of keys) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL?.trim() || 'https://vercel.com',
            'X-Title': 'FIBI Generation',
          },
          body: JSON.stringify({
            model: agent.model_id,
            messages: [
              { role: 'system', content: systemHint },
              { role: 'user', content: userContent },
            ],
            temperature: 0.7,
            stream: false,
          }),
        });

        if (!response.ok) {
          const txt = await response.text();
          errorText = `OpenRouter ${response.status}: ${txt.substring(0, 180)}`;
          continue;
        }

        const data = await response.json();
        extracted = extractMedia(data, agent.modality);
        if (extracted.length > 0) {
          errorText = null;
          break;
        }
        errorText = 'No media in model response';
      } catch (e) {
        errorText = (e as Error).message;
      }
    }

    // 11. Сохраняем результаты в Storage
    let stored: IStoredMedia[] = [];
    let finalCost = 0;
    if (extracted.length > 0) {
      try {
        stored = await persistOutputs(userId, body.chat_id, extracted, config);
      } catch (e) {
        errorText = `Failed to store result: ${(e as Error).message}`;
        stored = [];
      }
    }

    if (stored.length > 0) {
      // 12. Списание — только после того, как результат сохранён
      const charged = await chargeForGeneration(userId, estimatedCost, agent.modality, body.chat_id, config);

      await supabaseFetch(
        `messages?id=eq.${messageId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            text: 'Готово',
            metadata: {
              kind: 'generation',
              modality: agent.modality,
              status: 'done',
              params,
              prompt,
              negative_prompt: negative,
              media_inputs: mediaInputsMeta,
              cost: charged,
              media: stored,
              error: null,
              model_id: agent.model_id,
              progress: 1,
            },
          }),
        },
        config
      );
      finalCost = charged;
    } else {
      await updateGenerationStatus(
        messageId,
        'failed',
        errorText || 'Generation failed',
        config,
        { cost: 0 }
      );
    }

    openMessageId = null; // финальный статус записан

    const finalRows = await loadFinalMessages([requestMessageId, messageId], body.chat_id, config);

    return jsonResponse({
      success: true,
      message_id: messageId,
      request_message_id: requestMessageId,
      request_message: finalRows.find((r) => r.id === requestMessageId) || null,
      message: finalRows.find((r) => r.id === messageId) || null,
      status: stored.length > 0 ? 'done' : 'failed',
      cost: finalCost,
      media: stored.length > 0 ? stored : undefined,
      error: stored.length > 0 ? undefined : errorText || undefined,
    });
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

/**
 * Итоговые строки сообщений для ответа клиенту + отметка об изменении чата
 * (chats.updated_at: по ней клиенты других устройств понимают, что чат изменился).
 * Сбой здесь не должен ломать ответ: результат уже сохранён и оплачен.
 */
async function loadFinalMessages(ids: string[], chatId: string, config: any): Promise<any[]> {
  try {
    await supabaseFetch(
      `chats?id=eq.${chatId}`,
      { method: 'PATCH', body: JSON.stringify({ updated_at: new Date().toISOString() }) },
      config
    );
  } catch (err) {
    console.error('Failed to touch chat:', (err as Error).message);
  }

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

/**
 * Сообщения pending/processing в чате, когда замок свободен, — следы упавшей
 * попытки (функция умерла, не дойдя до финального статуса). Помечаем failed.
 */
async function failStaleGenerations(chatId: string, config: any): Promise<void> {
  try {
    const stale = await supabaseFetch(
      `messages?chat_id=eq.${chatId}&msg_type=eq.ai-msg` +
        `&metadata->>kind=eq.generation&metadata->>status=in.(pending,processing)&select=id`,
      { method: 'GET' },
      config
    );
    for (const row of Array.isArray(stale) ? stale : []) {
      await updateGenerationStatus(row.id, 'failed', 'Генерация прервана', config, { cost: 0 });
    }
  } catch (err) {
    console.error('failStaleGenerations error:', (err as Error).message);
  }
}

/**
 * Списание энергии за успешную генерацию. Возвращает фактически списанную сумму
 * (0 для admin/creator). Если списать не удалось (например, энергию успели
 * потратить в параллельном чате), результат всё равно отдаётся, а сбой пишется
 * в system_logs.
 */
async function chargeForGeneration(
  userId: number,
  amount: number,
  modality: string,
  chatId: string,
  config: any
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

    await logChargeFailure(userId, amount, chatId, spend?.error || 'unknown', config);
    return 0;
  } catch (err) {
    await logChargeFailure(userId, amount, chatId, (err as Error).message, config);
    return 0;
  }
}

async function logChargeFailure(
  userId: number,
  amount: number,
  chatId: string,
  reason: string,
  config: any
): Promise<void> {
  try {
    await supabaseFetch(
      'system_logs',
      {
        method: 'POST',
        body: JSON.stringify({
          level: 'warning',
          event_type: 'generation_charge_failed',
          message: `Не удалось списать ${amount} за успешную генерацию (пользователь ${userId}): ${reason}`,
          user_id: userId,
          metadata: { amount, chat_id: chatId, reason },
        }),
      },
      config
    );
  } catch (err) {
    console.error('logChargeFailure error:', (err as Error).message);
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

async function updateGenerationStatus(
  messageId: string,
  status: string,
  error: string | null,
  config: any,
  extra: Record<string, any> = {}
) {
  if (!messageId) return;
  // Получаем текущий metadata чтобы не затереть
  const current = await supabaseFetch(
    `messages?id=eq.${messageId}&select=metadata`,
    { method: 'GET' },
    config
  );
  const meta = (Array.isArray(current) && current[0]?.metadata) || {};
  await supabaseFetch(
    `messages?id=eq.${messageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        metadata: {
          ...meta,
          ...extra,
          status,
          error,
          progress: status === 'processing' ? 0.3 : status === 'done' ? 1 : 0,
        },
      }),
    },
    config
  );
}

function buildUserContent(
  prompt: string,
  params: Record<string, any>,
  negative: string | null
): string {
  let text = prompt;
  if (params && Object.keys(params).length) {
    text += '\n\nParameters: ' + JSON.stringify(params);
  }
  if (negative) {
    text += '\n\nNegative prompt: ' + negative;
  }
  return text;
}

function extractMedia(data: any, modality: string): Array<{ type: string; url: string }> {
  const media: Array<{ type: string; url: string }> = [];
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    // Ищем URL изображений / видео / аудио
    const urlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg))/gi;
    const matches = content.match(urlRegex) || [];
    for (const url of matches) {
      media.push({
        type: modality === 'video' ? 'video' : modality === 'audio' ? 'audio' : 'image',
        url,
      });
    }
    // base64 image
    const b64 = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (b64) {
      media.push({ type: 'image', url: b64[0] });
    }
  }

  // Некоторые модели возвращают images в отдельном поле
  const messageImages = data?.choices?.[0]?.message?.images;
  for (const img of Array.isArray(messageImages) ? messageImages : []) {
    const url = img?.image_url?.url || img?.url;
    if (url) media.push({ type: 'image', url });
  }
  if (Array.isArray(data?.images)) {
    for (const img of data.images) {
      if (img.url) media.push({ type: 'image', url: img.url });
    }
  }

  return media;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Достаёт байты результата: из data:-URL или по https-ссылке модели */
async function fetchOutputBytes(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+);base64,(.+)$/.exec(url);
    if (!m) throw new Error('Unsupported data URL');
    return { bytes: base64ToBytes(m[2]), mime: m[1].toLowerCase() };
  }

  if (!url.startsWith('https://')) throw new Error('Only https result URLs are supported');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Result download failed: ${res.status}`);

  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MEDIA_LIMITS.outputMaxBytes) throw new Error('Result is too large');

  const bytes = new Uint8Array(await res.arrayBuffer());

  let mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!isAllowedMime(mime)) mime = mimeFromUrlExt(url) || mime;

  return { bytes, mime };
}

/**
 * Кладёт результаты в Storage и учитывает их в media_files.
 * Порядок: запись → загрузка; при сбое загрузки запись откатывается.
 */
async function persistOutputs(
  userId: number,
  chatId: string,
  items: Array<{ type: string; url: string }>,
  config: any
): Promise<IStoredMedia[]> {
  const stored: IStoredMedia[] = [];

  for (const item of items) {
    const { bytes, mime } = await fetchOutputBytes(item.url);

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

    try {
      await uploadObject(storagePath, bytes, mime, config);
    } catch (err) {
      await deleteMediaRows([row.id], config);
      throw err;
    }

    stored.push({
      type: mediaTypeFromMime(mime) as IStoredMedia['type'],
      storage_path: storagePath,
      mime,
      size_bytes: bytes.length,
    });
  }

  return stored;
}
