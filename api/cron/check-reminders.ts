// ============================================
// api/cron/check-reminders.ts
// Описание: Проверка и отправка напоминаний (вызывается cron-job.org)
// Версия: 3.0.0 - защита CRON_SECRET; атомарная отметка перед отправкой (без дублей
//                 при параллельных вызовах), возврат в очередь при сетевой ошибке;
//                 текст без Markdown (символы пользователя ломали отправку);
//                 общий supabase-client
//          2.0.0 - TypeScript
// ============================================

import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';

export const config = { runtime: 'edge' };

/** Сколько напоминаний обрабатывать за один вызов (лимит времени Edge) */
const BATCH = 50;

function json(body: Record<string, any>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function setStatus(id: string, status: string, db: any): Promise<void> {
  try {
    await supabaseFetch(
      `reminders?id=eq.${id}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      db
    );
  } catch (err) {
    console.error(`Не удалось обновить статус напоминания ${id}:`, (err as Error).message);
  }
}

export default async function handler(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    return json({ success: false, error: 'BOT_TOKEN not configured' }, 500);
  }

  try {
    const db = getSupabaseConfig('service');
    const nowIso = new Date().toISOString();

    const due = await supabaseFetch(
      `reminders?status=eq.pending&trigger_at=lte.${encodeURIComponent(nowIso)}` +
        `&order=trigger_at.asc&limit=${BATCH}&select=id,user_id,task_text`,
      { method: 'GET' },
      db
    );

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const reminder of Array.isArray(due) ? due : []) {
      // Забираем напоминание себе: если другой вызов уже взял его, строка не обновится
      const claimed = await supabaseFetch(
        `reminders?id=eq.${reminder.id}&status=eq.pending`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'sent' }),
        },
        db
      );
      if (!Array.isArray(claimed) || claimed.length === 0) {
        skipped++;
        continue;
      }

      try {
        const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: reminder.user_id,
            text: `🔔 Напоминание\n\n${reminder.task_text}`,
          }),
        });
        const tgData = await tgResponse.json();

        if (tgData.ok) {
          sent++;
        } else if (tgData.error_code === 403 || tgData.error_code === 400) {
          // Бот заблокирован / чат недоступен — повторять бессмысленно
          console.error(`Напоминание ${reminder.id} не доставлено: ${tgData.description}`);
          await setStatus(reminder.id, 'failed', db);
          failed++;
        } else {
          // Временная ошибка Telegram — вернуть в очередь
          console.error(`Напоминание ${reminder.id}: временная ошибка ${tgData.description}`);
          await setStatus(reminder.id, 'pending', db);
          failed++;
        }
      } catch (err) {
        console.error(`Напоминание ${reminder.id}: сбой сети`, (err as Error).message);
        await setStatus(reminder.id, 'pending', db);
        failed++;
      }
    }

    return json({ success: true, sent, failed, skipped });
  } catch (err) {
    console.error('check-reminders error:', (err as Error).message);
    return json({ success: false, error: (err as Error).message }, 500);
  }
}
