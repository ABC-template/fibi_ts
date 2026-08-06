// ============================================
// api/admin/tasks/index.ts
// CRUD для спонсорских заданий
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

  // GET — список заданий
  if (request.method === 'GET') {
    try {
      const tasks = await supabaseFetch(
        'sponsor_tasks?order=created_at.desc',
        { method: 'GET' },
        config
      );

      return jsonResponse({
        success: true,
        tasks: tasks || [],
      });
    } catch (err) {
      console.error('Get tasks error:', (err as Error).message);
      return errorResponse((err as Error).message, 500);
    }
  }

  // POST — создать задание
  if (request.method === 'POST') {
    try {
      const body = await request.json();

      const result = await supabaseFetch(
        'sponsor_tasks',
        {
          method: 'POST',
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
            created_by: CREATOR_ID,
          }),
        },
        config
      );

      return jsonResponse({
        success: true,
        task: result,
      });
    } catch (err) {
      console.error('Create task error:', (err as Error).message);
      return errorResponse((err as Error).message, 500);
    }
  }

  return errorResponse('Method Not Allowed', 405);
}
