// ============================================
// api/generations/create.ts
// Создание генерации (image / video / audio)
// Версия: 1.0.0
// ============================================

import {
  authenticate,
} from '../_lib/auth';
import {
  corsHeaders,
  handleCORS,
  errorResponse,
  jsonResponse,
} from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch, supabaseRPC } from '../_lib/supabase-client';
import { checkAgentAccess } from '../_lib/agent-access';
import { getMarkupForTier } from '../_lib/markup-helper';
import { checkTokenAvailability } from '../_lib/tokens';

export const config = { runtime: 'edge' };

interface ICreateBody {
  agent_id: string;
  chat_id: string;
  prompt: string;
  params?: Record<string, any>;
  media_inputs?: any[];
  negative_prompt?: string;
}

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const auth = await authenticate(request, true);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }

    const userId = auth.userId;
    const body: ICreateBody = await request.json();

    if (!body.agent_id || !body.chat_id || !body.prompt?.trim()) {
      return errorResponse('agent_id, chat_id and prompt are required', 400);
    }

    const config = getSupabaseConfig('service');

    // 1. Агент
    const agents = await supabaseFetch(
      `ai_agents?id=eq.${body.agent_id}&select=*`,
      { method: 'GET' },
      config
    );

    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return errorResponse('Agent not found', 404);
    }

    const agent = agents[0];

    if (!agent.is_active) {
      return errorResponse('Agent is inactive', 403);
    }

    if (!['image', 'video', 'audio'].includes(agent.modality)) {
      return errorResponse('Agent modality is not generative', 400);
    }

    // 2. Доступ
    const userRes = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=role,subscription_tier,premium_until`,
      { method: 'GET' },
      config
    );

    const user = userRes?.[0];
    const access = checkAgentAccess(
      agent,
      user?.role,
      user?.subscription_tier || null
    );

    if (!access.hasAccess) {
      return errorResponse(`Access denied: ${access.reason}`, 403);
    }

    // 3. Оценка стоимости (пока упрощённо: min_charge * markup)
    // TODO: учитывать params, media, generation_config
    const markup = getMarkupForTier(agent, user?.subscription_tier || null);
    const estimatedCost = Math.max(
      Math.ceil((agent.min_charge || 1) * markup),
      agent.min_charge || 1
    );

    // 4. Проверка энергии
    const tokenCheck = await checkTokenAvailability(userId, estimatedCost, config);
    if (!tokenCheck.available) {
      return errorResponse(
        tokenCheck.reason === 'daily_limit'
          ? 'Daily limit exceeded'
          : 'Insufficient energy',
        429
      );
    }

    // 5. Создаём user-msg (запрос)
    const requestMsg = await supabaseFetch(
      'messages',
      {
        method: 'POST',
        body: JSON.stringify({
          chat_id: body.chat_id,
          msg_type: 'user-msg',
          text: body.prompt,
          metadata: {
            kind: 'generation_request',
            modality: agent.modality,
            params: body.params || {},
            prompt: body.prompt,
            media_inputs: body.media_inputs || [],
            negative_prompt: body.negative_prompt || null,
          },
        }),
      },
      config
    );

    // 6. Создаём ai-msg со статусом pending
    const resultMsg = await supabaseFetch(
      'messages',
      {
        method: 'POST',
        body: JSON.stringify({
          chat_id: body.chat_id,
          msg_type: 'ai-msg',
          text: 'Генерация...',
          metadata: {
            kind: 'generation',
            modality: agent.modality,
            status: 'pending',
            params: body.params || {},
            prompt: body.prompt,
            cost: estimatedCost,
            media: [],
            error: null,
            model_id: agent.model_id,
            progress: 0,
          },
        }),
      },
      config
    );

    const messageId = resultMsg?.id;
    const requestMessageId = requestMsg?.id;

    // 7. Списываем энергию
    await supabaseRPC(
      'spend_abstract_tokens',
      {
        p_user_id: userId,
        p_amount: estimatedCost,
        p_source: 'generation',
        p_description: `Генерация (${agent.modality})`,
      },
      config
    );

    // 8. Вызов модели (OpenRouter chat completions, non-streaming)
    // Для image-моделей часто возвращают URL или base64 в content
    const keys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const k = process.env[`ROUTER_KEY${i}`];
      if (k) keys.push(k);
    }

    if (keys.length === 0) {
      await updateGenerationStatus(messageId, 'failed', 'No OpenRouter keys', config);
      return errorResponse('Server keys not configured', 500);
    }

    // Обновляем статус на processing
    await updateGenerationStatus(messageId, 'processing', null, config);

    let media: any[] = [];
    let errorText: string | null = null;

    const systemHint = agent.system_prompt || `You are a ${agent.modality} generation assistant.`;
    const userContent = buildUserContent(body.prompt, body.params, body.negative_prompt);

    for (const key of keys) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://vercel.com',
            'X-Title': 'FIBI Generation',
          },
          body: JSON.stringify({
            model: agent.model_id,
            messages: [
              { role: 'system', content: systemHint },
              { role: 'user', content: userContent },
            ],
            temperature: 0.7,
            stream: false,
          }),
        });

        if (!response.ok) {
          const txt = await response.text();
          errorText = `OpenRouter ${response.status}: ${txt.substring(0, 180)}`;
          continue;
        }

        const data = await response.json();
        media = extractMedia(data, agent.modality);
        if (media.length > 0) {
          errorText = null;
          break;
        } else {
          errorText = 'No media in model response';
        }
      } catch (e) {
        errorText = (e as Error).message;
      }
    }

    if (media.length > 0) {
      await supabaseFetch(
        `messages?id=eq.${messageId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            text: 'Готово',
            metadata: {
              kind: 'generation',
              modality: agent.modality,
              status: 'done',
              params: body.params || {},
              prompt: body.prompt,
              cost: estimatedCost,
              media,
              error: null,
              model_id: agent.model_id,
              progress: 1,
            },
          }),
        },
        config
      );
    } else {
      await updateGenerationStatus(messageId, 'failed', errorText || 'Generation failed', config);
    }

    return jsonResponse({
      success: true,
      message_id: messageId,
      request_message_id: requestMessageId,
      status: media.length > 0 ? 'done' : 'failed',
      cost: estimatedCost,
      media: media.length > 0 ? media : undefined,
      error: errorText || undefined,
    });
  } catch (err) {
    console.error('Generation create error:', err);
    return errorResponse((err as Error).message || 'Internal error', 500);
  }
}

async function updateGenerationStatus(
  messageId: string,
  status: string,
  error: string | null,
  config: any
) {
  if (!messageId) return;
  // Получаем текущий metadata чтобы не затереть
  const current = await supabaseFetch(
    `messages?id=eq.${messageId}&select=metadata`,
    { method: 'GET' },
    config
  );
  const meta = (Array.isArray(current) && current[0]?.metadata) || {};
  await supabaseFetch(
    `messages?id=eq.${messageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        metadata: {
          ...meta,
          status,
          error,
          progress: status === 'processing' ? 0.3 : status === 'done' ? 1 : 0,
        },
      }),
    },
    config
  );
}

function buildUserContent(prompt: string, params?: Record<string, any>, negative?: string): string {
  let text = prompt;
  if (params && Object.keys(params).length) {
    text += '\n\nParameters: ' + JSON.stringify(params);
  }
  if (negative) {
    text += '\n\nNegative prompt: ' + negative;
  }
  return text;
}

function extractMedia(data: any, modality: string): any[] {
  const media: any[] = [];
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    // Ищем URL изображений / видео / аудио
    const urlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg))/gi;
    const matches = content.match(urlRegex) || [];
    for (const url of matches) {
      media.push({
        type: modality === 'video' ? 'video' : modality === 'audio' ? 'audio' : 'image',
        url,
      });
    }
    // base64 image
    const b64 = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (b64) {
      media.push({ type: 'image', url: b64[0] });
    }
  }

  // Некоторые модели возвращают images в отдельном поле
  if (Array.isArray(data?.images)) {
    for (const img of data.images) {
      if (img.url) media.push({ type: 'image', url: img.url });
    }
  }

  return media;
}

