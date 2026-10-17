// ============================================
// api/chat/stream.ts
// Описание: Стриминг ответов от ИИ (с поддержкой агентов)
// Версия: 3.8.1 - без неиспользуемых импортов и переменных
//          3.8.0 — пока идёт ответ, замок чата и резерв энергии продлеваются раз в минуту
//                  (длинный ответ больше не переживает их 300 с)
//          3.7.0 — финансы: курс ⚡ за $1 из настроек экономики (был зашит 10 000);
//                  каждый ответ пишется в журнал расходов ai_usage (модель, токены, $,
//                  бонусная/постоянная энергия) вместо openrouter_usage/agent_usage_logs;
//                  без usage.cost и токенов от OpenRouter списание считается по реально
//                  выданному тексту (раньше — оценка «вход + 500 токенов»); оценка входа
//                  для резерва с запасом 20% и учётом картинки; inject_balance — свободный
//                  баланс (без замороженного другими запросами)
//          3.6.2 — потолок ответа по реальным тарифам (trial/basic/pro/full/ultimate); для
//                  full/ultimate раньше срабатывал запасной потолок 4096
//          3.6.1 — IAgent без устаревших allowed_roles / min_pro_tier
//          3.6.0 — резерв энергии (sql/energy_holds.sql): перед запросом энергия
//                  замораживается атомарно в БД (параллельные запросы в разных чатах
//                  больше не тратят один баланс дважды); max_tokens — по замороженному;
//                  после ответа заморозка снимается и списывается факт; обрыв модели
//                  посреди ответа оплачивается по отданному тексту (раньше — бесплатно)
//                  истёкшая подписка считается trial; id/slug агента в запросе к БД экранируются
//          3.5.0 — история от клиента ограничена (до 100 сообщений и 400 000 символов,
//                  не больше окна контекста модели); без цены модели вход ограничен
//                  16 000 токенов (раньше можно было отправить сколько угодно за min_charge);
//                  роль сообщений только по типу (prompts.ts v5); проверка типов тела;
//                  создатель — из CREATOR_ID; убрана заглушка checkOpenRouterLimit
//          3.4.0 — ответ открывается сразу, модель вызывается внутри потока с «пульсом»;
//                  на каждом ключе ждём первое слово ≤45 с, потом следующий ключ (401/402/429/5xx/
//                  таймаут/ошибка внутри потока); понятный текст ошибки вместо «ключи перегружены»
//          3.3.1 — замок чата снимается до закрытия ответа (иначе второе сообщение → 409)
//          3.3.0 — блокировка пользователя (user_blocks) проверяется до запроса;
//                  генеративные агенты здесь не обслуживаются; оплата после ответа
//                  «до нуля» (p_allow_partial, недоплата в system_logs); обрыв клиентом
//                  оплачивается по фактически отданному тексту
//          3.2.0 — списание текста в долларах: usage.cost OpenRouter × ENERGY_PER_USD
//                  × коэффициент агента (единая шкала с фото/видео); предварительная
//                  проверка и max_tokens считаются по цене модели за токен
//          3.1.0 — замок чата: пока в чате идёт запрос, второй отклоняется (409);
//                  замок снимается после списания энергии, при обрыве клиента
//                  и при любой ошибке. chatId обязателен.
//          3.0.0 — daily_limit messages + spend RPC v2
//                  жёсткий потолок + динамическая проверка по context_length
//                  агента, содержимое уходит только в этот запрос
//                  (дописывается в systemPrompt), никуда не персистится
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  errorResponse,
  getSupabaseConfig,
  validateImageSize,
  isCreator,
} from '../_lib/index';

import { getRotatedKeysPool } from '../chats/index';
import { buildSystemPrompt, buildMessages } from '../chat/prompts';
import type { IHistoryMessage } from '../chat/prompts';
import { reserveEnergy, settleEnergy, releaseEnergy } from '../_lib/energy-hold';
import { estimateTokens } from '../_lib/tokens-usage';
import { supabaseFetch, supabaseRPC } from '../_lib/supabase-client';
import { checkAgentAccess } from '../_lib/agent-access';
import { getMarkupForTier } from '../_lib/markup-helper';
import {
  CHAT_LOCK_TTL,
  acquireChatLock,
  startLeaseRenewal,
  chatBusyResponse,
  isValidChatId,
} from '../_lib/chat-lock';
import type { IChatLock } from '../_lib/chat-lock';
import { agentMinCharge, energyForUsd, getEnergyRates, getModelPrices } from '../_lib/energy-pricing';
import type { IEnergyRates, IUsageRecord, UsageCostSource, UsageOutcome } from '../_lib/energy-pricing';

export const config = { runtime: 'edge' };

// ---------- Протокол потока с приложением ----------
/** Невидимый «пульс», пока модель не начала отвечать (приложение вырезает) */
const STREAM_HEARTBEAT = '\u0000';
/** Ошибка до первого слова: префикс + JSON { error, code } */
const STREAM_ERROR_PREFIX = '\u0000\u0001';
const HEARTBEAT_MS = 5_000;
/** Сколько ждём первого слова от модели на одном ключе */
const FIRST_TOKEN_TIMEOUT_MS = 45_000;
/** Общий бюджет на подключение (все ключи вместе) */
const START_BUDGET_MS = 100_000;

class UpstreamError extends Error {
  constructor(message: string, public retryable: boolean, public userMessage: string) {
    super(message);
  }
}

interface IUpstream {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
  /** Первые фрагменты текста, прочитанные при подключении */
  first: string[];
  usage: any | null;
  done: boolean;
}

/** Понятный текст для пользователя по ошибке OpenRouter */
function upstreamUserMessage(status: number): string {
  if (status === 429) return 'Модель сейчас перегружена. Попробуйте через минуту.';
  if (status === 404) return 'Модель недоступна у провайдера. Сообщите администратору.';
  if (status === 400) return 'Модель не приняла запрос. Попробуйте сократить сообщение или начать новый чат.';
  if (status === 408 || status === 0) return 'Модель долго не отвечает. Попробуйте ещё раз.';
  return 'Модель сейчас недоступна. Попробуйте ещё раз.';
}

/** Разбор SSE OpenRouter: текст, usage и ошибка (если пришла внутри потока) */
function parseSse(buffer: string, chunk: string): { buffer: string; contents: string[]; usage: any | null; error: any | null } {
  const lines = (buffer + chunk).split('\n');
  const rest = lines.pop() || '';
  const contents: string[] = [];
  let usage: any | null = null;
  let error: any | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;
    const jsonStr = trimmed.slice(6).trim();
    if (jsonStr === '[DONE]') continue;
    try {
      const data = JSON.parse(jsonStr);
      if (data.error) error = data.error;
      const content = data.choices?.[0]?.delta?.content;
      if (content) contents.push(content);
      if (data.usage) usage = data.usage;
    } catch {
      // неполная строка / не JSON — пропускаем
    }
  }
  return { buffer: rest, contents, usage, error };
}

/**
 * Подключение к модели одним ключом: ждём заголовки и первое слово не дольше
 * FIRST_TOKEN_TIMEOUT_MS. Ошибка до первого слова — UpstreamError (retryable =
 * можно попробовать другой ключ: 401/402/403 ключ, 408/429 перегрузка, 5xx, таймаут).
 */
async function openUpstream(key: string, body: string, deadline: number): Promise<IUpstream> {
  const ctrl = new AbortController();
  const timeoutMs = Math.max(1_000, Math.min(FIRST_TOKEN_TIMEOUT_MS, deadline - Date.now()));
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vercel.com',
        'X-Title': 'Telegram Mini App FIBI Agent',
      },
      body,
      signal: ctrl.signal,
    });

    if (!response.ok) {
      const text = (await response.text().catch(() => '')).substring(0, 300);
      const st = response.status;
      const retryable = st === 401 || st === 402 || st === 403 || st === 408 || st === 429 || st >= 500;
      throw new UpstreamError(`OpenRouter ${st}: ${text}`, retryable, upstreamUserMessage(st));
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const first: string[] = [];
    let usage: any | null = null;

    while (first.length === 0) {
      const { done, value } = await reader.read();
      if (done) return { reader, decoder, buffer, first, usage, done: true };
      const parsed = parseSse(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.buffer;
      if (parsed.usage) usage = parsed.usage;
      if (parsed.error && parsed.contents.length === 0) {
        try {
          await reader.cancel();
        } catch {
          // уже закрыт
        }
        const code = Number(parsed.error?.code) || 500;
        throw new UpstreamError(
          `OpenRouter stream error ${code}: ${String(parsed.error?.message || '').substring(0, 300)}`,
          code === 401 || code === 402 || code === 403 || code === 408 || code === 429 || code >= 500,
          upstreamUserMessage(code)
        );
      }
      first.push(...parsed.contents);
    }

    return { reader, decoder, buffer, first, usage, done: false };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new UpstreamError(`таймаут ${timeoutMs} мс без ответа модели`, true, upstreamUserMessage(408));
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface IStreamRequestBody {
  historyMessages?: IHistoryMessage[];
  currentTopic?: string;
  userLang?: string;
  attachedImage?: string | null;
  attachedFile?: { name: string; content: string } | null;
  agentId?: string | null;
  /** Чат, в котором идёт запрос (ключ замка) */
  chatId?: string | null;
}

interface IAgent {
  id: string;
  slug: string;
  name: any;
  modality: string;
  model_id: string;
  system_prompt: string;
  markup_coefficient: number;
  min_charge: number;
  allowed_tiers: string[] | null;
  markup_by_tier: Record<string, number> | null;
  inject_balance: boolean;
  welcome_message: any;
  is_active: boolean;
  context_length: number | null;
}

// Загрузка файлов (repomix-дампы и т.п.) — v1, только для создателя.
// Содержимое НЕ сохраняется нигде — попадает только в этот один запрос
// к модели (через systemPrompt ниже), в историю чата не персистится.
const MAX_ATTACHED_FILE_CHARS = 3_000_000; // ~3 МБ текста — жёсткий потолок
const RESPONSE_TOKEN_RESERVE = 4000; // запас под ответ модели
const MIN_EXPECTED_COMPLETION_TOKENS = 500; // ответ, который заведомо должен поместиться в баланс
/** Оценка входа по символам бывает занижена (код, смешанный текст): резерв — с запасом */
const INPUT_ESTIMATE_MARGIN = 1.2;
/** Картинка во входе: оценка в токенах (по символам её не посчитать) */
const IMAGE_INPUT_TOKENS = 1500;
/** История от клиента: не больше стольких последних сообщений */
const MAX_HISTORY_MESSAGES = 100;
/** История от клиента: не больше стольких символов всего */
const MAX_HISTORY_CHARS = 400_000;
/** Если цену модели узнать не удалось — вход не больше стольких токенов */
const MAX_INPUT_TOKENS_WITHOUT_PRICE = 16_000;
/** Потолок длины ответа (токены) по тарифу: ключи — subscription_tiers.tier_key */
const HARD_CAP_BY_TIER: Record<string, number> = {
  trial: 1500,
  basic: 3000,
  pro: 6000,
  full: 8000,
  ultimate: 8000,
};

async function getAgentById(
  agentId: string,
  config: any
): Promise<IAgent | null> {
  try {
    const result = await supabaseFetch(
      `ai_agents?id=eq.${encodeURIComponent(agentId)}&select=*`,
      { method: 'GET' },
      config
    );

    if (!result || !Array.isArray(result) || result.length === 0) {
      return null;
    }

    return result[0];
  } catch (err) {
    console.error('Failed to get agent:', err);
    return null;
  }
}

async function getAgentBySlug(
  slug: string,
  config: any
): Promise<IAgent | null> {
  try {
    const result = await supabaseFetch(
      `ai_agents?slug=eq.${encodeURIComponent(slug)}&select=*`,
      { method: 'GET' },
      config
    );

    if (!result || !Array.isArray(result) || result.length === 0) {
      return null;
    }

    return result[0];
  } catch (err) {
    console.error('Failed to get agent by slug:', err);
    return null;
  }
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  // Замок чата и заморозка энергии. После передачи стриму их снимает сам стрим
  // (в конце, при обрыве клиента или ошибке); во всех остальных случаях — finally ниже.
  let chatLock: IChatLock | null = null;
  let lockOwnedByStream = false;
  let holdId: string | null = null;
  let holdClosed = false;
  let dbConfig: any = null;

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');
    dbConfig = config;

    const blocked = await supabaseRPC('is_user_blocked', { p_user_id: userId }, config).catch(() => false);
    if (blocked === true) {
      return errorResponse('⛔ Доступ к приложению ограничен администратором.', 403, {
        'X-Access-Reason': 'blocked',
      });
    }

    let body: IStreamRequestBody;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { currentTopic, userLang, agentId, chatId } = body;

    if (!isValidChatId(chatId)) {
      return errorResponse('chatId is required', 400);
    }

    // ---------- Проверка тела запроса ----------
    const attachedImage = typeof body.attachedImage === 'string' && body.attachedImage ? body.attachedImage : null;
    const attachedFile =
      body.attachedFile && typeof body.attachedFile.content === 'string' && body.attachedFile.content
        ? { name: String(body.attachedFile.name || 'file').substring(0, 200), content: body.attachedFile.content }
        : null;

    const rawHistory = Array.isArray(body.historyMessages) ? body.historyMessages : [];
    const historyMessages: IHistoryMessage[] = rawHistory
      .slice(-MAX_HISTORY_MESSAGES)
      .filter((m) => m && (m.type === 'user-msg' || m.type === 'ai-msg') && typeof m.text === 'string')
      .map((m) => ({ type: m.type, text: m.text }));
    const historyChars = historyMessages.reduce((n, m) => n + m.text.length, 0);
    if (historyChars > MAX_HISTORY_CHARS) {
      return errorResponse('История чата слишком длинная. Уменьшите контекст в настройках чата или начните новый чат.', 413);
    }

    console.log('📨 [stream] Запрос:', {
      userId,
      agentId,
      currentTopic,
      hasImage: !!attachedImage,
      hasFile: !!attachedFile,
      historyLength: historyMessages.length,
    });

    let agent: IAgent | null = null;
    let effectiveAgentId: string | null = null;

    if (agentId && isValidChatId(agentId)) {
      agent = await getAgentById(agentId, config);
      if (agent) {
        effectiveAgentId = agentId;
        console.log(`✅ [stream] Агент найден по ID: ${agent.slug}`);
      }
    }

    if (!agent && currentTopic) {
      agent = await getAgentBySlug(currentTopic, config);
      if (agent) {
        effectiveAgentId = agent.id;
        console.log(`✅ [stream] Агент найден по slug: ${agent.slug}`);
      }
    }

    if (!agent) {
      agent = await getAgentBySlug('code', config);
      if (agent) {
        effectiveAgentId = agent.id;
        console.log(`✅ [stream] Используем дефолтного агента: ${agent.slug}`);
      } else {
        console.warn('⚠️ [stream] Агент не найден, используем fallback');
        return errorResponse('Агент не найден', 404);
      }
    }

    const userRes = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=role,subscription_tier,premium_until`,
      { method: 'GET' },
      config
    );

    const userRole = (userRes && Array.isArray(userRes) && userRes.length > 0)
      ? userRes[0].role || 'trial'
      : 'trial';
    // Истёкшая подписка — как trial (доступ к агентам, коэффициент, потолок ответа)
    const userRow = (userRes && Array.isArray(userRes) && userRes.length > 0) ? userRes[0] : null;
    const premiumExpired = !!userRow?.premium_until && new Date(userRow.premium_until).getTime() < Date.now();
    const userProTier = userRow && !premiumExpired ? userRow.subscription_tier || null : null;

    // Генеративные агенты (фото/видео) работают через /api/generations/create
    const agentModality = String((agent as any).modality || 'text');
    if (agentModality !== 'text') {
      return errorResponse('Этот агент создаёт медиа: используйте форму генерации в чате.', 400);
    }

    const access = checkAgentAccess(agent, userRole, userProTier);

    if (!access.hasAccess) {
      console.warn(`⚠️ [stream] Доступ запрещён: ${access.reason}`);
      return errorResponse(
        `Доступ к агенту "${agent.name?.ru || agent.slug}" запрещён`,
        403,
        {
          'X-Access-Reason': access.reason || 'unknown',
          'X-Agent-Slug': agent.slug,
        }
      );
    }

    console.log(`✅ [stream] Доступ разрешён для роли: ${userRole}`);

    const isVision = !!(attachedImage && attachedImage.trim().length > 0);

    if (isVision) {
      const validation = validateImageSize(attachedImage, 5);
      if (!validation.valid) {
        return errorResponse(
          `Изображение слишком большое (${validation.sizeInMB}MB). Максимум 5MB.`,
          413
        );
      }

      if (!isCreator(userId)) {
        return errorResponse(
          '📸 Отправка изображений доступна только создателю приложения',
          403
        );
      }
    }

    let attachedFileBlock = '';
    if (attachedFile?.content) {
      if (!isCreator(userId)) {
        return errorResponse(
          '📎 Загрузка файлов пока доступна только создателю приложения',
          403
        );
      }

      if (attachedFile.content.length > MAX_ATTACHED_FILE_CHARS) {
        return errorResponse(
          `Файл слишком большой (${Math.round(attachedFile.content.length / 1024)} КБ). Максимум ${Math.round(MAX_ATTACHED_FILE_CHARS / 1024)} КБ текста.`,
          413
        );
      }

      // Динамическая проверка: хватит ли окна контекста модели на
      // системный промпт + историю + файл + запас под ответ.
      // context_length может быть не заполнен для старых агентов —
      // в этом случае пропускаем динамическую проверку, остаётся
      // только жёсткий потолок выше.
      if (agent.context_length) {
        const usedTokens =
          estimateTokens(
            historyMessages.map(m => ({ role: 'user', content: m.text })),
            agent.system_prompt || ''
          ) + RESPONSE_TOKEN_RESERVE;
        const fileTokens = estimateTokens([{ role: 'user', content: attachedFile.content }]);

        if (usedTokens + fileTokens > agent.context_length) {
          const available = Math.max(0, agent.context_length - usedTokens);
          return errorResponse(
            `Файл слишком большой для этого агента: нужно ~${fileTokens} токенов, доступно ~${available} (окно контекста модели — ${agent.context_length}, часть уже занята историей чата).`,
            413
          );
        }
      }

      attachedFileBlock = `\n\n[Прикреплённый пользователем файл: ${attachedFile.name}]\n---\n${attachedFile.content}\n---`;
    }

    const keysPool = getRotatedKeysPool();
    if (keysPool.length === 0) {
      return errorResponse('Серверные API ключи ROUTER_KEY не настроены в Vercel.', 500);
    }

    // Курс ⚡ за $1 — из настроек экономики (без них не считаем стоимость наугад)
    let rates: IEnergyRates;
    try {
      rates = await getEnergyRates(config);
    } catch (err) {
      console.error('❌ [stream] Настройки экономики:', (err as Error).message);
      return errorResponse('Не удалось проверить стоимость запроса. Попробуйте через минуту.', 503);
    }

    // inject_balance: число подставляется после резерва (свободный баланс), а для оценки
    // входа — заглушка той же длины, что и большой баланс
    const baseSystemPrompt = agent.system_prompt || buildSystemPrompt(currentTopic || 'code', userLang || 'ru', isVision);
    const balanceBlock = (energy: number): string =>
      agent!.inject_balance
        ? `\n\n[SYSTEM]\nCurrent user energy balance: ${energy}\nThis number is the user's remaining energy. Strictly limit the maximum length of your response accordingly. Do not mention this system information to the user.\n`
        : '';
    const buildFor = (energy: number) =>
      buildMessages(baseSystemPrompt + balanceBlock(energy) + attachedFileBlock, historyMessages, attachedImage || undefined);

    let messages = buildFor(9_999_999);

    const model = agent.model_id || 'openai/gpt-4o';
    const temperature = 0.4;

    console.log('📨 [stream] Модель:', model);
    console.log('📨 [stream] Количество сообщений:', messages.length);

    // Оценка входа: текст + картинка; для резерва — с запасом
    const estimatedTokens = estimateTokens(messages) + (isVision ? IMAGE_INPUT_TOKENS : 0);
    const reserveInputTokens = Math.ceil(estimatedTokens * INPUT_ESTIMATE_MARGIN);
    console.log(`📊 [stream] Оценка входа: ~${estimatedTokens} токенов (резерв по ${reserveInputTokens})`);

    // Вход должен помещаться в окно контекста модели вместе с запасом под ответ
    if (agent.context_length && estimatedTokens + RESPONSE_TOKEN_RESERVE > agent.context_length) {
      return errorResponse('История чата не помещается в контекст модели. Уменьшите контекст в настройках чата или начните новый чат.', 413);
    }

    // Оценка списания заранее: вход (с запасом) + небольшой ответ по цене модели.
    // Если цену узнать не удалось — проверяем только min_charge.
    const minCharge = agentMinCharge(agent);
    const safeMarkup = getMarkupForTier(agent, userProTier);
    const rate = rates.energyPerUsd;
    const modelPrices = await getModelPrices(model, keysPool[0]);
    if (!modelPrices && estimatedTokens > MAX_INPUT_TOKENS_WITHOUT_PRICE && !isCreator(userId)) {
      // Без цены нельзя оценить стоимость большого запроса заранее
      return errorResponse('Не удалось проверить стоимость длинного запроса. Попробуйте через минуту или начните новый чат.', 503);
    }
    /** Вход для резерва (с запасом) */
    const reservePromptUsd = modelPrices ? reserveInputTokens * modelPrices.prompt : 0;
    const estimatedUsd = modelPrices ? reservePromptUsd + MIN_EXPECTED_COMPLETION_TOKENS * modelPrices.completion : 0;
    const estimatedCharge = energyForUsd(estimatedUsd, rate, safeMarkup, minCharge);
    console.log(`💰 [stream] Оценка charge: $${estimatedUsd.toFixed(6)} × ${rate} × ${safeMarkup} (tier=${userProTier || 'trial'}) → max(..., ${minCharge}) = ${estimatedCharge}`);

    // Потолок ответа: окно контекста модели и тариф
    const capTokens = Math.min(
      agent.context_length ? Math.floor(agent.context_length * 0.4) : 4096,
      HARD_CAP_BY_TIER[userProTier || 'trial'] ?? HARD_CAP_BY_TIER.trial
    );
    // Сколько выходных токенов можно оплатить энергией energy при цене модели
    function completionTokensFor(energy: number): number {
      if (!modelPrices || modelPrices.completion <= 0) return 999999;
      const usd = energy / (rate * Math.max(safeMarkup, 0.1)) - reservePromptUsd;
      return Math.max(0, Math.floor(usd / modelPrices.completion));
    }
    // Хотим заморозить стоимость самого длинного допустимого ответа; минимум — оценка
    const maxCharge = modelPrices
      ? Math.max(estimatedCharge, energyForUsd(reservePromptUsd + capTokens * modelPrices.completion, rate, safeMarkup, minCharge))
      : estimatedCharge;

    // Замок чата: до этой точки возвраты без замка, дальше он обязателен
    const acquired = await acquireChatLock(userId, chatId, 'text', config);
    if (!acquired.ok) {
      console.warn(`⚠️ [stream] Чат ${chatId} занят, повтор через ~${acquired.retryAfter}с`);
      return chatBusyResponse(acquired.retryAfter);
    }
    chatLock = acquired.lock;

    // Заморозка энергии: атомарно в БД, с учётом других идущих запросов пользователя
    const reservation = await reserveEnergy(
      userId,
      estimatedCharge,
      maxCharge,
      'text',
      chatId,
      CHAT_LOCK_TTL.text,
      config
    );

    if (!reservation.ok) {
      const free = Math.max(0, reservation.total - reservation.held);
      const heldNote = reservation.held > 0
        ? `\n${reservation.held} ⚡ заняты идущими запросами — дождитесь их окончания.`
        : '';
      let userMessage = '';

      if (reservation.reason === 'daily_limit') {
        userMessage =
          `⏳ Дневной лимит тарифа: не хватает на этот запрос.\n` +
          `Сегодня: ${reservation.spentToday} / ${reservation.dailyLimit} ⚡.\n` +
          `Нужно ~${estimatedCharge} ⚡. Завтра лимит обновится.` + heldNote;
      } else if (reservation.total === 0) {
        userMessage =
          `⚠️ Недостаточно энергии.\n` +
          `Доступно: 0 ⚡\n` +
          `Бонус обновится завтра или пополните баланс.`;
      } else {
        userMessage =
          `⚠️ Недостаточно энергии для агента «${agent.name?.ru || agent.slug}».\n` +
          `Нужно ~${estimatedCharge} ⚡\n` +
          `Доступно: ${free} ⚡ (${reservation.bonus} бонусных + ${reservation.permanent} постоянных)` + heldNote;
      }

      return errorResponse(userMessage, 429, {
        'X-Token-Bonus': String(reservation.bonus),
        'X-Token-Permanent': String(reservation.permanent),
        'X-Token-Total': String(free),
        'X-Token-Needed': String(estimatedCharge),
        'X-Token-Reason': reservation.reason || 'insufficient',
        'X-Daily-Spent': String(reservation.spentToday),
        'X-Daily-Limit': String(reservation.dailyLimit),
      });
    }
    holdId = reservation.holdId;

    // Свободный баланс до этого запроса: без энергии, замороженной другими запросами
    if (agent.inject_balance) {
      const freeBalance = reservation.bypass
        ? reservation.total
        : Math.max(0, reservation.total - reservation.held);
      messages = buildFor(freeBalance);
    }

    // max_tokens — сколько оплачивает замороженная энергия (не больше потолка)
    const maxTokens = Math.max(
      256,
      Math.min(reservation.bypass ? capTokens : completionTokensFor(reservation.amount), capTokens)
    );
    console.log(`🔒 [stream] Заморожено ${reservation.amount} ⚡ (нужно ≥${estimatedCharge}, хотели ${maxCharge})`);
    console.log(`📏 [stream] max_tokens = ${maxTokens}`);

    /** Строка журнала расходов для этого запроса */
    const usageRecord = (fields: {
      prompt_tokens: number | null;
      completion_tokens: number | null;
      cost_usd: number;
      cost_source: UsageCostSource;
      outcome: UsageOutcome;
    }): IUsageRecord => ({
      kind: 'text',
      model_id: model,
      agent_id: effectiveAgentId,
      chat_id: chatId,
      markup: safeMarkup,
      energy_per_usd: rate,
      ...fields,
    });

    /**
     * Снять заморозку. usage есть — списать charge (может быть 0) и записать расход;
     * нет — снять без списания (до модели запрос не дошёл).
     * Срабатывает один раз (флаг ставится синхронно — обрыв клиента и конец
     * потока не спишут дважды).
     */
    const closeHold = async (charge: number, description: string, usage: IUsageRecord | null): Promise<void> => {
      if (holdClosed) return;
      holdClosed = true;
      if (!usage) {
        await releaseEnergy(holdId, config);
        return;
      }
      const amount = Number.isFinite(charge) && charge > 0 ? charge : 0;
      const res = await settleEnergy(holdId, userId, amount, 'chat', description, usage, config);
      if (res.success) {
        console.log(`✅ [stream] Списано ${res.charged} ⚡ (запрошено ${amount}): bonus=${res.bonusUsed}, permanent=${res.permanentUsed}`);
      } else {
        console.warn(`⚠️ [stream] Не удалось списать ${amount} ⚡: ${res.error}`);
        await releaseEnergy(holdId, config);
      }
    };

    let finalUsage: any = null;
    let accumulatedText = '';

    /**
     * Стоимость по реально выданному тексту — когда OpenRouter не прислал ни cost, ни токены
     * (обрыв клиентом/моделью, сбой usage). Вход — по оценке без запаса.
     */
    const deliveredEstimate = (): { usd: number; completionTokens: number; source: UsageCostSource } => {
      const completionTokens = accumulatedText.trim().length > 0
        ? estimateTokens([{ role: 'assistant', content: accumulatedText }])
        : 0;
      if (!modelPrices) return { usd: 0, completionTokens, source: 'none' };
      return {
        usd: estimatedTokens * modelPrices.prompt + completionTokens * modelPrices.completion,
        completionTokens,
        source: 'estimate',
      };
    };

    /** Списание и строка журнала за уже отданную часть ответа; null — ничего не отдано */
    const deliveredCharge = (outcome: UsageOutcome): { charge: number; usage: IUsageRecord } | null => {
      if (accumulatedText.trim().length === 0) return null;
      const est = deliveredEstimate();
      return {
        charge: energyForUsd(est.usd, rate, safeMarkup, minCharge),
        usage: usageRecord({
          prompt_tokens: estimatedTokens,
          completion_tokens: est.completionTokens,
          cost_usd: est.usd,
          cost_source: est.source,
          outcome,
        }),
      };
    };
    let chunksReceived = 0;
    let clientCancelled = false;
    let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const encoder = new TextEncoder();

    // Ответ открывается СРАЗУ, а модель вызывается уже внутри потока.
    // Пока модель не начала отвечать, раз в несколько секунд уходит невидимый
    // «пульс» (\u0000) — приложение его вырезает. Ошибка до первого слова
    // приходит одним сообщением с префиксом \u0000\u0001 + JSON.
    // Продление замка и резерва, пока идёт ответ (снимается в конце потока и при обрыве)
    let stopLease: () => void = () => {};

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        stopLease = startLeaseRenewal({
          userId,
          chatId,
          lockToken: chatLock?.token ?? null,
          holdId,
          ttlSeconds: CHAT_LOCK_TTL.text,
          config,
        });
        const send = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // клиент ушёл
          }
        };
        send(STREAM_HEARTBEAT);
        const heartbeat = setInterval(() => {
          if (!accumulatedText) send(STREAM_HEARTBEAT);
        }, HEARTBEAT_MS);

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalTokens = 0;
        let totalCostUsd: number | null = null;

        const applyUsage = (usage: any) => {
          if (!usage) return;
          totalPromptTokens = usage.prompt_tokens || 0;
          totalCompletionTokens = usage.completion_tokens || 0;
          totalTokens = usage.total_tokens || 0;
          const cost = Number(usage.cost);
          if (Number.isFinite(cost) && cost >= 0) totalCostUsd = cost;
          finalUsage = usage;
        };

        const failBeforeContent = async (message: string) => {
          clearInterval(heartbeat);
          send(STREAM_ERROR_PREFIX + JSON.stringify({ error: message, code: 'upstream' }));
          await closeHold(0, '', null);
          await chatLock?.release();
          try {
            controller.close();
          } catch {
            // уже закрыт
          }
        };

        try {
          // ---------- Подключение к модели: перебор ключей ----------
          const requestBody = JSON.stringify({
            model: model,
            messages: messages,
            temperature: temperature,
            stream: true,
            stream_options: { include_usage: true },
            usage: { include: true },
            max_tokens: maxTokens,
          });

          const deadline = Date.now() + START_BUDGET_MS;
          let upstream: IUpstream | null = null;
          let lastErr: Error | null = null;

          for (let k = 0; k < keysPool.length && !clientCancelled && Date.now() < deadline; k++) {
            try {
              console.log(`📨 [stream] Пробуем ключ ROUTER_KEY${k}`);
              upstream = await openUpstream(keysPool[k], requestBody, deadline);
              console.log(`✅ [stream] ROUTER_KEY${k}: модель начала отвечать`);
              break;
            } catch (err) {
              lastErr = err as Error;
              console.error(`❌ [stream] ROUTER_KEY${k}: ${(err as Error).message}`);
              if (err instanceof UpstreamError && !err.retryable) break;
            }
          }

          if (clientCancelled) {
            // Ответа не было: cancel() уже сняла заморозку без списания
            clearInterval(heartbeat);
            await chatLock?.release();
            return;
          }

          if (!upstream) {
            const message = lastErr instanceof UpstreamError
              ? lastErr.userMessage
              : 'Модель сейчас недоступна. Попробуйте ещё раз.';
            console.warn(`⚠️ [stream] Ни один ключ не сработал: ${lastErr?.message || 'нет ключей/время вышло'}`);
            await failBeforeContent(`${message} Энергия не списана.`);
            return;
          }

          upstreamReader = upstream.reader;
          applyUsage(upstream.usage);
          for (const c of upstream.first) {
            accumulatedText += c;
            send(c);
          }
          clearInterval(heartbeat);

          // ---------- Чтение ответа ----------
          let streamCompleted = upstream.done;
          let buffer = upstream.buffer;
          while (!streamCompleted) {
            const { done, value } = await upstream.reader.read();
            if (done) {
              streamCompleted = true;
              break;
            }
            chunksReceived++;
            const parsed = parseSse(buffer, upstream.decoder.decode(value, { stream: true }));
            buffer = parsed.buffer;
            applyUsage(parsed.usage);
            if (parsed.error) {
              console.warn('⚠️ [stream] Ошибка модели посреди ответа:', JSON.stringify(parsed.error).substring(0, 300));
            }
            for (const c of parsed.contents) {
              accumulatedText += c;
              send(c);
            }
          }

          if (clientCancelled) {
            console.warn(`⚠️ [stream] Клиент оборвал соединение (списание — в cancel()).`);
          } else if (streamCompleted && accumulatedText.trim().length > 0) {
            console.log(`📊 [stream] Стрим завершен успешно (${chunksReceived} чанков, ${accumulatedText.length} символов)`);
            console.log(`📊 [stream] OpenRouter usage:`, finalUsage);

            // Факт — usage.cost. Нет его (BYOK, сбой usage) — по токенам OpenRouter и цене
            // модели; нет и токенов — по реально выданному тексту
            let usd: number;
            let usdSource: UsageCostSource;
            let promptTokens: number;
            let completionTokens: number;
            if (totalCostUsd !== null && totalCostUsd > 0) {
              usd = totalCostUsd;
              usdSource = 'usage';
              promptTokens = totalPromptTokens;
              completionTokens = totalCompletionTokens;
            } else if (modelPrices && totalTokens > 0) {
              usd = totalPromptTokens * modelPrices.prompt + totalCompletionTokens * modelPrices.completion;
              usdSource = 'tokens';
              promptTokens = totalPromptTokens;
              completionTokens = totalCompletionTokens;
            } else {
              const est = deliveredEstimate();
              usd = est.usd;
              usdSource = est.source;
              promptTokens = totalTokens > 0 ? totalPromptTokens : estimatedTokens;
              completionTokens = totalTokens > 0 ? totalCompletionTokens : est.completionTokens;
            }
            const charge = energyForUsd(usd, rate, safeMarkup, minCharge);

            console.log(`💰 [stream] Расчёт charge (${usdSource}): $${usd.toFixed(6)} × ${rate} × ${safeMarkup} (tier=${userProTier || 'trial'}) → max(..., ${minCharge}) = ${charge}`);

            await closeHold(charge, 'Запрос к агенту', usageRecord({
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              cost_usd: usd,
              cost_source: usdSource,
              outcome: 'done',
            }));
          } else if (streamCompleted && accumulatedText.trim().length === 0) {
            console.warn(`⚠️ [stream] Стрим завершен, но ответ пустой. Энергия не списана.`);
            // Расход OpenRouter (если был) — в журнал, пользователю — без списания
            const hasCost = (totalCostUsd !== null && totalCostUsd > 0) || totalTokens > 0;
            await closeHold(0, 'Пустой ответ модели', hasCost
              ? usageRecord({
                  prompt_tokens: totalPromptTokens,
                  completion_tokens: totalCompletionTokens,
                  cost_usd: totalCostUsd ?? (modelPrices
                    ? totalPromptTokens * modelPrices.prompt + totalCompletionTokens * modelPrices.completion
                    : 0),
                  cost_source: totalCostUsd !== null && totalCostUsd > 0 ? 'usage' : modelPrices ? 'tokens' : 'none',
                  outcome: 'empty',
                })
              : null);
          }

          // Замок снимаем ДО закрытия ответа: после close() Edge-функция может
          // быть остановлена, и снятие не успевало выполниться (второе сообщение → 409).
          await chatLock?.release();
          if (!clientCancelled) controller.close();
        } catch (err) {
          console.error('❌ Ошибка в стриме:', err);
          clearInterval(heartbeat);
          if (!accumulatedText) {
            await failBeforeContent('Не удалось получить ответ модели. Энергия не списана — попробуйте ещё раз.');
          } else {
            // Модель оборвалась посреди ответа: отданная часть оплачена нами в OpenRouter
            if (!clientCancelled) {
              const delivered = deliveredCharge('broken');
              await closeHold(delivered?.charge ?? 0, 'Запрос к агенту (ответ оборвался)', delivered?.usage ?? null);
            }
            await chatLock?.release();
            try {
              controller.close();
            } catch {
              // уже закрыт
            }
          }
        } finally {
          clearInterval(heartbeat);
          stopLease();
          // Страховка (обе операции идемпотентны). При обрыве клиентом заморозкой
          // распоряжается cancel()
          if (!clientCancelled) await closeHold(0, '', null);
          await chatLock?.release();
        }
      },
      async cancel() {
        // Клиент ушёл (закрыл приложение / прервал запрос): не ждём конца
        // ответа модели. Отданная часть ответа уже оплачена нами в OpenRouter,
        // поэтому списываем за неё (иначе обрыв в конце = бесплатный ответ)
        clientCancelled = true;
        stopLease();
        // Списание запускается ДО ожидания чего-либо: closeHold синхронно ставит флаг,
        // и завершение потока уже не снимет заморозку бесплатно
        const delivered = deliveredCharge('cancelled');
        const settling = closeHold(delivered?.charge ?? 0, 'Запрос к агенту (прерван)', delivered?.usage ?? null).catch((err) => {
          console.error('❌ [stream] Ошибка списания при обрыве:', err);
        });
        if (delivered) console.log(`💰 [stream] Обрыв клиентом: списание по отданному тексту ${delivered.charge}`);
        try {
          await upstreamReader?.cancel();
        } catch {
          // уже закрыт
        }
        await settling;
        await chatLock?.release();
      }
    });

    lockOwnedByStream = true;

    return new Response(readable, {
      headers: {
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache, no-transform',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Agent-Slug': agent.slug,
        ...corsHeaders
      }
    });
  } catch (err) {
    console.error('Stream handler error:', (err as Error).message);
    return errorResponse(`Критическое исключение сервера: ${(err as Error).message}`, 500);
  } finally {
    if (!lockOwnedByStream) {
      if (holdId && !holdClosed && dbConfig) await releaseEnergy(holdId, dbConfig);
      if (chatLock) await chatLock.release();
    }
  }
}
