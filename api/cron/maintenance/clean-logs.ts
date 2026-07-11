// ============================================
// api/cron/maintenance/clean-logs.ts
// Описание: Очистка старых логов безопасности
// Версия: 2.0.0 - TypeScript
// ============================================

import { getSupabaseConfig, supabaseRPC } from '../../_lib/supabase-client';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET?.trim();

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const config = getSupabaseConfig('service');

  try {
    const now = new Date();

    // Очищаем логи безопасности старше 30 дней
    const deletedCount = await supabaseRPC(
      'clean_old_security_logs',
      {},
      config
    );

    // Очищаем старые записи usage
    const usageDeleted = await supabaseRPC(
      'clean_old_usage',
      {},
      config
    );

    // Очищаем старые pending_deletions
    const pendingDeleted = await supabaseRPC(
      'clean_old_pending_deletions',
      {},
      config
    );

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      security_logs_deleted: deletedCount || 0,
      usage_records_deleted: usageDeleted || 0,
      pending_deletions_cleaned: pendingDeleted || 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Clean logs error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
