// ============================================
// api/chat/whisper.ts
// Описание: Распознавание голоса через Whisper
// Версия: 3.2.0 - FIXED
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  validateAudioSize
} from '../_lib/index';

import { getRotatedKeysPool } from '../chats/index';

export const config = { runtime: 'edge' };

/**
 * Конвертировать ArrayBuffer в Base64
 */
function bufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunk = 65535;

  // Используем Array.from для корректной работы
  for (let i = 0; i < len; i += chunk) {
    const chunkBytes = bytes.subarray(i, Math.min(i + chunk, len));
    binary += String.fromCharCode.apply(null, Array.from(chunkBytes));
  }

  return btoa(binary);
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

    // Получаем аудиоданные
    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return errorResponse('Аудиоданные пустые.', 400);
    }

    // Проверяем размер
    const audioValidation = validateAudioSize(arrayBuffer, 5);
    if (!audioValidation.valid) {
      return errorResponse(
        `Аудиофайл слишком большой (${audioValidation.sizeInMB}MB). Максимум 5MB.`,
        413
      );
    }

    // Проверяем ключи
    const keysPool = getRotatedKeysPool();
    if (keysPool.length === 0) {
      return errorResponse('Серверные API ключи ROUTER_KEY не настроены в Vercel.', 500);
    }

    const base64Audio = bufferToBase64(arrayBuffer);

    const requestBody = {
      model: 'openai/whisper-large-v3-turbo',
      input_audio: {
        data: base64Audio,
        format: 'wav'
      }
    };

    let lastError: Error | null = null;

    for (let k = 0; k < keysPool.length; k++) {
      const currentKey = keysPool[k];

      try {
        const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://vercel.com',
            'X-Title': 'Telegram Mini App Versatile AI STT'
          },
          body: JSON.stringify(requestBody)
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const htmlErrorText = await response.text();
          throw new Error(`Сервер OpenRouter вернул HTML ошибку: ${htmlErrorText.substring(0, 80)}`);
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || JSON.stringify(data.error) || response.statusText);
        }

        return jsonResponse({
          text: data.text || ''
        }, 200, {
          'Cache-Control': 'no-store'
        });
      } catch (err) {
        console.error(`Сбой расшифровки Whisper с ключом ROUTER_KEY${k}:`, (err as Error).message);
        lastError = err as Error;
        continue;
      }
    }

    return errorResponse(
      `Модуль аудио перегружен. Детали: ${lastError?.message || 'Все ключи пула отклонены'}`,
      500
    );
  } catch (err) {
    console.error('Whisper handler error:', (err as Error).message);
    return errorResponse(`Edge Runtime Audio Exception: ${(err as Error).message}`, 500);
  }
}
