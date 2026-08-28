// ============================================
// api/chat/stream.ts
// Описание: Стриминг ответов от ИИ (с проверкой токенов)
// Версия: 5.0.0 — проверка токенов вместо лимитов
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
    // 1. ✅ ПРОВЕРКА ТОКЕНОВ (вместо checkUsageLimit)
    // ==========================================
    const tokenCheck = await checkTokenAvailability(userId, 1, config);
    
    if (!tokenCheck.available) {
      // Формируем понятное сообщение для пользователя
      let userMessage = '';
      
      if (tokenCheck.bonus === 0 && tokenCheck.permanent === 0) {
        userMessage = '⚠️ У вас нет токенов. Получите их через:\n' +
          '• Ежедневный вход (бонусные токены)\n' +
          '• Обмен коинов на токены\n' +
          '• Оформление подписки (постоянные токены)';
      } else if (tokenCheck.bonus === 0 && tokenCheck.permanent > 0) {
        userMessage = `⚠️ Бонусные токены закончились. Используются постоянные токены (${tokenCheck.permanent} ⚡).`;
      } else if (tokenCheck.bonus > 0 && tokenCheck.permanent === 0) {
        userMessage = `⚠️ У вас есть только бонусные токены (${tokenCheck.bonus} ⚡). Они сгорят в конце дня.`;
      } else {
        userMessage = `⚠️ Недостаточно токенов для запроса. Доступно: ${tokenCheck.total} ⚡ (${tokenCheck.bonus} бонусных, ${tokenCheck.permanent} постоянных)`;
      }

      // Добавляем подсказку в ответ
      return errorResponse(userMessage, 429, {
        'X-Token-Bonus': String(tokenCheck.bonus || 0),
        'X-Token-Permanent': String(tokenCheck.permanent || 0),
        'X-Token-Total': String(tokenCheck.total || 0),
      });
    }

    // ==========================================
    // 2. ВАЛИДАЦИЯ ИЗОБРАЖЕНИЯ
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
    // 3. ПРОВЕРКА КЛЮЧЕЙ
    // ==========================================
    const keysPool = getRotatedKeysPool();
    if (keysPool.length === 0) {
      return errorResponse('Серверные API ключи ROUTER_KEY не настроены в Vercel.', 500);
    }

    // ==========================================
    // 4. СБОРКА СООБЩЕНИЙ
    // ==========================================
    const systemPrompt = buildSystemPrompt(currentTopic || 'code', userLang || 'ru', isVision);
    const messages = buildMessages(systemPrompt, historyMessages, attachedImage || undefined);

    const modelConfig = getModelConfig(currentTopic || 'code', isVision);

    console.log('📨 [stream] Модель:', modelConfig.model);
    console.log('📨 [stream] Количество сообщений:', messages.length);

    // ==========================================
    // 5. ОЦЕНКА ТОКЕНОВ ДЛЯ OPENROUTER
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
    // 6. ОТПРАВКА ЗАПРОСА
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
        // 7. ПАРСИНГ SSE СТРИМА
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
                      
                      // Сохраняем usage если есть
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
              // 8. ФИНАЛИЗАЦИЯ
              // ==========================================
              if (streamCompleted && accumulatedText.trim().length > 0) {
                console.log(`📊 [stream] Стрим завершен успешно (${chunksReceived} чанков, ${accumulatedText.length} символов)`);
                
                // ✅ СПИСЫВАЕМ ТОКЕН ЗА ЗАПРОС
                const spendResult = await spendTokenForRequest(userId, config);
                if (spendResult.success) {
                  console.log(`✅ [stream] Токен списан: bonus=${spendResult.bonus_after}, permanent=${spendResult.permanent_after}`);
                } else {
                  console.warn(`⚠️ [stream] Не удалось списать токен: ${spendResult.error}`);
                }

                // ✅ ЛОГИРУЕМ ИСПОЛЬЗОВАНИЕ OPENROUTER
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
                console.warn(`⚠️ [stream] Стрим завершен, но ответ пустой. Токен не списан.`);
              }

              controller.close();
            } catch (err) {
              console.error('❌ Ошибка в стриме:', err);
              console.warn(`⚠️ [stream] Стрим прерван ошибкой. Токен не списан.`);
              controller.error(err);
            }
          }
        });

        // ==========================================
        // 9. ОТВЕТ С ЗАГОЛОВКАМИ
        // ==========================================
        const responseHeaders = {
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/plain; charset=utf-8',
          // ✅ Отправляем остаток токенов
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
