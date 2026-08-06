// ============================================
// api/chat/stream.ts
// Описание: Стриминг ответов от ИИ
// Версия: 3.2.0 - FIXED
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  errorResponse,
  getSupabaseConfig,
  checkUsageLimit,
  incrementUsage,
  validateImageSize
} from '../_lib/index';

import { getModelConfig, getRotatedKeysPool } from '../chats/index';
import { buildSystemPrompt, buildMessages } from './prompts';

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

    console.log('📨 [stream.js] Тема:', currentTopic);
    console.log('📨 [stream.js] Есть фото:', !!attachedImage);
    console.log('📨 [stream.js] История:', historyMessages.length);

    // ==========================================
    // ПРОВЕРКА ЛИМИТОВ
    // ==========================================
    const limitCheck = await checkUsageLimit(userId, config);
    if (!limitCheck.allowed) {
      return errorResponse(
        `Ежедневный лимит запросов исчерпан (${limitCheck.used}/${limitCheck.limit})`,
        429
      );
    }

    // ==========================================
    // ВАЛИДАЦИЯ ИЗОБРАЖЕНИЯ
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

      // Только создатель может отправлять изображения
      if (userId !== MY_TELEGRAM_ID) {
        return errorResponse(
          '📸 Отправка изображений доступна только создателю приложения',
          403
        );
      }
    }

    // ==========================================
    // ПРОВЕРКА КЛЮЧЕЙ
    // ==========================================
    const keysPool = getRotatedKeysPool();
    if (keysPool.length === 0) {
      return errorResponse('Серверные API ключи ROUTER_KEY не настроены в Vercel.', 500);
    }

    // ==========================================
    // СБОРКА СООБЩЕНИЙ
    // ==========================================
    const systemPrompt = buildSystemPrompt(currentTopic || 'code', userLang || 'ru', isVision);
    const messages = buildMessages(systemPrompt, historyMessages, attachedImage || undefined);

    // Получаем конфигурацию модели
    const modelConfig = getModelConfig(currentTopic || 'code', isVision);

    console.log('📨 [stream.js] Модель:', modelConfig.model);
    console.log('📨 [stream.js] Количество сообщений:', messages.length);

    // ==========================================
    // ОТПРАВКА ЗАПРОСА С РОТАЦИЕЙ КЛЮЧЕЙ
    // ==========================================
    let lastError: Error | null = null;

    for (let k = 0; k < keysPool.length; k++) {
      const currentKey = keysPool[k];

      try {
        console.log(`📨 [stream.js] Пробуем ключ ROUTER_KEY${k}`);

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

        console.log('✅ [stream.js] OpenRouter ответил, начинаем стрим');

        // Инкрементируем счетчик использований
        await incrementUsage(userId, config);

        // ==========================================
        // ПАРСИНГ SSE СТРИМА
        // ==========================================
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const readable = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

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
                        controller.enqueue(new TextEncoder().encode(content));
                      }
                    } catch (e) {
                      // Игнорируем
                    }
                  }
                }
              }
              controller.close();
            } catch (err) {
              console.error('❌ Ошибка в стриме:', err);
              controller.error(err);
            }
          }
        });

        // Убираем дублирующийся Content-Type
        const responseHeaders = {
          'X-Accel-Buffering': 'no',
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/plain; charset=utf-8',
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
