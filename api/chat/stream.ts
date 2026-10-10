// ============================================
// api/chat/stream.ts
// Описание: Стриминг ответов от ИИ (с поддержкой агентов)
// Версия: 3.0.0 — daily_limit messages + spend RPC v2
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

export const config = { runtime: 'edge' };

const MY_TELEGRAM_ID = 1541531808;

interface IStreamRequestBody {
  historyMessages?: Array<{ type: string; text: string; role?: string }>;
  currentTopic?: string;
  userLang?: string;
  attachedImage?: string | null;
  attachedFile?: { name: string; content: string } | null;
  agentId?: string | null;
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
  config: any
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
        p_description: 'Запрос к агенту',
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

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

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
    } = body;

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

    // Оценка списания заранее (не только min_charge)
    const minCharge = Math.max(1, Number(agent.min_charge) || 1);
    const safeMarkup = getMarkupForTier(agent, userProTier);
    const estimatedCharge = Math.max(
      Math.ceil(estimatedTokens * safeMarkup),
      minCharge
    );
    console.log(`💰 [stream] Оценка charge: ~${estimatedTokens} × ${safeMarkup} (tier=${userProTier || 'trial'}) → max(..., ${minCharge}) = ${estimatedCharge}`);

    const tokenCheck = await checkTokenAvailability(userId, estimatedCharge, config);
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
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalTokens = 0;

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
                        finalUsage = data.usage;
                      }
                    } catch (e) {
                      // Игнорируем ошибки парсинга
                    }
                  }
                }
              }

              if (streamCompleted && accumulatedText.trim().length > 0) {
                console.log(`📊 [stream] Стрим завершен успешно (${chunksReceived} чанков, ${accumulatedText.length} символов)`);
                console.log(`📊 [stream] OpenRouter usage:`, finalUsage);

                const actualTokens = totalTokens > 0 ? totalTokens : estimatedTokens;
                const charge = Math.max(
                  Math.ceil(actualTokens * safeMarkup),
                  minCharge
                );

                console.log(`💰 [stream] Расчёт charge: ${actualTokens} × ${safeMarkup} (tier=${userProTier || 'trial'}) → max(..., ${minCharge}) = ${charge}`);

                if (!Number.isFinite(charge) || charge <= 0) {
                  console.warn('⚠️ [stream] charge невалиден, skip spend', { charge, actualTokens });
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

              controller.close();
            } catch (err) {
              console.error('❌ Ошибка в стриме:', err);
              console.warn(`⚠️ [stream] Стрим прерван ошибкой. Токены не списаны.`);
              controller.error(err);
            }
          }
        });

        const responseHeaders = {
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Agent-Slug': agent.slug,
          ...corsHeaders
        };

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
  }
}
