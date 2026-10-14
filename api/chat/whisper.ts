// ============================================
// api/chat/whisper.ts
// Описание: Распознавание голоса (OpenRouter /audio/transcriptions)
// Версия: 5.2.0 — финансы: энергия резервируется до запроса (reserve_energy, kind 'voice'),
//                  коэффициент и минимум — из настроек экономики (были зашиты 1 и 1),
//                  курс ⚡ за $1 — общий; расход пишется в журнал ai_usage
//          5.1.0 — лимит частоты (whisper)
//          5.0.0 — формат аудио определяется по содержимому файла (раньше всегда «wav»,
//                  а браузеры пишут webm/ogg/mp4 — распознавание падало); блокировка
//                  пользователя; распознавание платное: проверка баланса до запроса,
//                  списание по usage.cost после; лимит 2 МБ; создатель — из CREATOR_ID
//          4.0.0 — без request-quota
// ============================================

import {
  authenticate,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseRPC,
} from '../_lib/index';
import { getRotatedKeysPool } from '../chats/index';
import { energyForUsd, getEnergyRates } from '../_lib/energy-pricing';
import type { IEnergyRates, IUsageRecord } from '../_lib/energy-pricing';
import { releaseEnergy, reserveEnergy, settleEnergy } from '../_lib/energy-hold';
import { enforceRateLimit } from '../_lib/rate-limit';

export const config = { runtime: 'edge' };

const STT_MODEL = 'openai/whisper-large-v3-turbo';
/** Запись в приложении — до 15 с; 2 МБ хватает с запасом даже для wav */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** Резерв до запроса: себестоимость записи 15 с с большим запасом */
const VOICE_RESERVE_USD = 0.005;
/** Заморозка живёт дольше запроса (таймаут 25 с на ключ) */
const VOICE_HOLD_TTL_SEC = 120;

/** Формат аудио по первым байтам файла (заголовку X-Audio-Type не доверяем) */
function detectAudioFormat(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf.slice(0, 16));
  const ascii = (from: number, len: number) => String.fromCharCode(...b.slice(from, from + len));
  if (b.length < 12) return null;
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(4, 4) === 'ftyp') return 'm4a';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac'; // ADTS
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3'; // MPEG frame sync
  return null;
}

function bufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
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

    const userId = auth.userId!;

    const limited = await enforceRateLimit('whisper', userId);
    if (limited) return limited;
    const db = getSupabaseConfig('service');

    const blocked = await supabaseRPC('is_user_blocked', { p_user_id: userId }, db).catch(() => false);
    if (blocked === true) {
      return errorResponse('⛔ Доступ к приложению ограничен администратором.', 403);
    }

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_AUDIO_BYTES) {
      return errorResponse('Запись слишком длинная. Максимум — 15 секунд.', 413);
    }

    const audio = await request.arrayBuffer();
    if (!audio || audio.byteLength === 0) {
      return errorResponse('Аудиоданные пустые.', 400);
    }
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return errorResponse('Запись слишком длинная. Максимум — 15 секунд.', 413);
    }

    const format = detectAudioFormat(audio);
    if (!format) {
      return errorResponse('Формат записи не поддерживается.', 415);
    }

    let rates: IEnergyRates;
    try {
      rates = await getEnergyRates(db);
    } catch (err) {
      console.error('❌ [whisper] Настройки экономики:', (err as Error).message);
      return errorResponse('Распознавание временно недоступно.', 503);
    }

    const keysPool = getRotatedKeysPool();
    if (keysPool.length === 0) {
      return errorResponse('Распознавание временно недоступно.', 503);
    }

    // Резерв энергии до запроса (для admin/creator — без заморозки)
    const minCharge = rates.voiceMinCharge;
    const reserveMax = energyForUsd(VOICE_RESERVE_USD, rates.energyPerUsd, rates.voiceMarkup, minCharge);
    const reservation = await reserveEnergy(userId, minCharge, reserveMax, 'voice', null, VOICE_HOLD_TTL_SEC, db);
    if (!reservation.ok) {
      const msg = reservation.reason === 'daily_limit'
        ? '⏳ Дневной лимит энергии исчерпан — голосовой ввод будет доступен завтра.'
        : '⚠️ Недостаточно энергии для распознавания голоса.';
      return errorResponse(msg, 429);
    }
    const holdId = reservation.holdId;
    let holdClosed = false;

    try {
      const requestBody = JSON.stringify({
        model: STT_MODEL,
        input_audio: { data: bufferToBase64(audio), format },
      });

      let lastError = '';
      for (let k = 0; k < keysPool.length; k++) {
        try {
          const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${keysPool[k]}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://vercel.com',
              'X-Title': 'Telegram Mini App FIBI STT',
            },
            body: requestBody,
            signal: AbortSignal.timeout(25_000),
          });

          const data: any = await response.json().catch(() => null);
          if (!response.ok || !data) {
            const st = response.status;
            lastError = `${st}: ${String(data?.error?.message || '').substring(0, 200)}`;
            // 400 — проблема в самой записи, другой ключ не поможет
            if (st === 400 || st === 413 || st === 415) break;
            continue;
          }

          const text = String(data.text || '').trim();
          const usd = Number(data.usage?.cost);
          const hasCost = Number.isFinite(usd) && usd > 0;
          const usage: IUsageRecord = {
            kind: 'voice',
            model_id: STT_MODEL,
            agent_id: null,
            chat_id: null,
            prompt_tokens: null,
            completion_tokens: null,
            cost_usd: hasCost ? usd : 0,
            cost_source: hasCost ? 'usage' : 'none',
            markup: rates.voiceMarkup,
            energy_per_usd: rates.energyPerUsd,
            outcome: text ? 'done' : 'empty',
          };

          // Оплата по факту; пустой результат не оплачивается, но расход пишется в журнал
          const charge = text ? energyForUsd(hasCost ? usd : 0, rates.energyPerUsd, rates.voiceMarkup, minCharge) : 0;
          holdClosed = true;
          const spend = await settleEnergy(holdId, userId, charge, 'chat', 'Голосовой ввод', usage, db);
          if (!spend.success) {
            console.warn(`⚠️ [whisper] Списание ${charge} не прошло: ${spend.error}`);
            await releaseEnergy(holdId, db);
          }

          return jsonResponse({ text }, 200, { 'Cache-Control': 'no-store' });
        } catch (err) {
          lastError = (err as Error).message;
          console.error(`❌ [whisper] ROUTER_KEY${k}:`, lastError);
        }
      }

      console.error('❌ [whisper] Распознавание не удалось:', lastError);
      return errorResponse('Не удалось распознать голос. Попробуйте ещё раз.', 502);
    } finally {
      if (!holdClosed) await releaseEnergy(holdId, db);
    }
  } catch (err) {
    console.error('Whisper handler error:', (err as Error).message);
    return errorResponse('Не удалось распознать голос.', 500);
  }
}
