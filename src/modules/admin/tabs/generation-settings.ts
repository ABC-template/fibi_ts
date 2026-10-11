// ============================================
// src/modules/admin/tabs/generation-settings.ts
// Панель настроек генерации в форме агента (image / video).
// Строится по возможностям выбранной модели OpenRouter (приходят из
// /admin/agents/models → capabilities): администратор выбирает режимы,
// какие значения параметров доступны пользователю, значения по умолчанию,
// негативный промпт и цену. Результат — generation_config, по которому
// форма генерации в чате строится сама (src/modules/chat/generation.ts).
// Версия: 1.1.0 — у видео-модели без прайса за секунду цену 1 секунды задаёт администратор
//   1.0.0
// ============================================

import type {
  GenerationModeInput,
  IGenerationConfig,
  IGenerationMode,
  IGenerationParam,
  IGenerationPricing,
  IModelCapabilities,
} from '../../../../types/generation';

const MAX_REFERENCES = 10;

interface IModeDef {
  key: string;
  label: string;
  input: GenerationModeInput;
  requiresMedia: boolean;
  /** Максимум изображений в режиме (0 — режим не принимает изображений) */
  limit: number;
}

const PARAM_LABELS: Record<string, string> = {
  resolution: 'Разрешение',
  aspect_ratio: 'Соотношение',
  quality: 'Качество',
  background: 'Фон',
  duration: 'Длительность, сек',
  n: 'Количество',
  generate_audio: 'Звук',
};

const DEFAULT_PREFERENCES: Record<string, string[]> = {
  resolution: ['720p', '1K', '1080p'],
  aspect_ratio: ['1:1', '16:9'],
  quality: ['auto', 'medium'],
  background: ['auto'],
};

const CARD = 'padding:10px;border-radius:10px;border:1px solid var(--app-border-color);margin-bottom:10px';
const INPUT =
  'padding:6px 8px;border-radius:6px;border:1px solid var(--app-border-color);background:var(--app-bg-primary);color:var(--app-text-primary)';
const HINT = 'font-size:11px;color:var(--app-text-tertiary)';
const TITLE = 'font-weight:600;font-size:13px;color:#d4af37;margin:12px 0 8px';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickDefault(values: string[], key: string): string {
  for (const preferred of DEFAULT_PREFERENCES[key] || []) {
    if (values.includes(preferred)) return preferred;
  }
  return values[0] ?? '';
}

/**
 * Прайс-лист видео-модели → $ за секунду по разрешениям.
 * Берём позиции вида duration_seconds[_<разрешение>]; ключ 'default' — единая цена.
 */
export function videoPricesFromSkus(
  skus: Record<string, number>,
  resolutions: string[]
): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const [sku, value] of Object.entries(skus || {})) {
    const m = /^duration_seconds(?:_(.+))?$/.exec(sku);
    if (!m || !Number.isFinite(value)) continue;
    if (!m[1]) {
      prices.default = value;
      continue;
    }
    const resolution = resolutions.find((r) => r.toLowerCase() === m[1].toLowerCase()) || m[1];
    prices[resolution] = value;
  }
  return prices;
}

export class GenerationSettingsPanel {
  private root: HTMLElement;
  private caps: IModelCapabilities | null = null;
  private base: IGenerationConfig = {};

  private _onChange = () => this._updatePreview();
  private _coefficientInput: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    // Делегирование: корневой элемент живёт всё время, содержимое перерисовывается
    this.root.addEventListener('input', this._onChange);
    this.root.addEventListener('change', this._onChange);
  }

  /** Снять обработчики вне панели (вызывается при закрытии формы) */
  dispose(): void {
    this.root.removeEventListener('input', this._onChange);
    this.root.removeEventListener('change', this._onChange);
    this._coefficientInput?.removeEventListener('input', this._onChange);
    this._coefficientInput = null;
  }

  /** Панель работает, когда известны возможности модели */
  get active(): boolean {
    return this.caps !== null;
  }

  /**
   * Перерисовать панель под модель. config — сохранённая конфигурация агента
   * (только если модель та же, что была сохранена), иначе null: значения по умолчанию.
   */
  setModel(caps: IModelCapabilities | null, config: IGenerationConfig | null): void {
    this.caps = caps;
    this.base = config && typeof config === 'object' ? config : {};

    if (!caps) {
      this.root.innerHTML = '';
      return;
    }

    this.root.innerHTML = this._html(caps);
    this._bind();
    this._updatePreview();
  }

  // ==========================================
  // РАЗМЕТКА
  // ==========================================

  private _modeDefs(caps: IModelCapabilities): IModeDef[] {
    if (caps.kind === 'image') {
      const defs: IModeDef[] = [
        { key: 'text', label: 'Текст → Изображение', input: 'none', requiresMedia: false, limit: 0 },
      ];
      if (caps.max_input_references > 0) {
        defs.push({
          key: 'edit',
          label: 'Изображение → Изображение',
          input: 'references',
          requiresMedia: true,
          limit: Math.min(caps.max_input_references, MAX_REFERENCES),
        });
      }
      return defs;
    }

    const defs: IModeDef[] = [
      { key: 'text', label: 'Текст → Видео', input: 'none', requiresMedia: false, limit: 0 },
    ];
    if (caps.frame_images.includes('first_frame')) {
      defs.push({ key: 'first_frame', label: 'Фото → Видео', input: 'first_frame', requiresMedia: true, limit: 1 });
    }
    if (caps.frame_images.includes('first_frame') && caps.frame_images.includes('last_frame')) {
      defs.push({
        key: 'frames',
        label: 'По кадрам (первый и последний)',
        input: 'first_last_frames',
        requiresMedia: true,
        limit: 2,
      });
    }
    return defs;
  }

  private _savedMode(key: string): IGenerationMode | undefined {
    return (this.base.modes || []).find((m) => m.key === key);
  }

  private _savedParam(key: string): IGenerationParam | undefined {
    return (this.base.params || []).find((p) => p.key === key);
  }

  private _html(caps: IModelCapabilities): string {
    const hasSaved = Array.isArray(this.base.modes) && this.base.modes.length > 0;

    // --- Режимы ---
    const modes = this._modeDefs(caps)
      .map((def) => {
        const saved = this._savedMode(def.key);
        const checked = hasSaved ? !!saved : true;
        const maxMedia = saved?.max_media ?? def.limit;
        const mediaInput =
          def.limit > 1
            ? `<span style="${HINT}">до</span>
               <input type="number" data-gs-mode-max="${esc(def.key)}" min="1" max="${def.limit}" value="${esc(
                 Math.min(maxMedia, def.limit)
               )}" style="width:56px;${INPUT}">
               <span style="${HINT}">изображений</span>`
            : '';
        return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" data-gs-mode="${esc(def.key)}" ${checked ? 'checked' : ''}> ${esc(def.label)}
          </label>${mediaInput}
        </div>`;
      })
      .join('');

    // --- Параметры ---
    const rows: string[] = [];

    const enumRow = (key: string, values: string[]) => {
      if (values.length === 0) return;
      const saved = this._savedParam(key);
      const shown = hasSaved ? !!saved : true;
      const allowed = saved && Array.isArray(saved.options)
        ? saved.options.map((o: any) => String(typeof o === 'string' ? o : o.value))
        : values;
      const defaultValue = saved?.default !== undefined && values.includes(String(saved.default))
        ? String(saved.default)
        : pickDefault(values, key);

      const chips = values
        .map(
          (v) => `<label style="display:inline-flex;align-items:center;gap:3px;font-size:12px;margin:0 8px 4px 0;cursor:pointer">
            <input type="checkbox" data-gs-allow="${esc(key)}" value="${esc(v)}" ${
              !shown || allowed.includes(v) ? 'checked' : ''
            }> ${esc(v)}</label>`
        )
        .join('');
      const options = values
        .map((v) => `<option value="${esc(v)}" ${v === defaultValue ? 'selected' : ''}>${esc(v)}</option>`)
        .join('');

      rows.push(`<div style="${CARD}" data-gs-param="${esc(key)}" data-gs-kind="enum">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer">
          <input type="checkbox" data-gs-show ${shown ? 'checked' : ''}> ${esc(PARAM_LABELS[key] || key)}
        </label>
        <div style="margin-top:6px">${chips}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <span style="${HINT}">По умолчанию</span>
          <select data-gs-default style="${INPUT}">${options}</select>
        </div>
      </div>`);
    };

    enumRow('resolution', caps.resolutions);
    enumRow('aspect_ratio', caps.aspect_ratios);
    enumRow('quality', caps.qualities);
    enumRow('background', caps.backgrounds);
    if (caps.durations.length > 0) enumRow('duration', caps.durations.map(String));

    if (caps.max_n > 1) {
      const saved = this._savedParam('n');
      const shown = hasSaved ? !!saved : true;
      const max = Math.min(Number(saved?.max) || caps.max_n, caps.max_n);
      const def = Math.min(Number(saved?.default) || 1, max);
      rows.push(`<div style="${CARD}" data-gs-param="n" data-gs-kind="n">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer">
          <input type="checkbox" data-gs-show ${shown ? 'checked' : ''}> ${PARAM_LABELS.n}
        </label>
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <span style="${HINT}">Максимум (до ${caps.max_n})</span>
          <input type="number" data-gs-nmax min="1" max="${caps.max_n}" value="${max}" style="width:64px;${INPUT}">
          <span style="${HINT}">По умолчанию</span>
          <input type="number" data-gs-default min="1" max="${caps.max_n}" value="${def}" style="width:64px;${INPUT}">
        </div>
      </div>`);
    }

    if (caps.kind === 'video' && caps.generate_audio) {
      const saved = this._savedParam('generate_audio');
      const shown = hasSaved ? !!saved : true;
      rows.push(`<div style="${CARD}" data-gs-param="generate_audio" data-gs-kind="bool">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer">
          <input type="checkbox" data-gs-show ${shown ? 'checked' : ''}> ${PARAM_LABELS.generate_audio}
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:6px;cursor:pointer">
          <input type="checkbox" data-gs-default ${saved?.default === true ? 'checked' : ''}> Включён по умолчанию
        </label>
      </div>`);
    }

    // --- Промпты ---
    const promptMax = Number(this.base.prompt?.max_length) || 4000;
    const negEnabled = !!this.base.negative_prompt?.enabled;
    const negMax = Number(this.base.negative_prompt?.max_length) || 2000;

    // --- Цена ---
    const pricing = this.base.pricing;
    const energyRate = Number(pricing?.energy_per_usd) || '';
    let priceHtml: string;
    if (caps.kind === 'video') {
      const prices = videoPricesFromSkus(caps.pricing_skus, caps.resolutions);
      const lines = Object.entries(prices)
        .map(([res, usd]) => `${esc(res)}: $${usd}/сек`)
        .join(' · ');
      if (lines) {
        priceHtml = `<div style="${HINT};margin-bottom:6px">Цена модели: ${lines}</div>`;
      } else {
        const saved = pricing?.kind === 'per_second' ? pricing.prices?.default : '';
        priceHtml = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
          <span style="font-size:12px">Ориентировочная цена 1 секунды, $</span>
          <input type="number" id="gs-usd-sec" min="0" step="0.001" value="${esc(saved ?? '')}" style="width:90px;${INPUT}">
        </div>
        <div style="${HINT};margin-bottom:6px">Провайдер не указал цену за секунду, поэтому оценку задаёте вы.
          Фактическое списание считается по реальной стоимости из ответа OpenRouter.</div>`;
      }
    } else {
      priceHtml = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        <span style="font-size:12px">Ориентировочная цена 1 изображения, $</span>
        <input type="number" id="gs-usd" min="0" step="0.001" value="${esc(pricing?.usd ?? '')}" style="width:90px;${INPUT}">
      </div>
      <div style="${HINT};margin-bottom:6px">OpenRouter берёт плату за токены, поэтому цену изображения задаёте вы.
        Фактическое списание считается по реальной стоимости из ответа.</div>`;
    }

    return `
      <div style="${TITLE}">Режимы</div>
      ${modes}
      <div style="${TITLE}">Параметры формы</div>
      ${rows.join('') || `<div style="${HINT}">У модели нет настраиваемых параметров</div>`}
      <div style="${TITLE}">Запрос</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        <span style="font-size:12px">Максимальная длина</span>
        <input type="number" id="gs-prompt-max" min="1" max="20000" value="${promptMax}" style="width:90px;${INPUT}">
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-bottom:4px">
        <input type="checkbox" id="gs-neg" ${negEnabled ? 'checked' : ''}> Негативный промпт
      </label>
      <div style="${HINT};margin-bottom:6px">API OpenRouter не имеет отдельного поля: текст добавляется к запросу как «Avoid: …».</div>
      <div id="gs-neg-max-row" style="display:${negEnabled ? 'flex' : 'none'};align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:12px">Максимальная длина</span>
        <input type="number" id="gs-neg-max" min="1" max="10000" value="${negMax}" style="width:90px;${INPUT}">
      </div>
      <div style="${TITLE}">Цена</div>
      ${priceHtml}
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:12px">Энергии за $1</span>
        <input type="number" id="gs-rate" min="1" step="1" value="${esc(energyRate)}" style="width:110px;${INPUT}">
      </div>
      <div id="gs-preview" style="${HINT};margin-top:6px"></div>
    `;
  }

  // ==========================================
  // СОБЫТИЯ
  // ==========================================

  private _bind(): void {
    const neg = this.root.querySelector('#gs-neg') as HTMLInputElement | null;
    neg?.addEventListener('change', () => {
      const row = this.root.querySelector('#gs-neg-max-row') as HTMLElement | null;
      if (row) row.style.display = neg.checked ? 'flex' : 'none';
    });

    // Коэффициент агента лежит в основной форме — пересчитываем пример при его изменении
    this._coefficientInput?.removeEventListener('input', this._onChange);
    this._coefficientInput = document.getElementById('agent-coefficient');
    this._coefficientInput?.addEventListener('input', this._onChange);
    document.getElementById('agent-min-charge')?.addEventListener('input', this._onChange);
  }

  private _updatePreview(): void {
    const el = this.root.querySelector('#gs-preview');
    if (!el || !this.caps) return;

    try {
      const pricing = this._pricing();
      const coefficient = Number((document.getElementById('agent-coefficient') as HTMLInputElement)?.value) || 1;
      const minCharge = Number((document.getElementById('agent-min-charge') as HTMLInputElement)?.value) || 0;

      let usd = 0;
      let sample = '';
      if (pricing.kind === 'per_second') {
        const res = this._defaultOf('resolution');
        const duration = Number(this._defaultOf('duration')) || 5;
        const perSecond = pricing.prices?.[res] ?? pricing.prices?.default ?? Math.min(...Object.values(pricing.prices || { x: 0 }));
        usd = perSecond * duration;
        sample = `${duration} сек${res ? ' · ' + res : ''}`;
      } else {
        usd = pricing.usd || 0;
        sample = '1 изображение';
      }

      const energy = Math.max(Math.ceil(usd * pricing.energy_per_usd * coefficient), minCharge);
      el.textContent = `Пример (${sample}): ≈ $${usd.toFixed(3)} → ${energy} ⚡ с учётом коэффициента ${coefficient} и мин. списания`;
    } catch {
      el.textContent = 'Укажите цену и курс, чтобы увидеть пример расчёта';
    }
  }

  private _defaultOf(key: string): string {
    const row = this.root.querySelector(`[data-gs-param="${key}"]`);
    const shown = (row?.querySelector('[data-gs-show]') as HTMLInputElement | null)?.checked;
    if (!row || !shown) return '';
    return (row.querySelector('[data-gs-default]') as HTMLSelectElement | null)?.value || '';
  }

  // ==========================================
  // СБОР
  // ==========================================

  private _pricing(): IGenerationPricing {
    const caps = this.caps as IModelCapabilities;
    const rate = Number((this.root.querySelector('#gs-rate') as HTMLInputElement)?.value);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Укажите, сколько энергии стоит $1');

    if (caps.kind === 'video') {
      const prices = videoPricesFromSkus(caps.pricing_skus, caps.resolutions);
      if (Object.keys(prices).length === 0) {
        const perSec = Number((this.root.querySelector('#gs-usd-sec') as HTMLInputElement)?.value);
        if (!Number.isFinite(perSec) || perSec <= 0) {
          throw new Error('Укажите ориентировочную цену 1 секунды в $');
        }
        return { kind: 'per_second', prices: { default: perSec }, energy_per_usd: rate };
      }
      return { kind: 'per_second', prices, energy_per_usd: rate };
    }

    const usd = Number((this.root.querySelector('#gs-usd') as HTMLInputElement)?.value);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('Укажите ориентировочную цену 1 изображения в $');
    return { kind: 'per_image', usd, energy_per_usd: rate };
  }

  /** Собирает generation_config. Бросает Error с понятным текстом, если что-то не заполнено */
  collect(): IGenerationConfig {
    const caps = this.caps;
    if (!caps) throw new Error('Нет данных о возможностях модели');

    // Режимы
    const modes: IGenerationMode[] = [];
    for (const def of this._modeDefs(caps)) {
      const box = this.root.querySelector(`[data-gs-mode="${def.key}"]`) as HTMLInputElement | null;
      if (!box?.checked) continue;

      const maxInput = this.root.querySelector(`[data-gs-mode-max="${def.key}"]`) as HTMLInputElement | null;
      const maxMedia = def.limit === 0 ? 0 : maxInput ? Math.max(1, Math.min(Number(maxInput.value) || 1, def.limit)) : def.limit;

      modes.push({
        key: def.key,
        label: { ru: def.label },
        input: def.input,
        requires_media: def.requiresMedia,
        media_types: def.limit > 0 ? ['image'] : [],
        ...(def.limit > 0 ? { max_media: maxMedia } : {}),
      });
    }
    if (modes.length === 0) throw new Error('Выберите хотя бы один режим');

    // Параметры
    const params: IGenerationParam[] = [];
    this.root.querySelectorAll<HTMLElement>('[data-gs-param]').forEach((row) => {
      const key = row.dataset.gsParam as string;
      const kind = row.dataset.gsKind;
      const shown = (row.querySelector('[data-gs-show]') as HTMLInputElement).checked;
      if (!shown) return;

      const label = { ru: PARAM_LABELS[key] || key };

      if (kind === 'enum') {
        const allowed = Array.from(row.querySelectorAll<HTMLInputElement>('[data-gs-allow]:checked')).map((b) => b.value);
        if (allowed.length === 0) throw new Error(`«${label.ru}»: отметьте хотя бы одно значение`);
        const def = (row.querySelector('[data-gs-default]') as HTMLSelectElement).value;
        if (!allowed.includes(def)) throw new Error(`«${label.ru}»: значение по умолчанию должно быть среди отмеченных`);
        params.push({ key, type: 'select', label, options: allowed, default: def });
      } else if (kind === 'n') {
        const cap = caps.max_n;
        const max = Math.max(1, Math.min(Number((row.querySelector('[data-gs-nmax]') as HTMLInputElement).value) || 1, cap));
        const def = Math.max(1, Math.min(Number((row.querySelector('[data-gs-default]') as HTMLInputElement).value) || 1, max));
        params.push({ key, type: 'number', label, min: 1, max, step: 1, default: def });
      } else if (kind === 'bool') {
        params.push({
          key,
          type: 'boolean',
          label,
          default: (row.querySelector('[data-gs-default]') as HTMLInputElement).checked,
        });
      }
    });

    const promptMax = Math.max(1, Number((this.root.querySelector('#gs-prompt-max') as HTMLInputElement).value) || 4000);
    const negOn = (this.root.querySelector('#gs-neg') as HTMLInputElement).checked;
    const negMax = Math.max(1, Number((this.root.querySelector('#gs-neg-max') as HTMLInputElement).value) || 2000);

    return {
      ...this.base,
      modes,
      params,
      prompt: { ...(this.base.prompt || {}), required: true, max_length: promptMax },
      negative_prompt: { ...(this.base.negative_prompt || {}), enabled: negOn, max_length: negMax },
      pricing: this._pricing(),
    };
  }
}
