// ============================================
// api/_lib/energy-hold.ts
// Резерв энергии на время запроса (sql/energy_holds.sql):
//   reserveEnergy — заморозить перед запросом (атомарно в БД);
//   settleEnergy  — снять заморозку и списать фактическую стоимость;
//   releaseEnergy — снять заморозку без списания.
// Параллельные запросы больше не тратят один и тот же баланс дважды.
// Версия: 1.1.0 — резерв голосового ввода (kind 'voice'); settleEnergy пишет строку
//                  журнала расходов ai_usage (sql/stage1_finance.sql) — в той же
//                  транзакции, что и списание; amount = 0 — только запись расхода
//          1.0.0
// ============================================

import { supabaseRPC } from './supabase-client';
import type { ISupabaseConfig } from './supabase-client';
import { UUID_RE } from './media';
import type { IUsageRecord } from './energy-pricing';

export type EnergyHoldKind = 'text' | 'generation' | 'voice';

export interface IEnergyReservation {
  ok: boolean;
  /** null при отказе */
  holdId: string | null;
  /** Сколько заморожено (для admin/creator — запрошенный максимум, без заморозки) */
  amount: number;
  bypass: boolean;
  /** no_tokens | daily_limit | generation_busy | user_not_found */
  reason: string | null;
  /** generation_busy: чат, где идёт генерация */
  busyChatId: string | null;
  bonus: number;
  permanent: number;
  total: number;
  held: number;
  spentToday: number;
  dailyLimit: number;
}

export interface IEnergySettlement {
  success: boolean;
  /** Фактически списано (0 для admin/creator) */
  charged: number;
  bypass: boolean;
  bonusUsed: number;
  permanentUsed: number;
  error?: string;
}

/**
 * Заморозить энергию: не меньше min, по возможности max.
 * Бросает исключение, если сам RPC не отработал (без резерва запрос не выполняем).
 */
export async function reserveEnergy(
  userId: number,
  min: number,
  max: number,
  kind: EnergyHoldKind,
  chatId: string | null,
  ttlSeconds: number,
  config: ISupabaseConfig
): Promise<IEnergyReservation> {
  const safeMin = Math.max(0, Math.ceil(Number(min) || 0));
  const safeMax = Math.max(safeMin, Math.ceil(Number(max) || 0));

  const res = await supabaseRPC(
    'reserve_energy',
    {
      p_user_id: userId,
      p_min: safeMin,
      p_max: safeMax,
      p_kind: kind,
      p_chat_id: chatId && UUID_RE.test(chatId) ? chatId : null,
      p_ttl_seconds: Math.max(1, Math.ceil(ttlSeconds)),
    },
    config
  );

  if (!res || typeof res !== 'object') {
    throw new Error('reserve_energy: unexpected response');
  }

  return {
    ok: res.success === true,
    holdId: typeof res.hold_id === 'string' ? res.hold_id : null,
    amount: Number(res.amount) || 0,
    bypass: res.bypass === true,
    reason: res.success === true ? null : String(res.reason || 'no_tokens'),
    busyChatId: typeof res.chat_id === 'string' ? res.chat_id : null,
    bonus: Number(res.bonus) || 0,
    permanent: Number(res.permanent) || 0,
    total: Number(res.total) || 0,
    held: Number(res.held) || 0,
    spentToday: Number(res.spent_today) || 0,
    dailyLimit: Number(res.daily_limit) || 0,
  };
}

/**
 * Снять заморозку, списать amount (до нуля: работа уже сделана) и записать расход
 * в журнал ai_usage. amount = 0 — без списания, только запись расхода.
 * Ошибок не бросает — результат уже у пользователя, сбой пишется в лог.
 */
export async function settleEnergy(
  holdId: string | null | undefined,
  userId: number,
  amount: number,
  source: string,
  description: string,
  usage: IUsageRecord,
  config: ISupabaseConfig
): Promise<IEnergySettlement> {
  try {
    const res = await supabaseRPC(
      'settle_energy',
      {
        p_hold_id: typeof holdId === 'string' && UUID_RE.test(holdId) ? holdId : null,
        p_user_id: userId,
        p_amount: Math.max(0, Math.ceil(Number(amount) || 0)),
        p_source: source,
        p_description: description,
        p_usage: {
          ...usage,
          agent_id: usage.agent_id && UUID_RE.test(usage.agent_id) ? usage.agent_id : null,
          chat_id: usage.chat_id && UUID_RE.test(usage.chat_id) ? usage.chat_id : null,
          cost_usd: Number.isFinite(usage.cost_usd) && usage.cost_usd > 0 ? usage.cost_usd : 0,
          prompt_tokens: Number.isFinite(usage.prompt_tokens as number) ? Math.round(usage.prompt_tokens as number) : null,
          completion_tokens: Number.isFinite(usage.completion_tokens as number) ? Math.round(usage.completion_tokens as number) : null,
        },
      },
      config
    );

    if (!res || typeof res !== 'object' || res.success !== true) {
      return {
        success: false,
        charged: 0,
        bypass: false,
        bonusUsed: 0,
        permanentUsed: 0,
        error: (res && res.error) || 'settle_energy failed',
      };
    }

    return {
      success: true,
      charged: res.bypass === true ? 0 : Number(res.charged) || 0,
      bypass: res.bypass === true,
      bonusUsed: Number(res.used_bonus) || 0,
      permanentUsed: Number(res.used_permanent) || 0,
    };
  } catch (err) {
    console.error('settle_energy failed:', (err as Error).message);
    return {
      success: false,
      charged: 0,
      bypass: false,
      bonusUsed: 0,
      permanentUsed: 0,
      error: (err as Error).message,
    };
  }
}

/** Снять заморозку без списания. Идемпотентна, ошибок не бросает (заморозка истечёт сама). */
export async function releaseEnergy(
  holdId: string | null | undefined,
  config: ISupabaseConfig
): Promise<void> {
  if (typeof holdId !== 'string' || !UUID_RE.test(holdId)) return;
  try {
    await supabaseRPC('release_energy', { p_hold_id: holdId }, config);
  } catch (err) {
    console.error('release_energy failed:', (err as Error).message);
  }
}
