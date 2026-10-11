// ============================================
// api/admin/agents/models.ts
// Список моделей OpenRouter для формы агента (по модальности)
// Версия: 2.0.0
//   - изображения: GET /images/models, видео: GET /videos/models — отдельные API
//     OpenRouter с описанием возможностей модели (разрешения, соотношения сторон,
//     длительности, кадры, референсы, цены). Они приходят в поле capabilities и
//     по ним админка строит настройки формы генерации
//   - текст и аудио: GET /models?output_modalities=... (без подбора по подстрокам в id:
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
  };
  return { id: String(m.id), name: String(m.name || m.id), capabilities: caps };
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
