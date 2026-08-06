// ============================================
// api/cron/maintenance/clean-trash.ts
// Описание: Автоматическая очистка корзины (30 дней)
// Версия: 2.0.0 - TypeScript
// ============================================

import { getSupabaseConfig, supabaseFetch } from '../../_lib/supabase-client';

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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let trashCleanedCount = 0;
    let chatIdsToDelete: string[] = [];

    // Находим чаты в корзине старше 30 дней
    const expiredTrash = await supabaseFetch(
      `chats?deleted_at=lt.${encodeURIComponent(thirtyDaysAgo)}&select=id`,
      { method: 'GET' },
      config
    );

    if (expiredTrash && Array.isArray(expiredTrash) && expiredTrash.length > 0) {
      chatIdsToDelete = expiredTrash.map((c: any) => c.id);

      for (const chatId of chatIdsToDelete) {
        try {
          // Удаляем сообщения
          await supabaseFetch(
            `messages?chat_id=eq.${chatId}`,
            { method: 'DELETE' },
            config
          );

          // Удаляем чат
          await supabaseFetch(
            `chats?id=eq.${chatId}`,
            { method: 'DELETE' },
            config
          );

          trashCleanedCount++;
          console.log(`🗑️ Удалён чат ${chatId} (в корзине > 30 дней)`);
        } catch (err) {
          console.error(`Ошибка удаления чата ${chatId}:`, (err as Error).message);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      trash_cleaned: trashCleanedCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Clean trash error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
