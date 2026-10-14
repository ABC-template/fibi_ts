// ============================================
// src/modules/admin/tabs/AdminSettingsTab.ts
// Версия: 2.1.0 — «⚡ Цена энергии»: курс ⚡ за $1 (все агенты и голос), коэффициент
//                  (дробный) и мин. списание голосового ввода; срок хранения — журнал ai_usage
//          2.0.0 — все поля, которые принимает /admin/economy/settings: максимум обмена,
//                  лимиты игр и рекламы, сроки хранения журналов; удалено несуществующее
//                  bonus_coins_per_day; ошибка сервера показывается как есть
//          1.1.0 — галочка «Только для подписчиков канала» (channel_gate_enabled):
//                  без подписки — заглушка «Подпишитесь», без галочки — вход как обычно
// ============================================

import { IAdminTab } from '../core/admin-tab.interface';
import { apiClient } from '@/services/api';

interface INumberField {
  key: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  /** Дробное число (шаг 0.01) */
  decimal?: boolean;
}

interface IFlagField {
  key: string;
  label: string;
  hint?: string;
}

/** Диапазоны — как в api/admin/economy/settings.ts */
const NUMBER_SECTIONS: Array<{ title: string; fields: INumberField[] }> = [
  {
    title: '⚡ Цена энергии',
    fields: [
      {
        key: 'energy_per_usd',
        label: 'Энергии за $1 себестоимости',
        hint: 'Общий курс: текст, фото, видео, голос. Коэффициенты агентов — сверху. Применяется в течение минуты',
        min: 100,
        max: 1_000_000,
      },
      { key: 'voice_markup', label: 'Коэффициент голосового ввода', hint: 'Например 1.5', min: 0.1, max: 100, decimal: true },
      { key: 'voice_min_charge', label: 'Мин. списание за голос, ⚡', min: 1, max: 100_000 },
    ],
  },
  {
    title: '💱 Обмен монет',
    fields: [
      { key: 'exchange_rate', label: 'Курс обмена (монеты → энергия)', min: 0, max: 1_000_000 },
      { key: 'min_exchange_amount', label: 'Мин. сумма обмена', min: 1, max: 1_000_000 },
      { key: 'max_exchange_percent', label: 'Макс. доля баланса за обмен, %', min: 1, max: 100 },
    ],
  },
  {
    title: '🎮 Игры и реклама',
    fields: [
      { key: 'game_coins_daily_cap', label: 'Монет из игр в день', hint: '0 — игры не награждают', min: 0, max: 1_000_000 },
      { key: 'ad_reward_daily_limit', label: 'Наград за рекламу в день', min: 0, max: 1_000 },
      { key: 'ad_reward_min_interval_sec', label: 'Пауза между наградами за рекламу, с', min: 0, max: 86_400 },
    ],
  },
  {
    title: '🗄️ Хранение журналов (очистка раз в сутки)',
    fields: [
      { key: 'log_retention_days', label: 'Расходы ИИ, дней', hint: 'журнал ai_usage (дашборд «Расходы ИИ»)', min: 7, max: 3_650 },
      { key: 'audit_log_retention_days', label: 'Транзакции и аудит, дней', hint: 'монеты, энергия, аудит экономики, system_logs', min: 7, max: 3_650 },
    ],
  },
];

const FLAGS: IFlagField[] = [
  { key: 'exchange_enabled', label: 'Обмен включён' },
  { key: 'whitelist_enabled', label: 'Whitelist включён' },
  {
    key: 'channel_gate_enabled',
    label: '📢 Только для подписчиков канала',
    hint: 'Без подписки — заглушка «Подпишитесь». Бот должен быть админом канала (CHANNEL_ID)',
  },
];

const INPUT_STYLE =
  'width:100px;padding:6px 10px;border-radius:8px;border:1px solid var(--app-border-color);' +
  'background:var(--app-bg-primary);color:var(--app-text-primary)';

function hintHtml(hint?: string): string {
  return hint ? `<span style="display:block;font-size:11px;color:var(--app-text-tertiary)">${hint}</span>` : '';
}

export class AdminSettingsTab implements IAdminTab {
  id = 'settings';
  label = 'Настройки';
  icon = '⚙️';
  priority = 40;

  private settings: any = null;
  private loading = false;
  private saving = false;

  async init(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await apiClient.get('/admin/economy/settings');
      if (res.success) this.settings = res.settings || {};
    } catch (e) {
      console.error(e);
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

  render(): string {
    const s = this.settings || {};

    const numberRow = (f: INumberField): string => {
      const value = Number.isFinite(Number(s[f.key])) ? Number(s[f.key]) : '';
      return `
        <label style="display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px">
          <span>${f.label}${hintHtml(f.hint)}</span>
          <input type="number" id="set-${f.key}" value="${value}" min="${f.min}" max="${f.max}" step="${f.decimal ? '0.01' : '1'}"
                 style="${INPUT_STYLE};flex-shrink:0">
        </label>`;
    };

    const flagRow = (f: IFlagField): string => `
      <label style="display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px">
        <span>${f.label}${hintHtml(f.hint)}</span>
        <input type="checkbox" id="set-${f.key}" ${s[f.key] ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0">
      </label>`;

    const sections = NUMBER_SECTIONS.map((sec) => `
      <div style="font-size:12px;font-weight:600;color:var(--app-text-secondary);margin-top:8px">${sec.title}</div>
      ${sec.fields.map(numberRow).join('')}
    `).join('');

    return `
      <div style="background:var(--app-bg-secondary);border-radius:12px;padding:20px;border:1px solid var(--app-border-color-light)">
        <h3 style="margin:0 0 16px;color:var(--app-text-primary)">⚙️ Настройки</h3>

        <div style="display:grid;gap:12px;max-width:520px">
          ${sections}
          <div style="font-size:12px;font-weight:600;color:var(--app-text-secondary);margin-top:8px">🔐 Доступ</div>
          ${FLAGS.map(flagRow).join('')}
        </div>

        <div style="margin-top:20px;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="window.adminModule.saveSettings()" style="padding:8px 16px;font-size:13px">
            💾 Сохранить
          </button>
          <button class="btn btn-secondary" onclick="window.adminModule.refreshTab('settings')" style="padding:8px 16px;font-size:13px">
            🔄 Обновить
          </button>
        </div>
      </div>
    `;
  }

  /** Значения формы; строка — ошибка проверки */
  private collect(): Record<string, number | boolean> | string {
    const payload: Record<string, number | boolean> = {};

    for (const sec of NUMBER_SECTIONS) {
      for (const f of sec.fields) {
        const input = document.getElementById(`set-${f.key}`) as HTMLInputElement | null;
        if (!input || input.value.trim() === '') continue;
        const n = Number(input.value.replace(',', '.'));
        const okType = f.decimal
          ? Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6
          : Number.isInteger(n);
        if (!okType || n < f.min || n > f.max) {
          return f.decimal
            ? `«${f.label}»: число от ${f.min} до ${f.max} (до сотых)`
            : `«${f.label}»: целое число от ${f.min} до ${f.max}`;
        }
        payload[f.key] = n;
      }
    }

    for (const f of FLAGS) {
      const input = document.getElementById(`set-${f.key}`) as HTMLInputElement | null;
      if (input) payload[f.key] = input.checked;
    }

    return payload;
  }

  async save(): Promise<void> {
    if (this.saving) return;

    const payload = this.collect();
    if (typeof payload === 'string') {
      alert(payload);
      return;
    }

    this.saving = true;
    try {
      const res = await apiClient.post('/admin/economy/settings', payload);
      if (res.success) {
        this.settings = res.settings || { ...this.settings, ...payload };
        alert('Настройки сохранены');
      } else {
        alert(res.error || 'Ошибка');
      }
    } catch (e) {
      alert(`Ошибка сохранения: ${(e as Error).message || e}`);
    } finally {
      this.saving = false;
    }
  }

  destroy(): void {}
}
