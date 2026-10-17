// ============================================
// api/admin/agents/models.ts
// Список моделей OpenRouter для формы агента (по модальности)
// Версия: 3.0.0 — аудио: модели озвучки (/models?output_modalities=speech, голоса —
//                  supported_voices) и модели музыки / аудио-ответов (output_modalities=audio)
//                  одним списком с capabilities.kind = speech | audio; цены модели — в
//                  pricing_usd (по ним админка подставляет оценку цены)
//          2.0.0
//   - изображения: GET /images/models, видео: GET /videos/models — отдельные API
//     OpenRouter с описанием возможностей модели (разрешения, соотношения сторон,
//     длительности, кадры, референсы, цены). Они приходят в поле capabilities и
//     по ним админка строит настройки формы генерации
//   - текст: GET /models?output_modalities=text (без подбора по подстрокам в id:
//     раньше «minimax»/«hunyuan» попадали в видео, хотя это текстовые модели)
// ============================================

import { authenticate, isAdmin } from '../../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';
import type { IModelCapabilities } from '../../../types/generation';

export const config = { runtime: 'edge' };

const OPENROUTER = 'https://openrouter.ai/api/v1';

interface IModelOption {
  id: string;
  name: string;
  context_length?: number;
  pricing?: Record<string, any>;
  capabilities?: IModelCapabilities;
}

function arr<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function enumValues(param: any): string[] {
  return arr(param?.values).map((x) => String(x));
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Модель из /images/models → название и возможности */
function imageModel(m: any): IModelOption {
  const p = m?.supported_parameters || {};
  const caps: IModelCapabilities = {
    kind: 'image',
    resolutions: enumValues(p.resolution),
    aspect_ratios: enumValues(p.aspect_ratio),
    durations: [],
    qualities: enumValues(p.quality),
    backgrounds: enumValues(p.background),
    max_n: Math.max(1, num(p.n?.max, 1)),
    max_input_references: Math.max(0, num(p.input_references?.max, 0)),
    frame_images: [],
    generate_audio: false,
    seed: !!p.seed,
    pricing_skus: {},
    voices: [],
    pricing_usd: {},
  };
  return { id: String(m.id), name: String(m.name || m.id), capabilities: caps };
}

/** Модель из /videos/models → название и возможности */
function videoModel(m: any): IModelOption {
  const skus: Record<string, number> = {};
  for (const [key, value] of Object.entries(m?.pricing_skus || {})) {
    const n = Number(value);
    if (Number.isFinite(n)) skus[key] = n;
  }

  const caps: IModelCapabilities = {
    kind: 'video',
    resolutions: arr(m?.supported_resolutions).map((x) => String(x)),
    aspect_ratios: arr(m?.supported_aspect_ratios).map((x) => String(x)),
    durations: arr(m?.supported_durations).map((x) => Number(x)).filter((x) => Number.isFinite(x)),
    qualities: [],
    backgrounds: [],
    max_n: 1,
    max_input_references: 0,
    frame_images: arr(m?.supported_frame_images).filter(
      (x) => x === 'first_frame' || x === 'last_frame'
    ),
    generate_audio: m?.generate_audio === true,
    seed: m?.seed === true,
    pricing_skus: skus,
    voices: [],
    pricing_usd: {},
  };
  return { id: String(m.id), name: String(m.name || m.id), capabilities: caps };
}

/** Голоса из supported_voices: строки или объекты { id | voice_id | name } */
function voicesOf(m: any): string[] {
  const out: string[] = [];
  for (const v of arr(m?.supported_voices)) {
    const id = typeof v === 'string' ? v : v?.id ?? v?.voice_id ?? v?.name;
    if (id !== undefined && id !== null && String(id).trim()) out.push(String(id).trim());
  }
  return Array.from(new Set(out));
}

/** Цены из /models: строки → числа, только положительные */
function pricesOf(m: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(m?.pricing || {})) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

/** Модель озвучки (speech) или музыки / аудио-ответов (audio) */
function audioModel(m: any, kind: 'speech' | 'audio'): IModelOption {
  const caps: IModelCapabilities = {
    kind,
    resolutions: [],
    aspect_ratios: [],
    durations: [],
    qualities: [],
    backgrounds: [],
    max_n: 1,
    max_input_references: 0,
    frame_images: [],
    generate_audio: false,
    seed: false,
    pricing_skus: {},
    voices: voicesOf(m),
    pricing_usd: pricesOf(m),
  };
  const suffix = kind === 'speech' ? 'озвучка' : 'аудио';
  return {
    id: String(m.id),
    name: `${String(m.name || m.id)} · ${suffix}`,
    context_length: m.context_length,
    pricing: m.pricing,
    capabilities: caps,
  };
}

/** Выход модели действительно содержит нужную модальность (фильтр API на всякий случай перепроверяем) */
function outputs(m: any, modality: string): boolean {
  const list = arr(m?.architecture?.output_modalities).map((x) => String(x));
  return list.includes(modality);
}

/** Аудио-агенты: модели озвучки и модели аудио-ответов одним списком (без повторов) */
async function audioModels(apiKey: string): Promise<IModelOption[]> {
  const [speech, audio] = await Promise.allSettled([
    fetchList('/models?output_modalities=speech', apiKey),
    fetchList('/models?output_modalities=audio', apiKey),
  ]);
  if (speech.status === 'rejected' && audio.status === 'rejected') {
    throw new Error('OpenRouter: не удалось получить аудио-модели');
  }

  const result = new Map<string, IModelOption>();
  if (speech.status === 'fulfilled') {
    for (const m of speech.value) {
      if (outputs(m, 'speech')) result.set(String(m.id), audioModel(m, 'speech'));
    }
  }
  if (audio.status === 'fulfilled') {
    for (const m of audio.value) {
      if (outputs(m, 'audio') && !result.has(String(m.id))) result.set(String(m.id), audioModel(m, 'audio'));
    }
  }
  return Array.from(result.values());
}

async function fetchList(path: string, apiKey: string): Promise<any[]> {
  const res = await fetch(`${OPENROUTER}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`OpenRouter ${path} error:`, res.status, text.substring(0, 300));
    throw new Error(`OpenRouter ${path}: ${res.status}`);
  }
  const body = await res.json();
  // Ответы приходят как { data: [...] }; на случай другой обёртки
  return arr(body?.data ?? body?.models ?? body);
}

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const isUserAdmin = await isAdmin(auth.userId);
    if (!isUserAdmin) {
      return errorResponse('Forbidden', 403);
    }

    const url = new URL(request.url);
    const modality = url.searchParams.get('modality') || 'text';

    if (!['text', 'image', 'video', 'audio'].includes(modality)) {
      return errorResponse('Invalid modality', 400);
    }

    const apiKey = process.env.ROUTER_KEY0 || process.env.ROUTER_KEY1 || process.env.ROUTER_KEY2;
    if (!apiKey) {
      return errorResponse('OpenRouter API key not configured', 500);
    }

    let models: IModelOption[];

    if (modality === 'image') {
      models = (await fetchList('/images/models', apiKey)).map(imageModel);
    } else if (modality === 'video') {
      models = (await fetchList('/videos/models', apiKey)).map(videoModel);
    } else if (modality === 'audio') {
      models = await audioModels(apiKey);
    } else {
      const raw = await fetchList(`/models?output_modalities=${modality}`, apiKey);
      models = raw.map((m) => ({
        id: String(m.id),
        name: String(m.name || m.id),
        context_length: m.context_length,
        pricing: m.pricing,
      }));
    }

    models.sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({
      success: true,
      modality,
      count: models.length,
      models,
    });
  } catch (err) {
    console.error('admin/agents/models error:', err);
    return errorResponse((err as Error).message || 'Internal error', 500);
  }
}
