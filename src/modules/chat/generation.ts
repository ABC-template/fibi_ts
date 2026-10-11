// ============================================
// src/modules/chat/generation.ts
// Интерфейс генеративных агентов (image / video / audio) в чате:
//   - форма запроса (режимы, референсы, промпт, негативный промпт, параметры)
//   - карточки запроса и результата внутри сообщений чата
//   - просмотрщик результата с кнопкой «Повторить» (форма с теми же данными)
//   - опрос чата, пока генерация идёт (результат мог прийти с другого устройства
//     или запрос оборвался по таймауту)
// Медиа хранится в приватном Storage; в сообщениях лежат только storage_path,
// ссылки для показа запрашиваются у сервера (services/generation-media.ts).
// Версия: 1.0.0
// ============================================

import { chatStore } from '@/store/ChatStore';
import { economyStore } from '@/economy/EconomyStore';
import { eventBus } from '@/core/event-bus';
import { userStore } from '@/store/UserStore';
import { uiRenderer } from '@/modules/ui/renderer';
import { apiClient, ApiError } from '@/services/api';
import { chatService } from '@/services/chats';
import { fetchAgentsWithAccess } from '@/services/agents';
import {
  REFERENCE_LIMITS,
  forgetMediaUrl,
  resolveMediaUrls,
  uploadReference,
  validateReferenceFile,
} from '@/services/generation-media';
import type { IMessage, UUID } from '@app-types';
import type {
  ICreateGenerationRequest,
  ICreateGenerationResponse,
  IGenerationConfig,
  IGenerationMedia,
  IGenerationMode,
  IGenerationParam,
} from '../../../types/generation';
import type { ChatPatcher } from './ChatPatcher';

/** Запрос на сервере дольше этого времени не ждём (мс) */
const REQUEST_TIMEOUT_MS = 180_000;
/** Генерация в статусе pending/processing старше этого считается оборванной */
const STALE_AFTER_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 4000;
/** После обрыва запроса ждём результат в чате не дольше этого */
const AWAIT_RESULT_MS = 4 * 60 * 1000;
const AGENTS_TTL_MS = 60 * 1000;

const LOCAL_PENDING_ID = 'gen-local-pending';

export interface IGenerationHost {
  getChatId(): UUID | null;
  getAgentId(): string | null;
  hasAccess(): boolean;
  showAccessDenied(): void;
  getPatcher(): ChatPatcher | null;
}

/** Данные для заполнения формы («Повторить» / повтор после ошибки) */
export interface IGenerationPreset {
  prompt: string;
  negative_prompt?: string | null;
  params: Record<string, any>;
  media_inputs?: IGenerationMedia[];
}

interface IRefItem {
  id: number;
  status: 'uploading' | 'ready' | 'error';
  previewUrl: string | null;
  media: IGenerationMedia | null;
  error: string | null;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ru(name: any, fallback = ''): string {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  return name.ru || name.en || fallback;
}

function isGenerationMessage(msg: IMessage | null | undefined): boolean {
  const kind = (msg?.metadata as any)?.kind;
  return kind === 'generation' || kind === 'generation_request';
}

export class GenerationController {
  private host: IGenerationHost;

  private _agent: any = null;
  private _agentLoadedAt = 0;
  private _agentsPromise: Promise<any[]> | null = null;

  private _formOpen = false;
  private _mode = '';
  private _refs: IRefItem[] = [];
  private _refSeq = 0;
  private _objectUrls: string[] = [];

  private _inFlight = false;
  private _pendingPrompt = '';
  private _awaitingSince: number | null = null;
  private _pollTimer: ReturnType<typeof setTimeout> | null = null;
  private _polling = false;

  private _viewer: HTMLElement | null = null;

  constructor(host: IGenerationHost) {
    this.host = host;
  }

  // ==========================================
  // ПУБЛИЧНЫЙ ИНТЕРФЕЙС
  // ==========================================

  get isBusy(): boolean {
    return this._inFlight;
  }

  /** Открыть форму (с пресетом — для «Повторить») */
  async open(preset: IGenerationPreset | null = null, notice: string | null = null): Promise<void> {
    if (!this.host.hasAccess()) {
      this.host.showAccessDenied();
      return;
    }
    if (this._formOpen) return;
    if (this._inFlight) {
      this._toast('⏳ Дождитесь окончания текущей генерации', 'info');
      return;
    }
    if (!userStore.canSync()) {
      this._toast('Для генерации включите синхронизацию в настройках', 'warning');
      return;
    }

    this._formOpen = true;
    try {
      await this._renderForm(preset, notice);
    } catch (err) {
      this._formOpen = false;
      console.error('❌ [generation] Не удалось открыть форму:', err);
      this._toast('⚠️ Не удалось открыть форму генерации', 'error');
    }
  }

  close(): void {
    this._formOpen = false;
    document.getElementById('generation-form-overlay')?.remove();
    for (const url of this._objectUrls) URL.revokeObjectURL(url);
    this._objectUrls = [];
    this._refs = [];
  }

  /** Вызывается при уходе из чата / уничтожении модуля */
  stop(): void {
    this.close();
    this._closeViewer();
    this._stopPolling();
    this._removeLocalPlaceholder();
    this._awaitingSince = null;
  }

  /**
   * Оформляет блок сообщения, если это сообщение генерации.
   * Идемпотентно: повторный вызов с теми же данными ничего не перерисовывает.
   */
  decorate(msg: IMessage, block: HTMLElement): void {
    const meta = msg.metadata as any;
    if (!meta) return;

    if (meta.kind === 'generation_request') {
      this._decorateRequest(msg, block);
    } else if (meta.kind === 'generation') {
      this._decorateResult(msg, block);
    }
  }

  /** Привести DOM в соответствие с локальным хранилищем и запустить/остановить опрос */
  reconcile(): void {
    const chatId = this.host.getChatId();
    const patcher = this.host.getPatcher();
    if (!chatId || !patcher) return;

    const found = chatStore.findChatById(chatId);
    if (!found) return;

    for (const msg of found.chat.messages || []) {
      if (msg.deleted_at) continue;
      const el = document.getElementById(`msg-block-${msg.id}`);
      if (!el) {
        patcher.addMessage(msg);
      } else if (isGenerationMessage(msg)) {
        this.decorate(msg, el);
      }
    }
    this.syncPolling();
  }

  /** Запускает опрос чата, пока в нём есть живая генерация (или ждём потерянный ответ) */
  syncPolling(): void {
    // Вернулись в чат, пока запрос ещё выполняется: заглушку нужно показать снова
    if (this._inFlight && !document.getElementById(LOCAL_PENDING_ID)) {
      this._showLocalPlaceholder(this._pendingPrompt);
    }
    if (this._needsPolling()) {
      this._schedulePoll();
    } else {
      this._stopPolling();
    }
  }

  // ==========================================
  // ФОРМА
  // ==========================================

  private async _loadAgent(): Promise<any> {
    const agentId = this.host.getAgentId();
    if (!agentId) throw new Error('Нет агента');

    const fresh = this._agent && this._agent.id === agentId && Date.now() - this._agentLoadedAt < AGENTS_TTL_MS;
    if (fresh) return this._agent;

    if (!this._agentsPromise) {
      this._agentsPromise = fetchAgentsWithAccess()
        .then((data) => data.agents || [])
        .finally(() => {
          this._agentsPromise = null;
        });
    }
    const agents = await this._agentsPromise;
    const agent = agents.find((a: any) => a.id === agentId);
    if (!agent) throw new Error('Агент не найден');

    this._agent = agent;
    this._agentLoadedAt = Date.now();
    return agent;
  }

  private _config(): IGenerationConfig {
    return (this._agent?.generation_config as IGenerationConfig) || {};
  }

  private _modes(): IGenerationMode[] {
    const modes = this._config().modes;
    return Array.isArray(modes) ? modes : [];
  }

  private _currentMode(): IGenerationMode | null {
    return this._modes().find((m) => m.key === this._mode) || null;
  }

  private _modeAcceptsImages(mode: IGenerationMode | null): boolean {
    return !!mode && Array.isArray(mode.media_types) && mode.media_types.includes('image');
  }

  private _maxRefs(mode: IGenerationMode | null): number {
    const own = Number(mode?.max_media);
    const limit = Number.isFinite(own) && own > 0 ? own : REFERENCE_LIMITS.maxPerRequest;
    return Math.min(limit, REFERENCE_LIMITS.maxPerRequest);
  }

  private async _renderForm(preset: IGenerationPreset | null, notice: string | null): Promise<void> {
    document.getElementById('generation-form-overlay')?.remove();

    const agent = await this._loadAgent();
    const config = this._config();
    const modes = this._modes();

    const presetMode = typeof preset?.params?.mode === 'string' ? preset.params.mode : '';
    this._mode = modes.find((m) => m.key === presetMode)?.key || modes[0]?.key || '';

    this._refs = [];
    if (preset?.media_inputs?.length && this._modeAcceptsImages(this._currentMode())) {
      const limit = this._maxRefs(this._currentMode());
      for (const media of preset.media_inputs.slice(0, limit)) {
        this._refs.push({
          id: ++this._refSeq,
          status: 'ready',
          previewUrl: null,
          media: { ...media, url: undefined },
          error: null,
        });
      }
    }

    const negativeEnabled = !!config.negative_prompt?.enabled;
    const promptMax = Number(config.prompt?.max_length) || 4000;
    const negativeMax = Number(config.negative_prompt?.max_length) || 2000;

    const overlay = document.createElement('div');
    overlay.id = 'generation-form-overlay';
    overlay.className = 'gen-overlay';

    overlay.innerHTML = `
      <div id="generation-form" class="gen-sheet" role="dialog" aria-label="Генерация">
        <div class="gen-head">
          <div class="gen-title">${esc(ru(agent.name, 'Генерация'))}</div>
          <button type="button" id="gen-form-close" class="gen-close" aria-label="Закрыть">×</button>
        </div>
        <div id="gen-notice" class="gen-notice" hidden></div>
        <div id="gen-modes-wrap">${this._buildModesHtml(modes)}</div>
        <div id="gen-refs-wrap" class="gen-field" hidden>
          <div class="gen-label"><span id="gen-refs-title">Изображения</span></div>
          <div id="gen-refs" class="gen-refs"></div>
          <input type="file" id="gen-file-input" accept="${REFERENCE_LIMITS.mimes.join(',')}" multiple hidden />
        </div>
        <div class="gen-field">
          <div class="gen-label"><span>Запрос</span><span id="gen-prompt-count" class="gen-counter"></span></div>
          <textarea id="gen-prompt" class="gen-textarea" rows="4" maxlength="${promptMax}"
            placeholder="${esc(ru(config.prompt?.placeholder, 'Опишите, что нужно создать…'))}"></textarea>
        </div>
        ${negativeEnabled ? `
        <div class="gen-field">
          <div class="gen-label"><span>Чего не должно быть</span></div>
          <textarea id="gen-negative" class="gen-textarea" rows="2" maxlength="${negativeMax}"
            placeholder="${esc(ru(config.negative_prompt?.placeholder, 'Например: размытие, лишние пальцы, текст'))}"></textarea>
        </div>` : ''}
        <div id="gen-params">${this._buildParamsHtml(config.params || [], preset?.params || {})}</div>
        <div id="gen-hint" class="gen-hint"></div>
        <button type="button" id="gen-submit" class="gen-submit">Сгенерировать</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const promptEl = overlay.querySelector('#gen-prompt') as HTMLTextAreaElement;
    promptEl.value = preset?.prompt || '';
    const negativeEl = overlay.querySelector('#gen-negative') as HTMLTextAreaElement | null;
    if (negativeEl) negativeEl.value = preset?.negative_prompt || '';

    this._bindForm(overlay, promptMax);
    this._syncModeUi();
    this._renderRefs();
    this._resolveRefPreviews();
    this._setNotice(notice);
    this._refreshSubmit();
  }

  private _buildModesHtml(modes: IGenerationMode[]): string {
    if (modes.length === 0) return '';
    const buttons = modes
      .map(
        (m) => `<button type="button" class="gen-mode-btn${m.key === this._mode ? ' active' : ''}"
          data-mode="${esc(m.key)}">${esc(ru(m.label, m.key))}</button>`
      )
      .join('');
    return `<div id="gen-modes" class="gen-modes">${buttons}</div>
      <div id="gen-mode-desc" class="gen-mode-desc"></div>`;
  }

  private _buildParamsHtml(defs: IGenerationParam[], values: Record<string, any>): string {
    if (!Array.isArray(defs) || defs.length === 0) return '';

    return defs
      .map((p) => {
        const label = esc(ru(p.label, p.key)) + (p.required ? ' *' : '');
        const key = esc(p.key);
        const has = Object.prototype.hasOwnProperty.call(values, p.key);
        const value = has ? values[p.key] : p.default;

        if (p.type === 'select' && Array.isArray(p.options)) {
          const options = p.options
            .map((o) => {
              const val = typeof o === 'string' ? o : o.value;
              const text = typeof o === 'string' ? o : ru(o.label, o.value);
              const selected = String(val) === String(value) ? ' selected' : '';
              return `<option value="${esc(val)}"${selected}>${esc(text)}</option>`;
            })
            .join('');
          return `<div class="gen-field"><div class="gen-label"><span>${label}</span></div>
            <select class="gen-input" data-param="${key}" data-type="select">${options}</select></div>`;
        }

        if (p.type === 'slider') {
          const min = Number.isFinite(Number(p.min)) ? Number(p.min) : 0;
          const max = Number.isFinite(Number(p.max)) ? Number(p.max) : 100;
          const step = Number(p.step) > 0 ? Number(p.step) : 1;
          const current = value === undefined || value === null || value === '' ? min : Number(value);
          return `<div class="gen-field"><div class="gen-label"><span>${label}</span>
            <span class="gen-counter" data-slider-value="${key}">${esc(current)}</span></div>
            <input type="range" class="gen-range" data-param="${key}" data-type="slider"
              min="${min}" max="${max}" step="${step}" value="${esc(current)}" /></div>`;
        }

        if (p.type === 'number') {
          const attrs = [
            Number.isFinite(Number(p.min)) && p.min !== undefined ? `min="${Number(p.min)}"` : '',
            Number.isFinite(Number(p.max)) && p.max !== undefined ? `max="${Number(p.max)}"` : '',
            Number(p.step) > 0 ? `step="${Number(p.step)}"` : '',
          ].join(' ');
          return `<div class="gen-field"><div class="gen-label"><span>${label}</span></div>
            <input type="number" class="gen-input" data-param="${key}" data-type="number" ${attrs}
              value="${esc(value ?? '')}" /></div>`;
        }

        if (p.type === 'boolean') {
          return `<label class="gen-check"><input type="checkbox" data-param="${key}" data-type="boolean"
            ${value ? 'checked' : ''} /><span>${label}</span></label>`;
        }

        return `<div class="gen-field"><div class="gen-label"><span>${label}</span></div>
          <input type="text" class="gen-input" data-param="${key}" data-type="text"
            value="${esc(value ?? '')}" placeholder="${esc(ru(p.placeholder))}" /></div>`;
      })
      .join('');
  }

  private _bindForm(overlay: HTMLElement, promptMax: number): void {
    overlay.querySelector('#gen-form-close')?.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    overlay.querySelector('#gen-submit')?.addEventListener('click', () => this._submit());

    const promptEl = overlay.querySelector('#gen-prompt') as HTMLTextAreaElement;
    const counter = overlay.querySelector('#gen-prompt-count') as HTMLElement;
    const updateCounter = () => {
      counter.textContent = `${promptEl.value.length}/${promptMax}`;
    };
    promptEl.addEventListener('input', () => {
      updateCounter();
      this._refreshSubmit();
    });
    updateCounter();

    overlay.querySelectorAll('#gen-params [data-param]').forEach((el) => {
      el.addEventListener('input', () => {
        const input = el as HTMLInputElement;
        if (input.dataset.type === 'slider') {
          const out = overlay.querySelector(`[data-slider-value="${input.dataset.param}"]`);
          if (out) out.textContent = input.value;
        }
        this._refreshSubmit();
      });
      el.addEventListener('change', () => this._refreshSubmit());
    });

    overlay.querySelectorAll('.gen-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).dataset.mode || '';
        if (key === this._mode) return;
        this._mode = key;
        overlay.querySelectorAll('.gen-mode-btn').forEach((b) => {
          b.classList.toggle('active', (b as HTMLElement).dataset.mode === key);
        });
        this._syncModeUi();
        this._refreshSubmit();
      });
    });

    const fileInput = overlay.querySelector('#gen-file-input') as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = '';
      this._addFiles(files);
    });
  }

  /** Подпись режима, видимость и лимиты блока референсов */
  private _syncModeUi(): void {
    const mode = this._currentMode();
    const desc = document.getElementById('gen-mode-desc');
    if (desc) desc.textContent = ru(mode?.description);

    const accepts = this._modeAcceptsImages(mode);
    const wrap = document.getElementById('gen-refs-wrap');
    if (wrap) wrap.hidden = !accepts;

    if (!accepts) {
      this._dropAllRefs();
    } else {
      const max = this._maxRefs(mode);
      const title = document.getElementById('gen-refs-title');
      if (title) {
        const need = mode?.requires_media ? 'обязательно, ' : '';
        title.textContent = `Изображения (${need}до ${max})`;
      }
      // Лишние референсы режима с меньшим лимитом убираем с конца
      while (this._refs.length > max) this._removeRef(this._refs[this._refs.length - 1].id, false);
      this._renderRefs();
    }
  }

  // ==========================================
  // РЕФЕРЕНСЫ
  // ==========================================

  private _addFiles(files: File[]): void {
    const mode = this._currentMode();
    if (!this._modeAcceptsImages(mode) || files.length === 0) return;

    const agentId = this.host.getAgentId();
    if (!agentId) return;

    const free = this._maxRefs(mode) - this._refs.length;
    if (free <= 0) {
      this._setNotice(`Можно добавить не более ${this._maxRefs(mode)} изображений`);
      return;
    }

    const accepted = files.slice(0, free);
    if (files.length > free) {
      this._setNotice(`Добавлено ${free} из ${files.length}: лимит режима — ${this._maxRefs(mode)}`);
    } else {
      this._setNotice(null);
    }

    for (const file of accepted) {
      const invalid = validateReferenceFile(file);
      const item: IRefItem = {
        id: ++this._refSeq,
        status: invalid ? 'error' : 'uploading',
        previewUrl: null,
        media: null,
        error: invalid,
      };
      if (!invalid) {
        const url = URL.createObjectURL(file);
        this._objectUrls.push(url);
        item.previewUrl = url;
      }
      this._refs.push(item);

      if (!invalid) {
        const modeKey = this._mode;
        uploadReference(file, agentId, modeKey)
          .then((uploaded) => {
            if (!this._refs.includes(item)) return;
            item.status = 'ready';
            item.media = {
              type: uploaded.type,
              storage_path: uploaded.storage_path,
              mime: uploaded.mime,
              size_bytes: uploaded.size_bytes,
            };
            this._renderRefs();
            this._refreshSubmit();
          })
          .catch((err) => {
            if (!this._refs.includes(item)) return;
            item.status = 'error';
            item.error = (err as Error).message || 'Не удалось загрузить';
            this._renderRefs();
            this._refreshSubmit();
          });
      }
    }

    this._renderRefs();
    this._refreshSubmit();
  }

  private _removeRef(id: number, rerender = true): void {
    this._refs = this._refs.filter((r) => r.id !== id);
    if (rerender) {
      this._renderRefs();
      this._refreshSubmit();
    }
  }

  private _dropAllRefs(): void {
    this._refs = [];
    this._renderRefs();
  }

  private _renderRefs(): void {
    const box = document.getElementById('gen-refs');
    if (!box) return;
    box.innerHTML = '';

    for (const ref of this._refs) {
      const tile = document.createElement('div');
      tile.className = `gen-ref gen-ref--${ref.status}`;

      if (ref.previewUrl) {
        const img = document.createElement('img');
        img.src = ref.previewUrl;
        img.alt = '';
        tile.appendChild(img);
      }
      if (ref.status === 'uploading') {
        const spin = document.createElement('div');
        spin.className = 'gen-ref-state';
        spin.textContent = '⏳';
        tile.appendChild(spin);
      }
      if (ref.status === 'error') {
        const err = document.createElement('div');
        err.className = 'gen-ref-state';
        err.textContent = '⚠️';
        err.title = ref.error || '';
        tile.appendChild(err);
        tile.addEventListener('click', () => this._setNotice(ref.error || 'Не удалось загрузить файл'));
      }

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'gen-ref-del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Убрать');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeRef(ref.id);
      });
      tile.appendChild(del);

      box.appendChild(tile);
    }

    const mode = this._currentMode();
    if (this._refs.length < this._maxRefs(mode)) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'gen-ref gen-ref-add';
      add.textContent = '+';
      add.setAttribute('aria-label', 'Добавить изображение');
      add.addEventListener('click', () => {
        (document.getElementById('gen-file-input') as HTMLInputElement | null)?.click();
      });
      box.appendChild(add);
    }
  }

  /** Превью для референсов из пресета: подписанные ссылки */
  private _resolveRefPreviews(): void {
    const pending = this._refs.filter((r) => !r.previewUrl && r.media?.storage_path);
    if (pending.length === 0) return;

    resolveMediaUrls(pending.map((r) => r.media!.storage_path)).then((urls) => {
      let changed = false;
      for (const ref of pending) {
        const url = urls[ref.media!.storage_path];
        if (url && this._refs.includes(ref)) {
          ref.previewUrl = url;
          changed = true;
        }
      }
      if (changed) this._renderRefs();
    });
  }

  // ==========================================
  // СБОР ДАННЫХ И ПРОВЕРКА
  // ==========================================

  private _collectParams(): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {};
    if (this._mode) params.mode = this._mode;

    document.querySelectorAll('#gen-params [data-param]').forEach((node) => {
      const el = node as HTMLInputElement;
      const key = el.dataset.param;
      if (!key) return;
      switch (el.dataset.type) {
        case 'boolean':
          params[key] = el.checked;
          break;
        case 'number':
        case 'slider':
          if (el.value !== '') params[key] = Number(el.value);
          break;
        default:
          if (el.value !== '') params[key] = el.value;
      }
    });
    return params;
  }

  private _readPrompt(): string {
    return ((document.getElementById('gen-prompt') as HTMLTextAreaElement | null)?.value || '').trim();
  }

  private _readNegative(): string {
    return ((document.getElementById('gen-negative') as HTMLTextAreaElement | null)?.value || '').trim();
  }

  private _readyRefs(): IGenerationMedia[] {
    return this._refs
      .filter((r) => r.status === 'ready' && r.media)
      .map((r) => ({ ...(r.media as IGenerationMedia), url: undefined }));
  }

  /** Возвращает причину, по которой нельзя отправлять, или null */
  private _blockReason(): string | null {
    if (!this._readPrompt()) return 'Введите запрос';

    const mode = this._currentMode();
    if (this._modeAcceptsImages(mode)) {
      if (this._refs.some((r) => r.status === 'uploading')) return 'Дождитесь загрузки изображений';
      if (this._refs.some((r) => r.status === 'error')) return 'Уберите изображения с ошибкой';
      if (mode?.requires_media && this._readyRefs().length === 0) return 'Добавьте хотя бы одно изображение';
    }

    for (const def of this._config().params || []) {
      if (!def.required) continue;
      const el = document.querySelector(`#gen-params [data-param="${def.key}"]`) as HTMLInputElement | null;
      if (el && el.dataset.type !== 'boolean' && el.value === '') {
        return `Заполните: ${ru(def.label, def.key)}`;
      }
    }

    const balances = economyStore.getTokenBalances();
    const cost = this._estimateCost();
    if (!balances.bypass && balances.total < cost) return 'Недостаточно энергии';

    return null;
  }

  private _estimateCost(): number {
    const agent = this._agent;
    if (!agent) return 0;
    const tier = (userStore as any)._data?.subscription_tier || 'trial';
    const byTier = Number(agent.markup_by_tier?.[tier]);
    const fallback = Number(agent.markup_coefficient);
    const markup =
      Number.isFinite(byTier) && byTier > 0 ? byTier : Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
    const min = Number(agent.min_charge) || 1;
    return Math.max(Math.ceil(min * markup), min);
  }

  private _refreshSubmit(): void {
    const btn = document.getElementById('gen-submit') as HTMLButtonElement | null;
    const hint = document.getElementById('gen-hint');
    if (!btn) return;

    const reason = this._blockReason();
    btn.disabled = !!reason || this._inFlight;
    btn.textContent = `Сгенерировать ⚡ ${this._estimateCost()}`;
    if (hint) hint.textContent = reason && this._readPrompt() ? reason : '';
  }

  private _setNotice(text: string | null): void {
    const el = document.getElementById('gen-notice');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  // ==========================================
  // ОТПРАВКА
  // ==========================================

  private async _submit(): Promise<void> {
    if (this._inFlight) return;

    const reason = this._blockReason();
    if (reason) {
      this._setNotice(reason);
      return;
    }

    const chatId = this.host.getChatId();
    const agentId = this.host.getAgentId();
    if (!chatId || !agentId) return;

    const preset: IGenerationPreset = {
      prompt: this._readPrompt(),
      negative_prompt: this._readNegative() || null,
      params: this._collectParams(),
      media_inputs: this._readyRefs(),
    };

    const body: ICreateGenerationRequest = {
      agent_id: agentId,
      chat_id: chatId,
      prompt: preset.prompt,
      params: preset.params as any,
      media_inputs: (preset.media_inputs || []).map((m) => ({ storage_path: m.storage_path })),
    };
    if (preset.negative_prompt) body.negative_prompt = preset.negative_prompt;

    this._inFlight = true;
    const startedAt = Date.now();
    this.close();
    this._showLocalPlaceholder(preset.prompt);

    try {
      const ensured = await chatService.ensureRemoteChat(chatId);
      if (!ensured) throw new Error('Не удалось подготовить чат на сервере');

      const res = await apiClient.post<ICreateGenerationResponse>('/generations/create', body, {
        timeout: REQUEST_TIMEOUT_MS,
        retries: 1,
      });
      if (!res?.success) throw new Error(res?.error || 'Ошибка генерации');

      this._applyServerMessages(chatId, [res.request_message, res.message]);
      if (!res.request_message || !res.message) {
        // Сервер не смог перечитать строки — подтягиваем чат целиком
        await chatService.getChat(chatId);
      }
      this._removeLocalPlaceholder();
      this.reconcile();
      this._refreshEnergy();
    } catch (err) {
      this._removeLocalPlaceholder();
      this._inFlight = false;
      this._handleSubmitError(err, preset, startedAt);
    } finally {
      this._inFlight = false;
      this.syncPolling();
    }
  }

  private _handleSubmitError(err: unknown, preset: IGenerationPreset, startedAt: number): void {
    const e = err as Error & { status?: number };

    if (err instanceof ApiError) {
      // 4xx: запрос не принят (занят чат, нет энергии, не прошла валидация) — вернуть форму
      const message = e.status === 409 ? '⏳ Предыдущий запрос в этом чате ещё выполняется. Дождитесь ответа.' : e.message;
      this.open(preset, message);
      return;
    }

    if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || e instanceof TypeError) {
      // Связь оборвалась, а сервер мог продолжить работу — ждём результат в чате
      this._awaitingSince = startedAt;
      this._toast('Запрос выполняется дольше обычного. Результат появится в чате.', 'info', 3500);
      return;
    }

    this.open(preset, e?.message || 'Не удалось отправить запрос');
  }

  private _applyServerMessages(chatId: UUID, rows: Array<any | undefined>): void {
    for (const row of rows) {
      if (!row?.id) continue;
      chatStore.upsertMessage(chatId, {
        id: row.id,
        text: row.text,
        type: row.msg_type || row.type,
        isFavorite: !!row.is_favorite,
        created_at: row.created_at,
        deleted_at: row.deleted_at || null,
        metadata: row.metadata || null,
      });
    }
  }

  private async _refreshEnergy(): Promise<void> {
    try {
      await economyStore.loadBalances();
      eventBus.emit('economy:tokens:updated', economyStore.getTokenBalances());
    } catch (err) {
      console.warn('⚠️ [generation] Не удалось обновить баланс:', (err as Error).message);
    }
  }

  // ==========================================
  // ОПРОС
  // ==========================================

  private _liveGenerations(): IMessage[] {
    const chatId = this.host.getChatId();
    if (!chatId) return [];
    const found = chatStore.findChatById(chatId);
    if (!found) return [];
    return (found.chat.messages || []).filter((m) => !m.deleted_at && this._isLive(m));
  }

  private _isLive(msg: IMessage): boolean {
    const meta = msg.metadata as any;
    if (meta?.kind !== 'generation') return false;
    if (meta.status !== 'pending' && meta.status !== 'processing') return false;
    return !this._isStale(msg);
  }

  private _isStale(msg: IMessage): boolean {
    const created = new Date(msg.created_at || 0).getTime();
    return Date.now() - created >= STALE_AFTER_MS;
  }

  private _needsPolling(): boolean {
    if (!this.host.getChatId() || !userStore.canSync()) return false;
    if (this._awaitingSince !== null) {
      if (Date.now() - this._awaitingSince < AWAIT_RESULT_MS) return true;
      this._awaitingSince = null;
    }
    return !this._inFlight && this._liveGenerations().length > 0;
  }

  private _schedulePoll(): void {
    if (this._pollTimer || this._polling) return;
    this._pollTimer = setTimeout(() => {
      this._pollTimer = null;
      this._poll();
    }, POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
  }

  private async _poll(): Promise<void> {
    const chatId = this.host.getChatId();
    if (!chatId || this._polling) return;

    this._polling = true;
    try {
      await chatService.getChat(chatId);
    } catch (err) {
      console.warn('⚠️ [generation] Опрос чата не удался:', (err as Error).message);
    } finally {
      this._polling = false;
    }

    // За время запроса пользователь мог уйти в другой чат
    if (this.host.getChatId() !== chatId) return;

    if (this._awaitingSince !== null && this._hasFinishedSince(chatId, this._awaitingSince)) {
      this._awaitingSince = null;
      this._refreshEnergy();
    }
    this.reconcile();
  }

  private _hasFinishedSince(chatId: UUID, since: number): boolean {
    const found = chatStore.findChatById(chatId);
    if (!found) return false;
    return (found.chat.messages || []).some((m) => {
      const meta = m.metadata as any;
      return (
        meta?.kind === 'generation' &&
        (meta.status === 'done' || meta.status === 'failed') &&
        new Date(m.created_at || 0).getTime() >= since - 5000
      );
    });
  }

  // ==========================================
  // КАРТОЧКИ В ЧАТЕ
  // ==========================================

  private _contentSlot(block: HTMLElement): HTMLElement {
    // Первый потомок, который не панель действий: сюда рендерер кладёт текст
    const slot = Array.from(block.children).find((c) => !c.classList.contains('msg-actions'));
    if (slot) return slot as HTMLElement;
    const created = document.createElement('div');
    block.insertBefore(created, block.firstChild);
    return created;
  }

  private _decorateRequest(msg: IMessage, block: HTMLElement): void {
    const meta = msg.metadata as any;
    const refs: IGenerationMedia[] = Array.isArray(meta.media_inputs) ? meta.media_inputs : [];
    const negative: string = meta.negative_prompt || '';

    const sig = `req|${refs.map((r) => r.storage_path).join(',')}|${negative}`;
    if (block.dataset.genSig === sig) return;
    block.dataset.genSig = sig;

    block.querySelector('.gen-req-extra')?.remove();
    if (refs.length === 0 && !negative) return;

    const extra = document.createElement('div');
    extra.className = 'gen-req-extra';

    if (negative) {
      const neg = document.createElement('div');
      neg.className = 'gen-req-negative';
      neg.textContent = `Без: ${negative}`;
      extra.appendChild(neg);
    }

    if (refs.length > 0) {
      const row = document.createElement('div');
      row.className = 'gen-req-thumbs';
      const imgs: Array<{ path: string; img: HTMLImageElement }> = [];
      for (const ref of refs) {
        const img = document.createElement('img');
        img.className = 'gen-thumb';
        img.alt = '';
        img.loading = 'lazy';
        row.appendChild(img);
        imgs.push({ path: ref.storage_path, img });
      }
      extra.appendChild(row);

      resolveMediaUrls(imgs.map((i) => i.path)).then((urls) => {
        for (const { path, img } of imgs) {
          if (urls[path]) img.src = urls[path];
        }
      });
    }

    const del = block.querySelector('.msg-delete-btn');
    if (del) block.insertBefore(extra, del);
    else block.appendChild(extra);
  }

  private _decorateResult(msg: IMessage, block: HTMLElement): void {
    const meta = msg.metadata as any;
    const status: string = meta.status || 'pending';
    const stale = (status === 'pending' || status === 'processing') && this._isStale(msg);
    const media: IGenerationMedia[] = Array.isArray(meta.media) ? meta.media : [];

    const sig = `res|${status}|${stale ? 's' : ''}|${media.map((m) => m.storage_path).join(',')}|${meta.error || ''}`;
    if (block.dataset.genSig === sig) return;
    block.dataset.genSig = sig;

    if (status === 'pending' || status === 'processing') {
      this._removeLocalPlaceholder();
    }

    const slot = this._contentSlot(block);
    slot.innerHTML = '';
    slot.appendChild(this._buildResultCard(msg, status, stale, media));
  }

  private _buildResultCard(msg: IMessage, status: string, stale: boolean, media: IGenerationMedia[]): HTMLElement {
    const meta = msg.metadata as any;
    const card = document.createElement('div');
    card.className = 'generation-card';

    if ((status === 'pending' || status === 'processing') && !stale) {
      card.appendChild(this._statusBlock('⏳', 'Генерируется…', meta.prompt));
      return card;
    }

    if (stale) {
      card.appendChild(this._statusBlock('⚠️', 'Генерация прервана', meta.prompt));
      card.appendChild(this._actionsRow(msg, false));
      return card;
    }

    if (status === 'failed' || media.length === 0) {
      card.appendChild(this._statusBlock('⚠️', 'Не удалось сгенерировать', meta.error || meta.prompt));
      card.appendChild(this._actionsRow(msg, false));
      return card;
    }

    const first = media[0];
    const holder = document.createElement('div');
    holder.className = 'gen-media gen-skeleton';
    card.appendChild(holder);

    this._mountMedia(holder, first, () => this.openViewer(msg));

    if (media.length > 1) {
      const more = document.createElement('div');
      more.className = 'gen-more';
      more.textContent = `+${media.length - 1}`;
      holder.appendChild(more);
    }

    if (meta.prompt) {
      const caption = document.createElement('div');
      caption.className = 'gen-caption';
      caption.textContent = meta.prompt;
      card.appendChild(caption);
    }
    card.appendChild(this._actionsRow(msg, true));
    return card;
  }

  private _statusBlock(icon: string, title: string, detail?: string): HTMLElement {
    const box = document.createElement('div');
    box.className = 'gen-status';
    const i = document.createElement('div');
    i.className = 'gen-status-icon';
    i.textContent = icon;
    const t = document.createElement('div');
    t.className = 'gen-status-title';
    t.textContent = title;
    box.append(i, t);
    if (detail) {
      const d = document.createElement('div');
      d.className = 'gen-status-detail';
      d.textContent = detail;
      box.appendChild(d);
    }
    return box;
  }

  private _actionsRow(msg: IMessage, withOpen: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'gen-actions';

    if (withOpen) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'gen-btn';
      open.textContent = 'Открыть';
      open.addEventListener('click', () => this.openViewer(msg));
      row.appendChild(open);
    }

    const repeat = document.createElement('button');
    repeat.type = 'button';
    repeat.className = 'gen-btn gen-btn-primary';
    repeat.textContent = 'Повторить';
    repeat.addEventListener('click', () => this.open(this._presetFromMessage(msg)));
    row.appendChild(repeat);
    return row;
  }

  /** Подставляет в контейнер картинку / видео / аудио по подписанной ссылке */
  private _mountMedia(holder: HTMLElement, media: IGenerationMedia, onClick?: () => void, autoplay = false): void {
    resolveMediaUrls([media.storage_path]).then((urls) => {
      const url = urls[media.storage_path];
      if (!url || !holder.isConnected) {
        if (!url) holder.classList.add('gen-media-failed');
        return;
      }
      holder.classList.remove('gen-skeleton');

      let el: HTMLElement;
      if (media.type === 'video') {
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.autoplay = autoplay;
        el = v;
      } else if (media.type === 'audio') {
        const a = document.createElement('audio');
        a.src = url;
        a.controls = true;
        a.autoplay = autoplay;
        el = a;
      } else {
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = url;
        let retried = false;
        img.addEventListener('error', () => {
          // Ссылка могла истечь — один раз перевыпускаем
          if (retried) {
            holder.classList.add('gen-media-failed');
            return;
          }
          retried = true;
          forgetMediaUrl(media.storage_path);
          resolveMediaUrls([media.storage_path]).then((fresh) => {
            if (fresh[media.storage_path]) img.src = fresh[media.storage_path];
          });
        });
        if (onClick) img.addEventListener('click', onClick);
        el = img;
      }
      holder.insertBefore(el, holder.firstChild);
    });
  }

  // ==========================================
  // ЛОКАЛЬНАЯ ЗАГЛУШКА (пока идёт запрос)
  // ==========================================

  private _showLocalPlaceholder(prompt: string): void {
    this._pendingPrompt = prompt;
    this._removeLocalPlaceholder();
    const container = document.getElementById('chat-container');
    if (!container) return;

    const block = document.createElement('div');
    block.id = LOCAL_PENDING_ID;
    block.className = 'msg ai-msg';
    const card = document.createElement('div');
    card.className = 'generation-card';
    card.appendChild(this._statusBlock('⏳', 'Генерируется…', prompt));
    block.appendChild(card);
    container.appendChild(block);
    container.scrollTop = container.scrollHeight;
  }

  private _removeLocalPlaceholder(): void {
    document.getElementById(LOCAL_PENDING_ID)?.remove();
  }

  // ==========================================
  // ПРОСМОТРЩИК
  // ==========================================

  private _presetFromMessage(msg: IMessage): IGenerationPreset {
    const meta = (msg.metadata as any) || {};
    return {
      prompt: meta.prompt || '',
      negative_prompt: meta.negative_prompt || null,
      params: meta.params || {},
      media_inputs: Array.isArray(meta.media_inputs) ? meta.media_inputs : [],
    };
  }

  openViewer(msg: IMessage): void {
    const meta = (msg.metadata as any) || {};
    const media: IGenerationMedia[] = Array.isArray(meta.media) ? meta.media : [];
    if (media.length === 0) return;

    this._closeViewer();

    const overlay = document.createElement('div');
    overlay.className = 'gen-viewer';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'gen-viewer-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Закрыть');
    close.addEventListener('click', () => this._closeViewer());

    const scroller = document.createElement('div');
    scroller.className = 'gen-viewer-body';

    for (const item of media) {
      const holder = document.createElement('div');
      holder.className = 'gen-media gen-skeleton gen-media-large';
      scroller.appendChild(holder);
      this._mountMedia(holder, item, undefined, media.length === 1);
    }

    const info = document.createElement('div');
    info.className = 'gen-viewer-info';
    if (meta.prompt) info.appendChild(this._infoLine('Запрос', meta.prompt));
    if (meta.negative_prompt) info.appendChild(this._infoLine('Без', meta.negative_prompt));
    if (Object.keys(meta.params || {}).length > 0) {
      const row = this._infoLine('Параметры', this._paramsText(meta.params));
      info.appendChild(row);
      // Подписи параметров берём из конфигурации агента — она может быть ещё не загружена
      this._loadAgent()
        .then(() => {
          if (row.isConnected) row.replaceWith(this._infoLine('Параметры', this._paramsText(meta.params)));
        })
        .catch(() => {});
    }
    if (Array.isArray(meta.media_inputs) && meta.media_inputs.length > 0) {
      info.appendChild(this._infoLine('Референсы', String(meta.media_inputs.length)));
    }
    scroller.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'gen-viewer-actions';

    const repeat = document.createElement('button');
    repeat.type = 'button';
    repeat.className = 'gen-btn gen-btn-primary';
    repeat.textContent = 'Повторить';
    repeat.addEventListener('click', () => {
      this._closeViewer();
      this.open(this._presetFromMessage(msg));
    });

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'gen-btn';
    download.textContent = 'Скачать';
    download.addEventListener('click', () => this._download(media));

    actions.append(repeat, download);
    overlay.append(close, scroller, actions);
    document.body.appendChild(overlay);
    this._viewer = overlay;
  }

  private _closeViewer(): void {
    this._viewer?.remove();
    this._viewer = null;
  }

  private _infoLine(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'gen-info-row';
    const l = document.createElement('span');
    l.className = 'gen-info-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    row.append(l, v);
    return row;
  }

  private _paramsText(params: Record<string, any>): string {
    const defs = this._config().params || [];
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key === 'mode') {
        const mode = this._modes().find((m) => m.key === value);
        parts.push(ru(mode?.label, String(value)));
        continue;
      }
      const def = defs.find((d) => d.key === key);
      let shown: string;
      if (typeof value === 'boolean') {
        shown = value ? 'да' : 'нет';
      } else {
        const option = (def?.options || []).find((o: any) => (typeof o === 'string' ? o : o.value) === String(value));
        shown = option && typeof option !== 'string' ? ru(option.label, String(value)) : String(value);
      }
      parts.push(`${ru(def?.label, key)}: ${shown}`);
    }
    return parts.join(' · ');
  }

  private async _download(media: IGenerationMedia[]): Promise<void> {
    const urls = await resolveMediaUrls(media.map((m) => m.storage_path));
    const tg = (window as any).Telegram?.WebApp;

    for (const item of media) {
      const base = urls[item.storage_path];
      if (!base) continue;
      const fileName = item.storage_path.split('/').pop() || 'generation';
      const url = `${base}${base.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;

      if (typeof tg?.downloadFile === 'function') {
        try {
          tg.downloadFile({ url, file_name: fileName });
          continue;
        } catch (err) {
          console.warn('⚠️ [generation] Telegram downloadFile не сработал:', (err as Error).message);
        }
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // ==========================================
  // ПРОЧЕЕ
  // ==========================================

  private _toast(text: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration = 2500): void {
    uiRenderer.showToast(text, type, duration);
  }
}
