// ============================================
// api/admin/agents/models.ts
// Описание: Получение списка моделей OpenRouter с фильтрацией по modality
// Версия: 1.0.0
// ============================================

import { authenticate, isAdmin } from '../../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../../_lib/cors';

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

const MODALITY_FILTERS: Record<string, (model: OpenRouterModel) => boolean> = {
  text: (m) => {
    const outputs = m.architecture?.output_modalities || [];
    return outputs.length === 0 || outputs.includes('text');
  },
  image: (m) => {
    const outputs = m.architecture?.output_modalities || [];
    const id = m.id.toLowerCase();
    return (
      outputs.includes('image') ||
      id.includes('dall-e') ||
      id.includes('flux') ||
      id.includes('stable-diffusion') ||
      id.includes('ideogram') ||
      id.includes('recraft') ||
      id.includes('black-forest')
    );
  },
  video: (m) => {
    const outputs = m.architecture?.output_modalities || [];
    const id = m.id.toLowerCase();
    return (
      outputs.includes('video') ||
      id.includes('video') ||
      id.includes('runway') ||
      id.includes('luma') ||
      id.includes('kling') ||
      id.includes('minimax') ||
      id.includes('hunyuan')
    );
  },
  audio: (m) => {
    const outputs = m.architecture?.output_modalities || [];
    const id = m.id.toLowerCase();
    return (
      outputs.includes('audio') ||
      id.includes('tts') ||
      id.includes('whisper') ||
      id.includes('eleven') ||
      id.includes('audio')
    );
  },
};

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

    // Берём первый доступный ключ
    const apiKey =
      process.env.ROUTER_KEY0 ||
      process.env.ROUTER_KEY1 ||
      process.env.ROUTER_KEY2;

    if (!apiKey) {
      return errorResponse('OpenRouter API key not configured', 500);
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('OpenRouter models error:', text);
      return errorResponse('Failed to fetch models from OpenRouter', 502);
    }

    const data = await response.json();
    const allModels: OpenRouterModel[] = data.data || [];

    const filterFn = MODALITY_FILTERS[modality] || MODALITY_FILTERS.text;
    const filtered = allModels
      .filter(filterFn)
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({
      success: true,
      modality,
      count: filtered.length,
      models: filtered.map((m) => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        pricing: m.pricing,
      })),
    });
  } catch (err) {
    console.error('admin/agents/models error:', err);
    return errorResponse((err as Error).message || 'Internal error', 500);
  }
}
