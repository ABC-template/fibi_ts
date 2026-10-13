// ============================================
// api/media/confirm.ts
// Шаг 2 загрузки референса: проверяем, что файл реально лежит в Storage,
// сверяем фактические размер и mime с заявленными, обновляем размер в
// media_files. Нарушителей (чужой тип, превышение размера/квоты) удаляем.
// Версия: 2.0.0 — подтверждение ставит confirmed_at (без него /generations/create
//                  референс не примет, а квота считает его как inputMaxBytes);
//                  повторное подтверждение отклоняется; ошибки без текста исключения
//          1.0.0
// ============================================

import { authenticate } from '../_lib/auth';
import { handleCORS, errorResponse, jsonResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { HttpError } from '../_lib/http-error';
import {
  MEDIA_LIMITS,
  UUID_RE,
  deleteMediaRows,
  getUserMediaUsage,
  headObject,
  mediaTypeFromMime,
  removeObjects,
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

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const fileId = body?.file_id;
    if (typeof fileId !== 'string' || !UUID_RE.test(fileId)) {
      return errorResponse('file_id is required', 400);
    }

    const config = getSupabaseConfig('service');

    const rows = await supabaseFetch(
      `media_files?id=eq.${fileId}&user_id=eq.${userId}&kind=eq.input&status=eq.uploaded&confirmed_at=is.null` +
        `&select=id,storage_path,mime`,
      { method: 'GET' },
      config
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return errorResponse('File not found', 404);

    const info = await headObject(row.storage_path, config);
    if (!info.exists) {
      return errorResponse('File was not uploaded', 409);
    }

    // Нарушения: удаляем и объект, и запись
    const reject = async (message: string, status: number): Promise<Response> => {
      await removeObjects([row.storage_path], config);
      await deleteMediaRows([row.id], config);
      return errorResponse(message, status);
    };

    if (info.size <= 0) return reject('Empty file', 400);
    if (info.size > MEDIA_LIMITS.inputMaxBytes) return reject('File is too large', 413);
    if (info.mime !== row.mime) return reject('File type does not match', 400);

    await supabaseFetch(
      `media_files?id=eq.${row.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ size_bytes: info.size, confirmed_at: new Date().toISOString() }),
      },
      config
    );

    // Квота с учётом фактического размера
    const used = await getUserMediaUsage(userId, config);
    if (used > MEDIA_LIMITS.userQuotaBytes) return reject('Storage quota exceeded', 413);

    return jsonResponse({
      success: true,
      file_id: row.id,
      storage_path: row.storage_path,
      type: mediaTypeFromMime(row.mime),
      mime: row.mime,
      size_bytes: info.size,
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err.message, err.status);
    console.error('Media confirm error:', err);
    return errorResponse('Internal error', 500);
  }
}
