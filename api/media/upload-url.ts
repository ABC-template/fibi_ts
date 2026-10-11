// ============================================
// api/media/upload-url.ts
// Шаг 1 загрузки референса: проверяем тип/размер/квоту по generation_config
// режима, создаём запись в media_files и выдаём одноразовую ссылку,
// по которой клиент грузит файл прямо в Storage.
// Дальше клиент вызывает /api/media/confirm.
// Версия: 1.0.0
// ============================================

import { authenticate } from '../_lib/auth';
import { handleCORS, errorResponse, jsonResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { HttpError } from '../_lib/http-error';
import { loadGenerativeAgent, resolveMode, modeAcceptsImages } from '../_lib/generation';
import {
  MEDIA_LIMITS,
  buildStoragePath,
  createSignedUploadUrl,
  getUserMediaUsage,
  isAllowedMime,
  mediaTypeFromMime,
} from '../_lib/media';

export const config = { runtime: 'edge' };

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

    const body = await request.json();
    const mime = String(body?.mime || '').toLowerCase().trim();
    const size = Number(body?.size);

    if (!mime || !Number.isFinite(size) || size <= 0) {
      return errorResponse('agent_id, mode, mime and size are required', 400);
    }

    // Пока референсами могут быть только изображения
    if (!isAllowedMime(mime) || mediaTypeFromMime(mime) !== 'image') {
      return errorResponse('Only image references are supported', 400);
    }
    if (size > MEDIA_LIMITS.inputMaxBytes) {
      return errorResponse(
        `File is too large (max ${Math.floor(MEDIA_LIMITS.inputMaxBytes / 1024 / 1024)} MB)`,
        413
      );
    }

    const config = getSupabaseConfig('service');

    const { agent } = await loadGenerativeAgent(body?.agent_id, userId, config);
    const mode = resolveMode(agent.generation_config, body?.mode);
    if (!modeAcceptsImages(mode)) {
      return errorResponse('This mode does not accept image references', 400);
    }

    // Мусорные записи: не даём накапливать неотправленные загрузки
    const pending = await supabaseFetch(
      `media_files?user_id=eq.${userId}&status=eq.uploaded&select=id&limit=${MEDIA_LIMITS.maxPendingUploads}`,
      { method: 'GET' },
      config
    );
    if (Array.isArray(pending) && pending.length >= MEDIA_LIMITS.maxPendingUploads) {
      return errorResponse('Too many pending uploads', 429);
    }

    const used = await getUserMediaUsage(userId, config);
    if (used + size > MEDIA_LIMITS.userQuotaBytes) {
      return errorResponse('Storage quota exceeded', 413);
    }

    const storagePath = buildStoragePath(userId, mime);

    const row = await supabaseFetch(
      'media_files',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          storage_path: storagePath,
          kind: 'input',
          mime,
          size_bytes: Math.floor(size),
          status: 'uploaded',
        }),
      },
      config
    );

    let uploadUrl: string;
    try {
      uploadUrl = await createSignedUploadUrl(storagePath, config);
    } catch (err) {
      await supabaseFetch(`media_files?id=eq.${row.id}`, { method: 'DELETE' }, config);
      throw err;
    }

    return jsonResponse({
      success: true,
      file_id: row.id,
      storage_path: storagePath,
      upload_url: uploadUrl,
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('Media upload-url error:', err);
    return errorResponse((err as Error).message || 'Internal error', 500);
  }
}
