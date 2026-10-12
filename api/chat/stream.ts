// ============================================
// api/chat/stream.ts
// Описание: Стриминг ответов от ИИ (с поддержкой агентов)
// Версия: 3.3.0 — блокировка пользователя (user_blocks) проверяется до запроса;
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
} from '../_lib/index';

import { getModelConfig, getRotatedKeysPool } from '../chats/index';
import { buildSystemPrompt, buildMessages } from '../chat/prompts';
import {
  checkTokenAvailability,
} from '../_lib/tokens';
import {
  checkOpenRouterLimit,
  logOpenRouterUsage,
  estimateTokens,
} from '../_lib/tokens-usage';
import { getSupabaseConfig as getSupabase, supabaseFetch, supabaseRPC } from '../_lib/supabase-client';
import { checkAgentAccess } from '../_lib/agent-access';
import { getMarkupForTier } from '../_lib/markup-helper';
import {
  acquireChatLock,
  chatBusyResponse,
  isValidChatId,
} from '../_lib/chat-lock';
import type { IChatLock } from '../_lib/chat-lock';
import { ENERGY_PER_USD, getModelPrices, textEnergyForUsd } from '../_lib/text-pricing';

export const config = { runtime: 'edge' };

const MY_TELEGRAM_ID = 1541531808;

interface IStreamRequestBody {
  historyMessages?: Array<{ type: string; text: string; role?: string }>;
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
  allowed_roles: string[];
  min_pro_tier: string | null;
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

async function getAgentById(
  agentId: string,
  config: any
): Promise<IAgent | null> {
  try {
    const result = await supabaseFetch(
      `ai_agents?id=eq.${agentId}&select=*`,
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
      `ai_agents?slug=eq.${slug}&select=*`,
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

async function spendTokens(
  userId: number,
  amount: number,
  config: any,
  description: string = 'Запрос к агенту'
): Promise<{
  success: boolean;
  bonusUsed: number;
  permanentUsed: number;
  remainingBonus: number;
  remainingPermanent: number;
  spent_today?: number;
  bypass?: boolean;
  error?: string;
}> {
  try {
    const result = await supabaseRPC(
      'spend_abstract_tokens',
      {
        p_user_id: userId,
        p_amount: amount,
        p_source: 'chat',
        p_description: description,
        // Ответ уже отдан: списываем сколько есть, недоплату пишет БД
        p_allow_partial: true,
      },
      config
    );

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        bonusUsed: 0,
        permanentUsed: 0,
        remainingBonus: 0,
        remainingPermanent: 0,
        error: 'Failed to spend tokens',
      };
    }

    if (result.success === false) {
      return {
        success: false,
        bonusUsed: 0,
        permanentUsed: 0,
        remainingBonus: 0,
        remainingPermanent: 0,
        spent_today: result.spent_today,
        error: result.error || 'Failed to spend tokens',
      };
    }

    return {
      success: true,
      bypass: result.bypass === true,
      bonusUsed: result.used_bonus || 0,
      permanentUsed: result.used_permanent || 0,
      remainingBonus: result.bonus_after ?? 0,
      remainingPermanent: result.permanent_after ?? 0,
      spent_today: result.spent_today,
    };
  } catch (err) {
    console.error('Failed to spend tokens:', err);
    return {
      success: false,
      bonusUsed: 0,
      permanentUsed: 0,
      remainingBonus: 0,
      remainingPermanent: 0,
      error: (err as Error).message,
    };
  }
}

async function logAgentUsage(
  userId: number,
  agentId: string,
  modelId: string,
  openrouterTokens: number,
  charge: number,
  promptTokens: number,
  completionTokens: number,
  config: any
): Promise<void> {
  try {
    await supabaseFetch(
      'agent_usage_logs',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          agent_id: agentId,
          model_id: modelId,
          openrouter_tokens: openrouterTokens,
          charge: charge,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
        }),
      },
      config
    );
  } catch (err) {
    console.error('Failed to log agent usage:', err);
  }
}

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  // Замок чата. После передачи стриму его снимает сам стрим (в конце, при обрыве
  // клиента или ошибке); во всех остальных случаях — finally ниже.
  let chatLock: IChatLock | null = null;
  let lockOwnedByStream = false;

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

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

    const {
      historyMessages = [],
      currentTopic,
      userLang,
      attachedImage,
      attachedFile,
      agentId,
      chatId,
    } = body;

    if (!isValidChatId(chatId)) {
      return errorResponse('chatId is required', 400);
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
    let effectiveTopic: string = currentTopic || 'code';

    if (agentId) {
      agent = await getAgentById(agentId, config);
      if (agent) {
        effectiveAgentId = agentId;
        effectiveTopic = agent.slug;
        console.log(`✅ [stream] Агент найден по ID: ${agent.slug}`);
      }
    }

    if (!agent && currentTopic) {
      agent = await getAgentBySlug(currentTopic, config);
      if (agent) {
        effectiveAgentId = agent.id;
        effectiveTopic = agent.slug;
        console.log(`✅ [stream] Агент найден по slug: ${agent.slug}`);
      }
    }

    if (!agent) {
      agent = await getAgentBySlug('code', config);
      if (agent) {
        effectiveAgentId = agent.id;
        effectiveTopic = agent.slug;
        console.log(`✅ [stream] Используем дефолтного агента: ${agent.slug}`);
      } else {
        console.warn('⚠️ [stream] Агент не найден, используем fallback');
        return errorResponse('Агент не найден', 404);
      }
    }

    const userRes = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=role,subscription_tier`,
      { method: 'GET' },
      config
    );

    const userRole = (userRes && Array.isArray(userRes) && userRes.length > 0)
      ? userRes[0].role || 'trial'
      : 'trial';
    const userProTier = (userRes && Array.isArray(userRes) && userRes.length > 0)
      ? userRes[0].subscription_tier || null
      : null;

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

      if (userId !== MY_TELEGRAM_ID) {
        return errorResponse(
          '📸 Отправка изображений доступна только создателю приложения',
          403
        );
      }
    }

    let attachedFileBlock = '';
    if (attachedFile?.content) {
      if (userId !== MY_TELEGRAM_ID) {
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
            historyMessages.map(m => ({ role: 'user', content: m.text || '' })),
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

    // inject_balance
    let finalSystemPrompt = agent.system_prompt || buildSystemPrompt(currentTopic || 'code', userLang || 'ru', isVision);
    if (agent.inject_balance) {
      const balances = await supabaseRPC('get_user_balances', { p_user_id: userId }, config);
      const energy = balances?.tokens?.total ?? 0;
      finalSystemPrompt += `\n\n[SYSTEM]\nCurrent user energy balance: ${energy}\nThis number is the user's remaining energy. Strictly limit the maximum length of your response accordingly. Do not mention this system information to the user.\n`;
    }

    const systemPrompt = finalSystemPrompt + attachedFileBlock;
    const messages = buildMessages(systemPrompt, historyMessages, attachedImage || undefined);

    const model = agent.model_id || 'openai/gpt-4o';
    const temperature = 0.4;

    console.log('📨 [stream] Модель:', model);
    console.log('📨 [stream] Количество сообщений:', messages.length);

    const estimatedTokens = estimateTokens(messages, systemPrompt);
    console.log(`📊 [stream] Оценка токенов OpenRouter: ~${estimatedTokens}`);

    const openRouterCheck = await checkOpenRouterLimit(userId, estimatedTokens, config);
    if (!openRouterCheck.allowed) {
      return errorResponse(
        openRouterCheck.error || 'Превышен лимит токенов OpenRouter',
        429
      );
    }

    // Оценка списания заранее: входные токены + небольшой ответ по цене модели.
    // Если цену узнать не удалось — проверяем только min_charge.
    const minCharge = Math.max(1, Number(agent.min_charge) || 1);
    const safeMarkup = getMarkupForTier(agent, userProTier);
    const modelPrices = await getModelPrices(model, keysPool[0]);
    const promptUsd = modelPrices ? estimatedTokens * modelPrices.prompt : 0;
    const estimatedUsd = modelPrices ? promptUsd + MIN_EXPECTED_COMPLETION_TOKENS * modelPrices.completion : 0;
    const estimatedCharge = textEnergyForUsd(estimatedUsd, safeMarkup, minCharge);
    console.log(`💰 [stream] Оценка charge: $${estimatedUsd.toFixed(6)} × ${ENERGY_PER_USD} × ${safeMarkup} (tier=${userProTier || 'trial'}) → max(..., ${minCharge}) = ${estimatedCharge}`);

    const tokenCheck = await checkTokenAvailability(userId, estimatedCharge, config);

    if (!tokenCheck.available) {
      let userMessage = '';

      if (tokenCheck.reason === 'daily_limit') {
        userMessage =
          `⏳ Дневной лимит тарифа: не хватает на этот запрос.\n` +
          `Сегодня: ${tokenCheck.spent_today} / ${tokenCheck.daily_limit} ⚡.\n` +
          `Нужно ~${estimatedCharge} ⚡. Завтра лимит обновится.`;
      } else if (tokenCheck.total === 0 || tokenCheck.reason === 'no_tokens') {
        userMessage =
          `⚠️ Недостаточно энергии.\n` +
          `Доступно: 0 ⚡\n` +
          `Бонус обновится завтра или пополните баланс.`;
      } else {
        userMessage =
          `⚠️ Недостаточно энергии для агента «${agent.name?.ru || agent.slug}».\n` +
          `Требуется минимум: ${agent.min_charge} ⚡\n` +
          `Доступно: ${tokenCheck.total} ⚡ (${tokenCheck.bonus} бонусных + ${tokenCheck.permanent} постоянных)`;
      }

      return errorResponse(userMessage, 429, {
        'X-Token-Bonus': String(tokenCheck.bonus || 0),
        'X-Token-Permanent': String(tokenCheck.permanent || 0),
        'X-Token-Total': String(tokenCheck.total || 0),
        'X-Token-Needed': String(estimatedCharge),
        'X-Token-Reason': tokenCheck.reason || 'insufficient',
        'X-Daily-Spent': String(tokenCheck.spent_today || 0),
        'X-Daily-Limit': String(tokenCheck.daily_limit || 0),
      });
    }

    // Замок чата: до этой точки возвраты без замка, дальше он обязателен
    const acquired = await acquireChatLock(userId, chatId, 'text', config);
    if (!acquired.ok) {
      console.warn(`⚠️ [stream] Чат ${chatId} занят, повтор через ~${acquired.retryAfter}с`);
      return chatBusyResponse(acquired.retryAfter);
    }
    chatLock = acquired.lock;

    // Dynamic max_tokens (после успешной проверки)
    // Сколько выходных токенов можно оплатить энергией energy при цене модели
    function completionTokensFor(energy: number): number {
      if (!modelPrices || modelPrices.completion <= 0) return 999999;
      const usd = energy / (ENERGY_PER_USD * Math.max(safeMarkup, 0.1)) - promptUsd;
      return Math.max(0, Math.floor(usd / modelPrices.completion));
    }

    function calcMaxTokens(remainingEnergy: number, dailyLeft: number, contextLength: number | null, tier: string | null): number {
      const byEnergy = completionTokensFor(remainingEnergy * 0.7);
      const byDaily = dailyLeft > 0 ? completionTokensFor(dailyLeft) : 999999;
      const byContext = contextLength ? Math.floor(contextLength * 0.4) : 4096;
      const hardCapByTier: Record<string, number> = {
        trial: 1500,
        basic: 3000,
        plus: 4000,
        pro: 6000,
        ultra: 8000,
      };
      const hardCap = hardCapByTier[tier || 'trial'] ?? 4096;
      return Math.max(256, Math.min(byEnergy, byDaily, byContext, hardCap));
    }

    const dailyLeft = (tokenCheck.daily_limit || 0) > 0
      ? Math.max(0, (tokenCheck.daily_limit || 0) - (tokenCheck.spent_today || 0))
      : 0;

    const maxTokens = calcMaxTokens(
      tokenCheck.total || 0,
      dailyLeft,
      agent.context_length,
      userProTier
    );

    console.log(`📏 [stream] max_tokens = ${maxTokens}`);

    let lastError: Error | null = null;
    let finalUsage: any = null;
    let accumulatedText = '';
    let chunksReceived = 0;

    for (let k = 0; k < keysPool.length; k++) {
      const currentKey = keysPool[k];

      try {
        console.log(`📨 [stream] Пробуем ключ ROUTER_KEY${k}`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://vercel.com',
            'X-Title': 'Telegram Mini App FIBI Agent'
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: temperature,
            stream: true,
            stream_options: { include_usage: true },
            usage: { include: true },
            max_tokens: maxTokens
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error(`❌ OpenRouter ошибка ${response.status}:`, errorData.substring(0, 200));
          throw new Error(`OpenRouter API error ${response.status}: ${errorData.substring(0, 200)}`);
        }

        console.log('✅ [stream] OpenRouter ответил, начинаем стрим');

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamCompleted = false;
        let clientCancelled = false;
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalTokens = 0;
        let totalCostUsd: number | null = null;

        const readable = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  streamCompleted = true;
                  break;
                }

                chunksReceived++;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine.startsWith('data: ')) {
                    const jsonStr = trimmedLine.slice(6).trim();
                    if (jsonStr === '[DONE]') continue;

                    try {
                      const data = JSON.parse(jsonStr);
                      const content = data.choices?.[0]?.delta?.content;
                      if (content) {
                        accumulatedText += content;
                        controller.enqueue(new TextEncoder().encode(content));
                      }

                      if (data.usage) {
                        totalPromptTokens = data.usage.prompt_tokens || 0;
                        totalCompletionTokens = data.usage.completion_tokens || 0;
                        totalTokens = data.usage.total_tokens || 0;
                        const cost = Number(data.usage.cost);
                        if (Number.isFinite(cost) && cost >= 0) totalCostUsd = cost;
                        finalUsage = data.usage;
                      }
                    } catch (e) {
                      // Игнорируем ошибки парсинга
                    }
                  }
                }
              }

              if (clientCancelled) {
                console.warn(`⚠️ [stream] Клиент оборвал соединение (списание — в cancel()).`);
              } else if (streamCompleted && accumulatedText.trim().length > 0) {
                console.log(`📊 [stream] Стрим завершен успешно (${chunksReceived} чанков, ${accumulatedText.length} символов)`);
                console.log(`📊 [stream] OpenRouter usage:`, finalUsage);

                // Факт — usage.cost. Нет его (BYOK, сбой usage) — считаем по токенам и цене модели,
                // иначе — оценка до запроса.
                let usd: number;
                let usdSource: string;
                if (totalCostUsd !== null && totalCostUsd > 0) {
                  usd = totalCostUsd;
                  usdSource = 'usage.cost';
                } else if (modelPrices && totalTokens > 0) {
                  usd = totalPromptTokens * modelPrices.prompt + totalCompletionTokens * modelPrices.completion;
                  usdSource = 'tokens×price';
                } else {
                  usd = estimatedUsd;
                  usdSource = 'estimate';
                }
                const charge = textEnergyForUsd(usd, safeMarkup, minCharge);

                console.log(`💰 [stream] Расчёт charge (${usdSource}): $${usd.toFixed(6)} × ${ENERGY_PER_USD} × ${safeMarkup} (tier=${userProTier || 'trial'}) → max(..., ${minCharge}) = ${charge}`);

                if (!Number.isFinite(charge) || charge <= 0) {
                  console.warn('⚠️ [stream] charge невалиден, skip spend', { charge, usd });
                } else {
                  const spendResult = await spendTokens(userId, charge, config);

                  if (spendResult.success) {
                    console.log(`✅ [stream] Списан ${charge} токенов: bonus=${spendResult.bonusUsed}, permanent=${spendResult.permanentUsed}`);
                    console.log(`📊 [stream] Осталось: bonus=${spendResult.remainingBonus}, permanent=${spendResult.remainingPermanent}`);
                  } else {
                    console.warn(`⚠️ [stream] Не удалось списать токены: ${spendResult.error}`);
                    // Ответ уже отдан; клиенту в headers если возможно
                  }
                }

                if (totalTokens > 0) {
                  await logOpenRouterUsage(
                    userId,
                    {
                      prompt_tokens: totalPromptTokens,
                      completion_tokens: totalCompletionTokens,
                      total_tokens: totalTokens,
                      model: model,
                      topic: effectiveTopic,
                      user_lang: userLang || 'ru',
                    },
                    config
                  );
                  console.log(`✅ [stream] OpenRouter usage сохранен: ${totalTokens} токенов`);
                }

                if (effectiveAgentId && totalTokens > 0) {
                  await logAgentUsage(
                    userId,
                    effectiveAgentId,
                    model,
                    totalTokens,
                    charge,
                    totalPromptTokens,
                    totalCompletionTokens,
                    config
                  );
                  console.log(`✅ [stream] Agent usage залогирован: agent=${effectiveAgentId}, charge=${charge}`);
                }
              } else if (streamCompleted && accumulatedText.trim().length === 0) {
                console.warn(`⚠️ [stream] Стрим завершен, но ответ пустой. Токены не списаны.`);
              }

              if (!clientCancelled) controller.close();
            } catch (err) {
              console.error('❌ Ошибка в стриме:', err);
              console.warn(`⚠️ [stream] Стрим прерван ошибкой. Токены не списаны.`);
              controller.error(err);
            } finally {
              // Замок снимается после списания энергии: следующий запрос
              // в этот чат не обгонит текущее списание
              await chatLock?.release();
            }
          },
          async cancel() {
            // Клиент ушёл (закрыл приложение / прервал запрос): не ждём конца
            // ответа модели. Отданная часть ответа уже оплачена нами в OpenRouter,
            // поэтому списываем за неё (иначе обрыв в конце = бесплатный ответ)
            clientCancelled = true;
            try {
              await reader.cancel();
            } catch {
              // уже закрыт
            }
            try {
              if (accumulatedText.trim().length > 0) {
                const outTokens = estimateTokens([{ role: 'assistant', content: accumulatedText }]);
                const usd = modelPrices
                  ? promptUsd + outTokens * modelPrices.completion
                  : estimatedUsd;
                const charge = textEnergyForUsd(usd, safeMarkup, minCharge);
                if (Number.isFinite(charge) && charge > 0) {
                  const spend = await spendTokens(userId, charge, config, 'Запрос к агенту (прерван)');
                  console.log(`💰 [stream] Обрыв клиентом: списано по отданному тексту ${charge} (${spend.success ? 'ok' : spend.error})`);
                }
              }
            } catch (err) {
              console.error('❌ [stream] Ошибка списания при обрыве:', err);
            }
            await chatLock?.release();
          }
        });

        const responseHeaders = {
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Agent-Slug': agent.slug,
          ...corsHeaders
        };

        lockOwnedByStream = true;

        return new Response(readable, {
          headers: responseHeaders
        });
      } catch (err) {
        console.error(`Сбой запроса с ключом ROUTER_KEY${k}:`, (err as Error).message);
        lastError = err as Error;
        continue;
      }
    }

    return errorResponse(
      `Все доступные API-ключи перегружены или неактивны. Последний сбой: ${lastError?.message || 'Неизвестная ошибка'}`,
      500
    );
  } catch (err) {
    console.error('Stream handler error:', (err as Error).message);
    return errorResponse(`Критическое исключение сервера: ${(err as Error).message}`, 500);
  } finally {
    if (chatLock && !lockOwnedByStream) await chatLock.release();
  }
}
