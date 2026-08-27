// ============================================
// api/chat/stream.ts
// Стриминг ответов от ИИ с учетом токенов
// Версия: 4.0.0 - добавлены токены
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  errorResponse,
  getSupabaseConfig,
  checkUsageLimit,
  incrementUsage,
  validateImageSize,
} from '../_lib/index';

import { getModelConfig, getRotatedKeysPool } from '../chats/index';
import { buildSystemPrompt, buildMessages } from './prompts';
import {
  checkTokenAvailability,
  spendTokenForRequest,
  getEconomyConfig,
} from '../_lib/tokens';
import {
  checkOpenRouterLimit,
  logOpenRouterUsage,
  estimateTokens,
} from '../_lib/tokens-usage';

export const config = { runtime: 'edge' };

const MY_TELEGRAM_ID = 1541531808;

interface IStreamRequestBody {
  historyMessages?: Array<{ type: string; text: string; role?: string }>;
  currentTopic?: string;
  userLang?: string;
  attachedImage?: string | null;
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

    const { historyMessages = [], currentTopic, userLang, attachedImage } = body;

    console.log('📨 [stream] Тема:', currentTopic);
    console.log('📨 [stream] Есть фото:', !!attachedImage);
    console.log('📨 [stream] История:', historyMessages.length);

    // ==========================================
    // 1. ПРОВЕРКА ЛИМИТОВ (существующая)
    // ==========================================
    const limitCheck = await checkUsageLimit(userId, config);
    if (!limitCheck.allowed) {
      return errorResponse(
        `Ежедневный лимит запросов исчерпан (${limitCheck.used}/${limitCheck.limit})`,
        429
      );
    }

    // ==========================================
    // 2. ПРОВЕРКА ТОКЕНОВ (НОВОЕ!)
    // ==========================================
    const tokenCheck = await checkTokenAvailability(userId, 1, config);
    if (!tokenCheck.available) {
      const messages: Record<string, string> = {
        'no_bonus_tokens': '⚠️ Бонусные токены закончились. Используйте постоянные токены.',
        'no_tokens': '⚠️ У вас нет токенов. Получите их через обмен коинов или подписку.',
        'insufficient_total': '⚠️ Недостаточно токенов для запроса.',
      };
      return errorResponse(
        messages[tokenCheck.reason || 'no_tokens'] || 'Недостаточно токенов',
        429
      );
    }

    // ==========================================
    // 3. ВАЛИДАЦИЯ ИЗОБРАЖЕНИЯ (существующая)
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
    // 4. ПРОВЕРКА КЛЮЧЕЙ (существующая)
    // ==========================================
    const keysPool = getRotatedKeysPool();
    if (keysPool.length === 0) {
      return errorResponse('Серверные API ключи ROUTER_KEY не настроены в Vercel.', 500);
    }

    // ==========================================
    // 5. СБОРКА СООБЩЕНИЙ (существующая)
    // ==========================================
    const systemPrompt = buildSystemPrompt(currentTopic || 'code', userLang || 'ru', isVision);
    const messages = buildMessages(systemPrompt, historyMessages, attachedImage || undefined);

    const modelConfig = getModelConfig(currentTopic || 'code', isVision);

    console.log('📨 [stream] Модель:', modelConfig.model);
    console.log('📨 [stream] Количество сообщений:', messages.length);

    // ==========================================
    // 6. ОЦЕНКА ТОКЕНОВ ДЛЯ OPENROUTER (НОВОЕ!)
    // ==========================================
    const estimatedTokens = estimateTokens(messages, systemPrompt);
    console.log(`📊 [stream] Оценка токенов OpenRouter: ~${estimatedTokens}`);

    // Проверяем лимит OpenRouter
    const openRouterCheck = await checkOpenRouterLimit(userId, estimatedTokens, config);
    if (!openRouterCheck.allowed) {
      return errorResponse(
        openRouterCheck.error || 'Превышен лимит токенов OpenRouter',
        429
      );
    }

    // ==========================================
    // 7. ОТПРАВКА ЗАПРОСА (существующая, с добавлением логов)
    // ==========================================
    let lastError: Error | null = null;

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
            'X-Title': 'Telegram Mini App Versatile AI'
          },
          body: JSON.stringify({
            model: modelConfig.model,
            messages: messages,
            temperature: modelConfig.temperature || 0.4,
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
        // 8. ПАРСИНГ SSE СТРИМА С ОТЛОЖЕННЫМ ИНКРЕМЕНТОМ
        // ==========================================
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';
        let streamCompleted = false;
        let chunksReceived = 0;
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
                      
                      // ✅ Сохраняем usage если есть
                      if (data.usage) {
                        totalPromptTokens = data.usage.prompt_tokens || 0;
                        totalCompletionTokens = data.usage.completion_tokens || 0;
                        totalTokens = data.usage.total_tokens || 0;
                      }
                    } catch (e) {
                      // Игнорируем ошибки парсинга отдельных чанков
                    }
                  }
                }
              }

              // ==========================================
              // 9. ФИНАЛИЗАЦИЯ (списание токенов и логирование)
              // ==========================================
              if (streamCompleted && accumulatedText.trim().length > 0) {
                console.log(`📊 [stream] Стрим завершен успешно (${chunksReceived} чанков, ${accumulatedText.length} символов)`);
                
                // ✅ Инкрементируем usage (существующая логика)
                await incrementUsage(userId, config);
                console.log(`✅ [stream] Инкремент выполнен: +1 к used_today`);

                // ✅ СПИСЫВАЕМ ТОКЕН ЗА ЗАПРОС (НОВОЕ!)
                const spendResult = await spendTokenForRequest(userId, config);
                if (spendResult.success) {
                  console.log(`✅ [stream] Токен списан: bonus=${spendResult.bonus_after}, permanent=${spendResult.permanent_after}`);
                } else {
                  console.warn(`⚠️ [stream] Не удалось списать токен: ${spendResult.error}`);
                }

                // ✅ ЛОГИРУЕМ ИСПОЛЬЗОВАНИЕ OPENROUTER (НОВОЕ!)
                if (totalTokens > 0) {
                  await logOpenRouterUsage(
                    userId,
                    {
                      prompt_tokens: totalPromptTokens,
                      completion_tokens: totalCompletionTokens,
                      total_tokens: totalTokens,
                      model: modelConfig.model,
                      topic: currentTopic || 'code',
                      user_lang: userLang || 'ru',
                    },
                    config
                  );
                  console.log(`✅ [stream] OpenRouter usage сохранен: ${totalTokens} токенов`);
                }
              } else if (streamCompleted && accumulatedText.trim().length === 0) {
                console.warn(`⚠️ [stream] Стрим завершен, но ответ пустой. Инкремент НЕ выполнен.`);
              }

              controller.close();
            } catch (err) {
              console.error('❌ Ошибка в стриме:', err);
              
              // ⚠️ ПРИ ОШИБКЕ ИНКРЕМЕНТ НЕ ВЫПОЛНЯЕТСЯ
              console.warn(`⚠️ [stream] Стрим прерван ошибкой. Инкремент НЕ выполнен.`);
              
              controller.error(err);
            }
          }
        });

        const responseHeaders = {
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/plain; charset=utf-8',
          // ✅ Отправляем остаток токенов (НОВОЕ!)
          'X-Token-Remaining': String(tokenCheck.total - 1),
          'X-Token-Bonus': String(tokenCheck.bonus - (tokenCheck.bonus > 0 ? 1 : 0)),
          'X-Token-Permanent': String(tokenCheck.permanent - (tokenCheck.bonus === 0 ? 1 : 0)),
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
