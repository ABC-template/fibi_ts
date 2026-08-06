// ============================================
// api/cron/premium/send-notifications.ts
// Описание: Отправка уведомлений об истечении подписки
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

  const supabaseConfig = getSupabaseConfig('service');
  const botToken = process.env.BOT_TOKEN?.trim();

  if (!botToken) {
    return new Response(JSON.stringify({ error: 'BOT_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();

    // Находим пользователей с истекающей подпиской
    const users = await supabaseFetch(
      `users?role=eq.premium&premium_until=gte.${fromDate}&premium_until=lte.${toDate}&select=telegram_id,premium_until,role`,
      { method: 'GET' },
      supabaseConfig
    );

    let sent = 0;

    for (const user of (users || [])) {
      const expiry = new Date(user.premium_until);
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft < 0 || daysLeft > 5) continue;

      // Проверяем, не отправляли ли уже уведомление сегодня
      const notifs = await supabaseFetch(
        `premium_notifications?user_id=eq.${user.telegram_id}&notified_at=eq.${today}&select=notified_at`,
        { method: 'GET' },
        supabaseConfig
      );

      if (notifs && Array.isArray(notifs) && notifs.length > 0) continue;

      let message = '';
      let notificationType = 'expiry_warning';

      if (daysLeft > 0) {
        const dayWord = (daysLeft % 10 === 1 && daysLeft % 100 !== 11) ? 'день' :
          ((daysLeft % 10 >= 2 && daysLeft % 10 <= 4 && (daysLeft % 100 < 10 || daysLeft % 100 >= 20)) ? 'дня' : 'дней');
        message = `⚠️ Ваша PRO-подписка истекает через ${daysLeft} ${dayWord}. Продлите, чтобы не потерять синхронизацию чатов и расширенные лимиты.`;
        notificationType = 'expiry_warning';
      } else {
        message = `⏰ Ваша PRO-подписка истекла сегодня. Ваши чаты будут храниться в облаке ещё 7 дней. Скачайте архив в приложении или продлите PRO, иначе облачные данные будут безвозвратно удалены.`;
        notificationType = 'final_notice';

        // Устанавливаем дедлайн на 7 дней
        const deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabaseFetch(
          `users?telegram_id=eq.${user.telegram_id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ data_deadline: deadline })
          },
          supabaseConfig
        );
      }

      // Отправляем уведомление
      const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const resp = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegram_id,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      const json = await resp.json();

      if (json.ok) {
        await supabaseFetch(
          'premium_notifications',
          {
            method: 'POST',
            body: JSON.stringify({
              user_id: user.telegram_id,
              notified_at: today,
              days_left: daysLeft,
              notification_type: notificationType
            })
          },
          supabaseConfig
        );
        sent++;
        console.log(`✅ Уведомление отправлено пользователю ${user.telegram_id}`);
      } else {
        console.error(`❌ Не удалось отправить уведомление ${user.telegram_id}: ${json.description}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      notifications_sent: sent
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Send notifications error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
