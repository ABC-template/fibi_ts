// ============================================
// api/media/sign.ts
// Пакетная выдача подписанных ссылок на файлы пользователя.
// Клиент хранит/получает из БД только storage_path и просит ссылки здесь
// (показ в чате, просмотрщик, «Повторить»). Ссылки живут signTtlSec.
// Версия: 1.0.0
// ============================================

import { authenticate } from '../_lib/auth';
import { handleCORS, errorResponse, jsonResponse } from '../_lib/cors';
import { getSupabaseConfig } from '../_lib/supabase-client';
import { HttpError } from '../_lib/http-error';
import { MEDIA_LIMITS, assertStoragePaths, getOwnedFiles, signUrls } from '../_lib/media';

export const config = { runtime: 'edge' };

const MAX_PATHS_PER_REQUEST = 50;

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
    const paths = assertStoragePaths(body?.paths, MAX_PATHS_PER_REQUEST);

    const config = getSupabaseConfig('service');

    // Подписываем только то, что принадлежит пользователю
    const owned = await getOwnedFiles(userId, paths, config);
    const ownedPaths = owned.map((f) => f.storage_path);

    const urls = await signUrls(ownedPaths, MEDIA_LIMITS.signTtlSec, config);

    return jsonResponse({
      success: true,
      urls,
      expires_in: MEDIA_LIMITS.signTtlSec,
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('Media sign error:', err);
    return errorResponse((err as Error).message || 'Internal error', 500);
  }
}
