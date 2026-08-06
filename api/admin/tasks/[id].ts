// ============================================
// api/admin/tasks/[id].ts
// Обновление и удаление задания
// Версия: 1.0.0
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
} from '../../_lib/index';

export const config = { runtime: 'edge' };

const CREATOR_ID = 1541531808;

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || auth.userId !== CREATOR_ID) {
    return errorResponse('Доступ запрещён', 403);
  }

  const config = getSupabaseConfig('service');
  const url = new URL(request.url);
  const taskId = url.pathname.split('/').pop();

  if (!taskId) {
    return errorResponse('Missing task ID', 400);
  }

  // PUT — обновить задание
  if (request.method === 'PUT') {
    try {
      const body = await request.json();

      const result = await supabaseFetch(
        `sponsor_tasks?id=eq.${taskId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: body.title,
            description: body.description,
            sponsor_name: body.sponsor_name,
            sponsor_logo: body.sponsor_logo || null,
            reward: body.reward,
            type: body.type,
            target: body.target,
            action_required: body.action_required,
            verification_type: body.verification_type || 'pseudo',
            pseudo_hours: body.pseudo_hours || 12,
            expires_at: body.expires_at || null,
            max_completions: body.max_completions || null,
          }),
        },
        config
      );

      return jsonResponse({
        success: true,
        task: result,
      });
    } catch (err) {
      console.error('Update task error:', (err as Error).message);
      return errorResponse((err as Error).message, 500);
    }
  }

  // PATCH — частичное обновление (например, статус)
  if (request.method === 'PATCH') {
    try {
      const body = await request.json();

      const result = await supabaseFetch(
        `sponsor_tasks?id=eq.${taskId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
        config
      );

      return jsonResponse({
        success: true,
        task: result,
      });
    } catch (err) {
      console.error('Patch task error:', (err as Error).message);
      return errorResponse((err as Error).message, 500);
    }
  }

  // DELETE — удалить задание
  if (request.method === 'DELETE') {
    try {
      await supabaseFetch(
        `sponsor_tasks?id=eq.${taskId}`,
        { method: 'DELETE' },
        config
      );

      // Удаляем все выполнения этого задания
      await supabaseFetch(
        `user_task_completions?task_id=eq.${taskId}`,
        { method: 'DELETE' },
        config
      );

      return jsonResponse({
        success: true,
      });
    } catch (err) {
      console.error('Delete task error:', (err as Error).message);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
