// ============================================
// api/cron/premium/clean-data.ts
// Описание: Удаление данных пользователей с истекшим дедлайном
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
    const today = now.toISOString();

    // Находим пользователей с истекшим дедлайном
    const expiredUsers = await supabaseFetch(
      `users?data_deadline=lte.${today}&select=telegram_id`,
      { method: 'GET' },
      config
    );

    let deletedUsersCount = 0;
    let deletedChatsCount = 0;
    let deletedMessagesCount = 0;

    for (const user of (expiredUsers || [])) {
      try {
        // Считаем чаты и сообщения перед удалением
        const userChats = await supabaseFetch(
          `chats?user_id=eq.${user.telegram_id}&select=id`,
          { method: 'GET' },
          config
        );

        if (userChats && Array.isArray(userChats) && userChats.length > 0) {
          const chatIds = userChats.map((c: any) => c.id).join(',');
          const messagesCount = await supabaseFetch(
            `messages?chat_id=in.(${chatIds})&select=id`,
            { method: 'GET' },
            config
          );

          deletedChatsCount += userChats.length;
          deletedMessagesCount += (messagesCount && Array.isArray(messagesCount)) ? messagesCount.length : 0;
        }

        // Удаляем данные
        await supabaseFetch(
          `chats?user_id=eq.${user.telegram_id}`,
          { method: 'DELETE' },
          config
        );

        await supabaseFetch(
          `reminders?user_id=eq.${user.telegram_id}`,
          { method: 'DELETE' },
          config
        );

        await supabaseFetch(
          `trackers?user_id=eq.${user.telegram_id}`,
          { method: 'DELETE' },
          config
        );

        // Сбрасываем дедлайн
        await supabaseFetch(
          `users?telegram_id=eq.${user.telegram_id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ data_deadline: null })
          },
          config
        );

        deletedUsersCount++;
        console.log(`🗑️ Удалены данные пользователя ${user.telegram_id}`);
      } catch (err) {
        console.error(`Ошибка удаления данных ${user.telegram_id}:`, (err as Error).message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: today,
      users_deleted: deletedUsersCount,
      chats_deleted: deletedChatsCount,
      messages_deleted: deletedMessagesCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Clean data error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
