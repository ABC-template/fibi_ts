// ============================================
// src/modules/admin/tabs/AdminDashboardTab.ts
// Версия: 3.0.0 — «Расходы ИИ» за период (сегодня / 7 / 30 дней) по журналу ai_usage:
//                  дебет/кредит (расход OpenRouter, доход постоянной энергией, баланс),
//                  бонусная энергия, админы, недоплаты, токены; разбивка по типам,
//                  топ-5 моделей, тарифы, дни; OpenRouter — расход по ключам и остаток счёта
//          2.0.0 — плитки по новой статистике: пользователи, квесты, энергия
//                  и недоплаты за 7 дней, монеты, рефералы, реклама сегодня
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

const PERIODS: Array<{ days: number; label: string }> = [
  { days: 1, label: 'Сегодня' },
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
];

const KIND_LABELS: Record<string, string> = {
  text: '💬 Текст',
  image: '🖼️ Фото',
  video: '🎬 Видео',
  voice: '🎤 Голос',
};

const GREEN = '#27ae60';
const RED = '#e74c3c';
const ORANGE = '#e67e22';
const GOLD = '#d4af37';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function n(value: unknown): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function fmt(value: unknown): string {
  return typeof value === 'number' || (typeof value === 'string' && value !== '' && Number.isFinite(Number(value)))
    ? n(value).toLocaleString('ru-RU')
    : '—';
}

/** Доллары: мелкие суммы — с 4 знаками */
function usd(value: unknown): string {
  const x = n(value);
  const digits = Math.abs(x) < 1 ? 4 : 2;
  return `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

export class AdminDashboardTab implements IAdminTab {
  id = 'dashboard';
  label = 'Дашборд';
  icon = '📊';
  priority = 10;

  private data: any = null;
  private days = 7;
  private loading = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get(`/admin/stats?days=${this.days}`);
      if (res.success) this.data = res;
    } catch (e) {
      console.error('[AdminDashboardTab]', e);
    } finally {
      this.loading = false;
    }
  }

  async refresh(): Promise<void> {
    await this.loadData();
  }

  onShow(): void {
    this.loadData();
  }

  /** Период «Расходов ИИ» (window.adminModule.setDashboardPeriod) */
  async setPeriod(days: number): Promise<void> {
    if (!PERIODS.some((p) => p.days === days) || days === this.days) return;
    this.days = days;
    await this.loadData();
  }

  // ==========================================
  // Разметка
  // ==========================================

  private tile(value: string, label: string, color = ''): string {
    return `
      <div style="background:var(--app-bg-tertiary);border-radius:10px;padding:12px;text-align:center;min-width:0">
        <div style="font-size:18px;font-weight:700;word-break:break-word;${color ? `color:${color}` : ''}">${value}</div>
        <div style="font-size:11px;color:var(--app-text-tertiary);margin-top:2px">${label}</div>
      </div>`;
  }

  private section(title: string, tiles: string[]): string {
    return `
      <div style="font-size:12px;font-weight:600;color:var(--app-text-secondary);margin:16px 0 8px">${title}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">${tiles.join('')}</div>`;
  }

  private hint(text: string): string {
    return `<div style="font-size:11px;color:var(--app-text-tertiary);margin-top:6px;line-height:1.4">${text}</div>`;
  }

  /** Таблица с горизонтальной прокруткой (узкий экран) */
  private table(title: string, head: string[], rows: string[][]): string {
    if (rows.length === 0) return '';
    const th = head
      .map((h, i) => `<th style="padding:6px 8px;text-align:${i === 0 ? 'left' : 'right'};font-weight:600;white-space:nowrap">${h}</th>`)
      .join('');
    const body = rows
      .map((r) => `<tr style="border-top:1px solid var(--app-border-color-light)">${r
        .map((c, i) => `<td style="padding:6px 8px;text-align:${i === 0 ? 'left' : 'right'};white-space:nowrap">${c}</td>`)
        .join('')}</tr>`)
      .join('');
    return `
      <div style="font-size:12px;font-weight:600;color:var(--app-text-secondary);margin:16px 0 8px">${title}</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;background:var(--app-bg-tertiary);border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--app-text-primary)">
          <thead style="color:var(--app-text-tertiary)"><tr>${th}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  private periodChips(): string {
    return `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
        ${PERIODS.map((p) => `
          <button class="btn ${p.days === this.days ? 'btn-primary' : 'btn-secondary'}"
            onclick="window.adminModule.setDashboardPeriod(${p.days})"
            style="padding:6px 12px;font-size:12px">${p.label}</button>`).join('')}
      </div>`;
  }

  private renderAi(ai: any): string {
    const t = ai?.totals || {};
    const rate = n(ai?.energy_per_usd);
    const balance = n(t.balance_usd);

    const kinds = (Array.isArray(ai?.by_kind) ? ai.by_kind : []).map((k: any) => [
      esc(KIND_LABELS[k.kind] || k.kind),
      fmt(k.requests),
      usd(k.cost_usd),
      fmt(k.energy_charged),
      usd(k.permanent_usd),
    ]);

    const models = (Array.isArray(ai?.top_models) ? ai.top_models : []).map((m: any) => [
      `${esc(m.model_id)}<div style="font-size:10px;color:var(--app-text-tertiary)">${esc(KIND_LABELS[m.kind] || m.kind)}</div>`,
      fmt(m.requests),
      usd(m.cost_usd),
      usd(m.avg_cost_usd),
      `${fmt(m.prompt_tokens)} / ${fmt(m.completion_tokens)}`,
      fmt(m.energy_charged),
    ]);

    const tiers = (Array.isArray(ai?.by_tier) ? ai.by_tier : []).map((r: any) => [
      esc(r.tier),
      fmt(r.users),
      fmt(r.requests),
      usd(r.cost_usd),
      fmt(r.energy_charged),
      usd(r.permanent_usd),
    ]);

    const daysRows = this.days > 1
      ? (Array.isArray(ai?.by_day) ? ai.by_day : []).map((d: any) => {
          const bal = n(d.permanent_usd) - n(d.cost_usd);
          return [
            esc(new Date(d.day).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })),
            fmt(d.requests),
            usd(d.cost_usd),
            usd(d.permanent_usd),
            `<span style="color:${bal < 0 ? RED : GREEN}">${usd(bal)}</span>`,
          ];
        })
      : [];

    return `
      ${this.section('🧾 Расходы ИИ: дебет / кредит', [
        this.tile(usd(t.cost_usd), 'Расход OpenRouter', RED),
        this.tile(usd(t.permanent_usd), 'Доход (постоянная ⚡)', GREEN),
        this.tile(usd(balance), 'Баланс периода', balance < 0 ? RED : GREEN),
        this.tile(usd(t.bonus_usd), 'Бонусная ⚡ в $', ORANGE),
        this.tile(usd(t.bypass_cost_usd), `Админы (${fmt(t.bypass_requests)} запр.)`),
      ])}
      ${this.hint(
        `Доход — списанная постоянная (купленная) энергия по курсу ${rate ? `${fmt(rate)} ⚡/$` : '—'}. ` +
        'Бонусная энергия бесплатна для пользователя: её расход — наши затраты. ' +
        'Баланс = доход − весь расход OpenRouter (включая бонусных и админов).'
      )}

      ${this.section('⚙️ Запросы и энергия', [
        this.tile(fmt(t.requests), `Запросов · ${fmt(t.users)} польз.`),
        this.tile(fmt(t.energy_charged), 'Списано ⚡'),
        this.tile(`${fmt(t.from_bonus)} / ${fmt(t.from_permanent)}`, 'Бонус / постоянная ⚡'),
        this.tile(`${fmt(t.prompt_tokens)} / ${fmt(t.completion_tokens)}`, 'Токены вход / выход'),
        this.tile(`${fmt(t.shortfall_count)} · ${fmt(t.shortfall)} ⚡`, 'Недоплаты', n(t.shortfall) ? RED : ''),
        this.tile(fmt(t.estimated_requests), 'Без usage.cost (оценка)', n(t.estimated_requests) ? ORANGE : ''),
        this.tile(fmt(t.interrupted_requests), 'Оборвано / пустых'),
      ])}

      ${this.table('По типам', ['Тип', 'Запр.', 'Расход', '⚡', 'Доход'], kinds)}
      ${this.table('Топ-5 моделей по расходу', ['Модель', 'Запр.', 'Расход', 'Ср. $', 'Токены в/вых', '⚡'], models)}
      ${this.table('По тарифам', ['Тариф', 'Польз.', 'Запр.', 'Расход', '⚡', 'Доход'], tiers)}
      ${this.table('По дням (UTC)', ['День', 'Запр.', 'Расход', 'Доход', 'Баланс'], daysRows)}
      ${n(t.requests) === 0 ? this.hint('За период запросов нет.') : ''}`;
  }

  private renderOpenRouter(or: any): string {
    const credits = or?.credits || {};
    const keys: any[] = Array.isArray(or?.keys) ? or.keys : [];

    const creditsTiles = credits.configured
      ? credits.ok
        ? [
            this.tile(usd(credits.balance), 'Остаток на счёте', n(credits.balance) < 5 ? RED : GOLD),
            this.tile(usd(credits.total_usage), 'Потрачено всего'),
            this.tile(usd(credits.total_credits), 'Пополнено всего'),
          ]
        : [this.tile('—', `Счёт: ${esc(credits.error || 'ошибка')}`, RED)]
      : [];

    const keyRows = keys.map((k) => k.ok
      ? [
          `ROUTER_KEY${esc(k.index)}${k.is_free_tier ? ' (free)' : ''}`,
          usd(k.usage_daily),
          usd(k.usage_monthly),
          usd(k.usage),
          k.limit_remaining === null || k.limit_remaining === undefined ? '∞' : usd(k.limit_remaining),
        ]
      : [`ROUTER_KEY${esc(k.index)}`, `<span style="color:${RED}">${esc(k.error || 'ошибка')}</span>`, '', '', '']);

    return `
      ${creditsTiles.length ? this.section('💳 OpenRouter', creditsTiles) : `
        <div style="font-size:12px;font-weight:600;color:var(--app-text-secondary);margin:16px 0 4px">💳 OpenRouter</div>
        ${this.hint('Остаток на счёте виден с management-ключом: создайте его в OpenRouter (Settings → Management keys) и добавьте в Vercel как OPENROUTER_MANAGEMENT_KEY.')}`}
      ${this.table('Расход по ключам (данные OpenRouter, UTC)', ['Ключ', 'Сегодня', 'Месяц', 'Всего', 'Остаток лимита'], keyRows)}`;
  }

  render(): string {
    if (this.loading && !this.data) {
      return `<div style="padding:40px;text-align:center;color:var(--app-text-tertiary)">⏳ Загрузка...</div>`;
    }

    const s = this.data?.stats || {};

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:16px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0;color:var(--app-text-primary)">📊 Дашборд</h3>
        ${this.periodChips()}

        ${this.data ? this.renderAi(this.data.ai) + this.renderOpenRouter(this.data.openrouter) : this.hint('Не удалось загрузить статистику.')}

        ${this.section('👤 Пользователи', [
          this.tile(fmt(s.total_users), 'Всего'),
          this.tile(fmt(s.active_users_7d), 'Заходили за 7 дней', GREEN),
          this.tile(fmt(s.premium_users), 'Premium (активные)', GOLD),
          this.tile(fmt(s.trial_users), 'Trial'),
        ])}

        ${this.section('🪙 Монеты за 7 дней', [
          this.tile(fmt(s.coins_earned_7d), 'Начислено', GREEN),
          this.tile(fmt(s.coins_spent_7d), 'Потрачено'),
          this.tile(fmt(s.ad_views_today), 'Реклама сегодня'),
          this.tile(fmt(s.ad_coins_today), '🪙 за рекламу сегодня'),
        ])}

        ${this.section('📋 Задания и рефералы', [
          this.tile(fmt(s.total_quests), 'Квестов'),
          this.tile(fmt(s.active_quests), 'Активных', GREEN),
          this.tile(fmt(s.referrals_pending), 'Рефералов ждут'),
          this.tile(fmt(s.referrals_rewarded), 'Награждено'),
        ])}

        <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('dashboard')" style="padding:8px 16px;font-size:13px;margin-top:16px">
          🔄 Обновить
        </button>
      </div>
    `;
  }

  destroy(): void {}
}
