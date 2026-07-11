// ============================================
// api/cron/check-reminders.ts
// Описание: Проверка и отправка напоминаний
// Версия: 2.0.0 - TypeScript
// ============================================

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const botToken = process.env.BOT_TOKEN?.trim();

  if (!supabaseUrl || !supabaseKey || !botToken) {
    return new Response(JSON.stringify({
      success: false,
      error: 'На сервере Vercel не настроены переменные SUPABASE или BOT_TOKEN.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  async function supabaseFetch(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${supabaseUrl}/rest/v1/${path}`;
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase error ${res.status}: ${text}`);
    }
    return res.json();
  }

  try {
    const nowIso = new Date().toISOString();
    const reminders = await supabaseFetch(
      `reminders?status=eq.pending&trigger_at=lte.${encodeURIComponent(nowIso)}&order=trigger_at.asc`
    );

    if (!Array.isArray(reminders) || reminders.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Нет актуальных напоминаний для отправки.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let sentCount = 0;

    for (const reminder of reminders) {
      const userId = reminder.user_id;
      const text = reminder.task_text;
      const pushMessageText = `🔔 *Напоминание от Versatile AI*:\n\n${text}`;
      const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

      try {
        const tgResponse = await fetch(telegramApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: userId,
            text: pushMessageText,
            parse_mode: 'Markdown'
          })
        });

        const tgData = await tgResponse.json();

        if (tgData.ok) {
          await supabaseFetch(`reminders?id=eq.${reminder.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'sent' })
          });
          sentCount++;
        } else {
          console.error(`Бот не смог отправить пуш пользователю ${userId}. Ошибка: ${tgData.description}`);
          if (tgData.error_code === 403) {
            await supabaseFetch(`reminders?id=eq.${reminder.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'failed' })
            });
          }
        }
      } catch (tgErr) {
        console.error(`Сбой сети при отправке пуша через Telegram Bot API:`, (tgErr as Error).message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Обработка завершена. Успешно отправлено пуш-уведомлений: ${sentCount}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error("Критический сбой внутри Cron-роута напоминаний:", (err as Error).message);
    return new Response(JSON.stringify({
      success: false,
      error: (err as Error).message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
