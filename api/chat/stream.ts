// ============================================
// api/chat/stream.ts
// Описание: Стриминг ответов от ИИ (с поддержкой агентов)
// Версия: 6.0.0 — интеграция агентов + биллинг
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
  spendTokenForRequest,
} from '../_lib/tokens';
import {
  checkOpenRouterLimit,
  logOpenRouterUsage,
  estimateTokens,
} from '../_lib/tokens-usage';
import { getSupabaseConfig as getSupabase, supabaseFetch, supabaseRPC } from '../_lib/supabase-client';

export const config = { runtime: 'edge' };

const MY_TELEGRAM_ID = 1541531808;

interface IStreamRequestBody {
  historyMessages?: Array<{ type: string; text: string; role?: string }>;
  currentTopic?: string;
  userLang?: string;
  attachedImage?: string | null;
  agentId?: string | null; // ✅ НОВОЕ: ID агента
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
  is_active: boolean;
}

/**
 * Проверка доступа к агенту
 */
function checkAgentAccess(
  agent: IAgent,
  userRole: string,
  userProTier: string | null
): { hasAccess: boolean; reason: 'role' | 'tier' | 'inactive' | null } {
  if (!agent.is_active) {
    return { hasAccess: false, reason: 'inactive' };
  }

  const allowed = agent.allowed_roles || [];
  if (!allowed.includes(userRole)) {
    return { hasAccess: false, reason: 'role' };
  }

  if (userRole === 'pro' && agent.min_pro_tier) {
    const tierOrder: Record<string, number> = {
      basic: 1,
      plus: 2,
      ultra: 3,
    };

    const userTierLevel = tierOrder[userProTier || 'basic'] || 0;
    const requiredLevel = tierOrder[agent.min_pro_tier] || 0;

    if (userTierLevel < requiredLevel) {
      return { hasAccess: false, reason: 'tier' };
    }
  }

  return { hasAccess: true, reason: null };
}

/**
 * Получить агента по ID
 */
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

/**
 * Получить агента по slug (для обратной совместимости с топиками)
 */
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

/**
 * Списать абстрактные токены (сначала bonus, потом permanent)
 */
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
  error?: string;
}> {
  try {
    const result = await supabaseRPC(
      'spend_abstract_tokens',
      {
        p_user_id: userId,
        p_amount: amount,
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
        error: result.error || 'Failed to spend tokens',
      };
    }

    return {
      success: true,
      bonusUsed: result.bonus_used || 0,
      permanentUsed: result.permanent_used || 0,
      remainingBonus: result.remaining_bonus || 0,
      remainingPermanent: result.remaining_permanent || 0,
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

/**
 * Логировать использование агента
 */
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
      agentId,
    } = body;

    console.log('📨 [stream] Запрос:', {
      userId,
      agentId,
      currentTopic,
      hasImage: !!attachedImage,
      historyLength: historyMessages.length,
    });

    // ==========================================
    // 1. ОПРЕДЕЛЯЕМ АГЕНТА
    // ==========================================

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

    // Если агент не найден по ID — пробуем по slug (обратная совместимость)
    if (!agent && currentTopic) {
      agent = await getAgentBySlug(currentTopic, config);
      if (agent) {
        effectiveAgentId = agent.id;
        effectiveTopic = agent.slug;
        console.log(`✅ [stream] Агент найден по slug: ${agent.slug}`);
      }
    }

    // Если агент не найден — используем дефолтный (code)
    if (!agent) {
      agent = await getAgentBySlug('code', config);
      if (agent) {
        effectiveAgentId = agent.id;
        effectiveTopic = agent.slug;
        console.log(`✅ [stream] Используем дефолтного агента: ${agent.slug}`);
      } else {
        console.warn('⚠️ [stream] Агент не найден, используем fallback');
        // Fallback для обратной совместимости
        return errorResponse('Агент не найден', 404);
      }
    }

    // ==========================================
    // 2. ПРОВЕРКА ДОСТУПА К АГЕНТУ
    // ==========================================

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

    // ==========================================
    // 3. ВАЛИДАЦИЯ ИЗОБРАЖЕНИЯ
    // ==========================================

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

    // ==========================================
    // 4. ПРОВЕРКА КЛЮЧЕЙ OPENROUTER
    // ==========================================

    const keysPool = getRotatedKeysPool();
    if (keysPool.length === 0) {
      return errorResponse('Серверные API ключи ROUTER_KEY не настроены в Vercel.', 500);
    }

    // ==========================================
    // 5. СБОРКА СООБЩЕНИЙ
    // ==========================================

    // Используем system_prompt из агента
    const systemPrompt = agent.system_prompt || buildSystemPrompt(currentTopic || 'code', userLang || 'ru', isVision);
    const messages = buildMessages(systemPrompt, historyMessages, attachedImage || undefined);

    const model = agent.model_id || 'openai/gpt-4o';
    const temperature = 0.4; // Можно добавить поле в агента

    console.log('📨 [stream] Модель:', model);
    console.log('📨 [stream] Количество сообщений:', messages.length);

    // ==========================================
    // 6. ОЦЕНКА ТОКЕНОВ ДЛЯ OPENROUTER
    // ==========================================

    const estimatedTokens = estimateTokens(messages, systemPrompt);
    console.log(`📊 [stream] Оценка токенов OpenRouter: ~${estimatedTokens}`);

    const openRouterCheck = await checkOpenRouterLimit(userId, estimatedTokens, config);
    if (!openRouterCheck.allowed) {
      return errorResponse(
        openRouterCheck.error || 'Превышен лимит токенов OpenRouter',
        429
      );
    }

    // ==========================================
    // 7. ПРОВЕРКА АБСТРАКТНЫХ ТОКЕНОВ (min_charge)
    // ==========================================

    const tokenCheck = await checkTokenAvailability(userId, agent.min_charge, config);

    if (!tokenCheck.available) {
      let userMessage = `⚠️ Недостаточно токенов для использования агента "${agent.name?.ru || agent.slug}".\n`;
      userMessage += `Требуется минимум: ${agent.min_charge} ⚡\n`;
      userMessage += `Доступно: ${tokenCheck.total} ⚡ (${tokenCheck.bonus} бонусных, ${tokenCheck.permanent} постоянных)`;

      return errorResponse(userMessage, 429, {
        'X-Token-Bonus': String(tokenCheck.bonus || 0),
        'X-Token-Permanent': String(tokenCheck.permanent || 0),
        'X-Token-Total': String(tokenCheck.total || 0),
        'X-Token-Needed': String(agent.min_charge),
      });
    }

    // ==========================================
    // 8. ОТПРАВКА ЗАПРОСА
    // ==========================================

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
            max_tokens: 4096
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error(`❌ OpenRouter ошибка ${response.status}:`, errorData.substring(0, 200));
          throw new Error(`OpenRouter API error ${response.status}: ${errorData.substring(0, 200)}`);
        }

        console.log('✅ [stream] OpenRouter ответил, начинаем стрим');

        // ==========================================
        // 9. ПАРСИНГ SSE СТРИМА
        // ==========================================

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

              // ==========================================
              // 10. ФИНАЛИЗАЦИЯ (списание токенов!)
              // ==========================================

              if (streamCompleted && accumulatedText.trim().length > 0) {
                console.log(`📊 [stream] Стрим завершен успешно (${chunksReceived} чанков, ${accumulatedText.length} символов)`);
                console.log(`📊 [stream] OpenRouter usage:`, finalUsage);

                // ✅ РАССЧИТЫВАЕМ CHARGE
                const actualTokens = totalTokens > 0 ? totalTokens : estimatedTokens;
                const charge = Math.max(
                  Math.ceil(actualTokens * agent.markup_coefficient),
                  agent.min_charge
                );

                console.log(`💰 [stream] Расчёт charge: ${actualTokens} × ${agent.markup_coefficient} = ${Math.ceil(actualTokens * agent.markup_coefficient)} → max(..., ${agent.min_charge}) = ${charge}`);

                // ✅ СПИСЫВАЕМ АБСТРАКТНЫЕ ТОКЕНЫ
                const spendResult = await spendTokens(userId, charge, config);

                if (spendResult.success) {
                  console.log(`✅ [stream] Списан ${charge} токенов: bonus=${spendResult.bonusUsed}, permanent=${spendResult.permanentUsed}`);
                  console.log(`📊 [stream] Осталось: bonus=${spendResult.remainingBonus}, permanent=${spendResult.remainingPermanent}`);
                } else {
                  console.warn(`⚠️ [stream] Не удалось списать токены: ${spendResult.error}`);
                }

                // ✅ ЛОГИРУЕМ ИСПОЛЬЗОВАНИЕ OPENROUTER
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

                // ✅ ЛОГИРУЕМ ИСПОЛЬЗОВАНИЕ АГЕНТА
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
