// ============================================
// src/modules/organizer/OrganizerModule.ts
// Модуль органайзера с вкладками
// Версия: 4.0.2 - FIXED TYPES
// ============================================

import { headerManager } from '@/core/header-manager';
import { organizerStore } from '@/store/OrganizerStore';
import { organizerService } from '@/services/organizer';
import { chatStore } from '@/store/ChatStore';
import { eventBus } from '@/core/event-bus';
import type { TopicId } from '@types';

export class OrganizerModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _activeTab: 'todo' | 'reminders' | 'trackers' = 'todo';
  private headerManager = headerManager;
  private organizerStore = organizerStore;
  private organizerService = organizerService;
  private chatStore = chatStore;
  private eventBus = eventBus;
  private _subscriptions: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).organizerModule = this;

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this.container.innerHTML = `
      <div style="padding: 16px; flex:1; overflow-y:auto; padding-bottom: 80px; display:flex; flex-direction:column; height:100%;">
        <h2 style="font-size:18px; font-weight:700; margin:0 0 16px 0; color:var(--app-text-primary); display:flex; align-items:center; gap:8px;">
          <i data-lucide="layout-dashboard" style="width:24px;height:24px;"></i>
          Органайзер
        </h2>

        <div style="display:flex; gap:4px; background:var(--app-bg-tertiary); border-radius:12px; padding:4px; margin-bottom:16px; flex-shrink:0;">
          <button class="organizer-tab ${this._activeTab === 'todo' ? 'active' : ''}" 
                  data-tab="todo" 
                  onclick="window.organizerModule.switchTab('todo')"
                  style="flex:1; padding:8px 12px; border:none; border-radius:8px; background:${this._activeTab === 'todo' ? 'var(--app-accent-primary)' : 'transparent'}; color:${this._activeTab === 'todo' ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)'}; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s ease; display:flex; align-items:center; justify-content:center; gap:6px;">
            <i data-lucide="check-square" style="width:16px;height:16px;"></i>
            Задачи
          </button>
          <button class="organizer-tab ${this._activeTab === 'reminders' ? 'active' : ''}" 
                  data-tab="reminders" 
                  onclick="window.organizerModule.switchTab('reminders')"
                  style="flex:1; padding:8px 12px; border:none; border-radius:8px; background:${this._activeTab === 'reminders' ? 'var(--app-accent-primary)' : 'transparent'}; color:${this._activeTab === 'reminders' ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)'}; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s ease; display:flex; align-items:center; justify-content:center; gap:6px;">
            <i data-lucide="clock" style="width:16px;height:16px;"></i>
            Будильники
          </button>
          <button class="organizer-tab ${this._activeTab === 'trackers' ? 'active' : ''}" 
                  data-tab="trackers" 
                  onclick="window.organizerModule.switchTab('trackers')"
                  style="flex:1; padding:8px 12px; border:none; border-radius:8px; background:${this._activeTab === 'trackers' ? 'var(--app-accent-primary)' : 'transparent'}; color:${this._activeTab === 'trackers' ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)'}; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s ease; display:flex; align-items:center; justify-content:center; gap:6px;">
            <i data-lucide="bar-chart-3" style="width:16px;height:16px;"></i>
            Трекеры
          </button>
        </div>

        <div id="organizer-tab-content" style="flex:1; overflow-y:auto; animation:fadeIn 0.2s ease;">
          <!-- To-Do -->
          <div id="organizer-todo" class="organizer-tab-panel" style="${this._activeTab === 'todo' ? 'display:block;' : 'display:none;'}">
            <div style="background:var(--app-bg-secondary); padding:16px; border-radius:16px; border:1px solid var(--app-border-color-light);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700; font-size:15px; color:var(--app-text-primary);">📋 To-Do List</span>
                <span style="font-size:12px; font-weight:600; color:var(--app-text-tertiary);" id="organizer-todo-counter">0/0</span>
              </div>
              <div style="display:flex; gap:8px; margin-bottom:12px;">
                <input type="text" id="organizer-todo-input" placeholder="Добавить задачу..." style="flex:1; padding:10px; border-radius:10px; border:1px solid var(--app-border-color); background:var(--app-bg-tertiary); color:var(--app-text-primary); font-size:13px; outline:none;">
                <button class="btn" style="padding:10px 14px; border-radius:10px; font-size:13px;" onclick="window.organizerModule.addTodo()">➕</button>
              </div>
              <div id="organizer-todo-list" style="display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto;"></div>
            </div>
          </div>

          <!-- Напоминания -->
          <div id="organizer-reminders" class="organizer-tab-panel" style="${this._activeTab === 'reminders' ? 'display:block;' : 'display:none;'}">
            <div style="background:var(--app-bg-secondary); padding:16px; border-radius:16px; border:1px solid var(--app-border-color-light);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700; font-size:15px; color:var(--app-text-primary);">⏰ Напоминания</span>
                <span style="font-size:12px; font-weight:600; color:var(--app-text-tertiary);" id="organizer-reminder-counter">В ожидании: 0</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; background:var(--app-bg-tertiary); padding:12px; border-radius:12px;">
                <input type="text" id="organizer-reminder-input" placeholder="О чем напомнить?..." style="padding:10px; border-radius:8px; border:1px solid var(--app-border-color); background:var(--app-bg-secondary); color:var(--app-text-primary); font-size:13px; outline:none;">
                <div style="display:flex; gap:6px;">
                  <input type="date" id="organizer-reminder-date" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--app-border-color); background:var(--app-bg-secondary); color:var(--app-text-primary); font-size:12px; outline:none;">
                  <input type="time" id="organizer-reminder-time" style="width:90px; padding:8px; border-radius:8px; border:1px solid var(--app-border-color); background:var(--app-bg-secondary); color:var(--app-text-primary); font-size:12px; outline:none;">
                </div>
                <button class="btn" style="padding:10px; border-radius:8px; font-size:13px; font-weight:600;" onclick="window.organizerModule.createReminder()">🔔 Поставить будильник</button>
              </div>
              <div id="organizer-reminder-list" style="display:flex; flex-direction:column; gap:8px; max-height:350px; overflow-y:auto;"></div>
            </div>
          </div>

          <!-- Трекеры -->
          <div id="organizer-trackers" class="organizer-tab-panel" style="${this._activeTab === 'trackers' ? 'display:block;' : 'display:none;'}">
            <div style="background:var(--app-bg-secondary); padding:16px; border-radius:16px; border:1px solid var(--app-border-color-light);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700; font-size:15px; color:var(--app-text-primary);">📊 Lifestyle-Трекеры</span>
                <button class="btn" style="padding:4px 12px; font-size:11px; border-radius:8px;" onclick="window.organizerModule.showCreateTracker()">➕ Создать цель</button>
              </div>
              <div id="organizer-tracker-form" style="display:none; flex-direction:column; gap:8px; background:var(--app-bg-tertiary); padding:12px; border-radius:12px; margin-bottom:12px;">
                <input type="text" id="organizer-tracker-title" placeholder="Название цели..." style="padding:10px; border-radius:8px; border:1px solid var(--app-border-color); background:var(--app-bg-secondary); color:var(--app-text-primary); font-size:13px; outline:none;">
                <select id="organizer-tracker-tone" style="padding:10px; border-radius:8px; border:1px solid var(--app-border-color); background:var(--app-bg-secondary); color:var(--app-text-primary); font-size:13px; outline:none;">
                  <option value="support">🌤️ Мягкая поддержка</option>
                  <option value="discipline">⚡ Жесткая дисциплина</option>
                  <option value="sarcasm">😎 Юмор и сарказм</option>
                </select>
                <button class="btn" style="padding:10px; border-radius:8px; font-size:12px; font-weight:bold;" onclick="window.organizerModule.createTracker()">🚀 Запустить трекер</button>
              </div>
              <div id="organizer-tracker-list" style="display:flex; flex-direction:column; gap:12px; max-height:400px; overflow-y:auto;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const dateInput = document.getElementById('organizer-reminder-date') as HTMLInputElement;
    if (dateInput) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    await this.loadTabData(this._activeTab);

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ OrganizerModule v4.0.2 инициализирован');
  }

  // ==========================================
  // ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
  // ==========================================

  switchTab(tab: 'todo' | 'reminders' | 'trackers'): void {
    if (this._activeTab === tab) return;

    this._activeTab = tab;

    document.querySelectorAll('.organizer-tab').forEach(btn => {
      const element = btn as HTMLElement;
      const isActive = element.dataset.tab === tab;
      element.classList.toggle('active', isActive);
      element.style.background = isActive ? 'var(--app-accent-primary)' : 'transparent';
      element.style.color = isActive ? 'var(--app-text-inverse)' : 'var(--app-text-secondary)';
    });

    document.querySelectorAll('.organizer-tab-panel').forEach(panel => {
      (panel as HTMLElement).style.display = 'none';
    });

    const activePanel = document.querySelector(`#organizer-tab-content .organizer-tab-panel:nth-child(${tab === 'todo' ? 1 : tab === 'reminders' ? 2 : 3})`) as HTMLElement;
    if (activePanel) {
      activePanel.style.display = 'block';
      activePanel.style.animation = 'fadeIn 0.2s ease';
    }

    this.loadTabData(tab);
    console.log(`📑 Переключено на вкладку: ${tab}`);
  }

  // ==========================================
  // ЗАГРУЗКА ДАННЫХ
  // ==========================================

  async loadTabData(tab: 'todo' | 'reminders' | 'trackers'): Promise<void> {
    switch (tab) {
      case 'todo':
        this.renderTodo();
        break;
      case 'reminders':
        await this.renderReminders();
        break;
      case 'trackers':
        await this.renderTrackers();
        break;
    }
  }

  // ==========================================
  // TO-DO
  // ==========================================

  renderTodo(): void {
    const list = document.getElementById('organizer-todo-list');
    const counter = document.getElementById('organizer-todo-counter');
    if (!list) return;

    const items = this.organizerStore.getTodoByTopic('all');
    const total = items.length;
    const completed = items.filter(t => t.isCompleted).length;

    if (counter) counter.textContent = `${completed}/${total}`;

    if (items.length === 0) {
      list.innerHTML = `<p style="font-size:12px; color:var(--app-text-tertiary); text-align:center; margin:10px 0;">Нет задач</p>`;
      return;
    }

    list.innerHTML = '';
    for (const task of items) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--app-bg-tertiary); padding:10px 12px; border-radius:10px; gap:10px;';

      const left = document.createElement('div');
      left.style.cssText = 'display:flex; align-items:center; gap:10px; flex:1; overflow:hidden;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.isCompleted;
      checkbox.style.cssText = 'cursor:pointer; width:16px; height:16px; accent-color:var(--app-accent-primary); margin:0;';
      checkbox.onclick = () => {
        this.organizerStore.toggleTodo(task.id);
        this.renderTodo();
      };

      const text = document.createElement('span');
      text.textContent = task.text;
      text.style.cssText = `font-size:13px; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${task.isCompleted ? 'text-decoration:line-through; opacity:0.5;' : ''}`;

      const del = document.createElement('button');
      del.textContent = '🗑️';
      del.style.cssText = 'background:transparent; border:none; font-size:12px; cursor:pointer; opacity:0.5;';
      del.onclick = () => {
        if (confirm('Удалить задачу?')) {
          this.organizerStore.deleteTodo(task.id);
          this.renderTodo();
        }
      };

      left.appendChild(checkbox);
      left.appendChild(text);
      row.appendChild(left);
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  addTodo(): void {
    const input = document.getElementById('organizer-todo-input') as HTMLInputElement;
    if (!input || !input.value.trim()) return;
    this.organizerStore.addTodo(input.value.trim(), 'all');
    input.value = '';
    this.renderTodo();
  }

  // ==========================================
  // НАПОМИНАНИЯ
  // ==========================================

  async renderReminders(): Promise<void> {
    const list = document.getElementById('organizer-reminder-list');
    const counter = document.getElementById('organizer-reminder-counter');
    if (!list) return;

    const reminders = this.organizerStore.reminders || [];
    const pending = reminders.filter(r => r.status === 'pending');

    if (counter) counter.textContent = `В ожидании: ${pending.length}`;

    if (pending.length === 0) {
      list.innerHTML = `<p style="font-size:12px; color:var(--app-text-tertiary); text-align:center; margin:10px 0;">Нет активных напоминаний</p>`;
      return;
    }

    list.innerHTML = '';
    for (const rem of pending) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:var(--app-bg-tertiary); padding:10px 12px; border-radius:10px; gap:10px;';

      const date = new Date(rem.trigger_at);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      const info = document.createElement('div');
      info.style.cssText = 'flex:1; overflow:hidden;';
      info.innerHTML = `
        <div style="font-size:10px; font-weight:bold; color:var(--app-accent-primary);">⏰ ${dateStr}, ${timeStr}</div>
        <div style="font-size:13px; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${rem.task_text}</div>
      `;

      const del = document.createElement('button');
      del.textContent = '🗑️';
      del.style.cssText = 'background:transparent; border:none; font-size:12px; cursor:pointer; opacity:0.5;';
      del.onclick = async () => {
        if (confirm('Удалить напоминание?')) {
          await this.organizerService.deleteReminder(rem.id);
          await this.renderReminders();
        }
      };

      row.appendChild(info);
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  async createReminder(): Promise<void> {
    const textInput = document.getElementById('organizer-reminder-input') as HTMLInputElement;
    const dateInput = document.getElementById('organizer-reminder-date') as HTMLInputElement;
    const timeInput = document.getElementById('organizer-reminder-time') as HTMLInputElement;

    if (!textInput || !dateInput || !timeInput) return;

    const text = textInput.value.trim();
    const dateVal = dateInput.value;
    const timeVal = timeInput.value;

    if (!text || !dateVal || !timeVal) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Заполните все поля!');
      return;
    }

    const target = new Date(`${dateVal}T${timeVal}`);
    if (target <= new Date()) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Время уже прошло!');
      return;
    }

    const result = await this.organizerService.createReminder('all' as TopicId, text, target.toISOString());
    if (result) {
      textInput.value = '';
      timeInput.value = '';
      await this.renderReminders();
    }
  }

  // ==========================================
  // ТРЕКЕРЫ
  // ==========================================

  showCreateTracker(): void {
    const form = document.getElementById('organizer-tracker-form');
    if (form) {
      form.style.display = form.style.display === 'flex' ? 'none' : 'flex';
    }
  }

  async createTracker(): Promise<void> {
    const titleInput = document.getElementById('organizer-tracker-title') as HTMLInputElement;
    const toneSelect = document.getElementById('organizer-tracker-tone') as HTMLSelectElement;

    if (!titleInput || !titleInput.value.trim()) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Введите название цели!');
      return;
    }

    const result = await this.organizerService.createTracker('all' as TopicId, titleInput.value.trim(), { tone: toneSelect?.value || 'support' });
    if (result) {
      titleInput.value = '';
      const form = document.getElementById('organizer-tracker-form');
      if (form) form.style.display = 'none';
      await this.renderTrackers();
    }
  }

  async renderTrackers(): Promise<void> {
    const list = document.getElementById('organizer-tracker-list');
    if (!list) return;

    const trackers = this.organizerStore.trackers || [];
    const logs = this.organizerStore.trackerLogs || [];

    if (trackers.length === 0) {
      list.innerHTML = `<p style="font-size:12px; color:var(--app-text-tertiary); text-align:center; margin:10px 0;">Нет активных трекеров</p>`;
      return;
    }

    list.innerHTML = '';
    for (const tracker of trackers) {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--app-bg-tertiary); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px;';

      const head = document.createElement('div');
      head.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';

      const title = document.createElement('span');
      title.textContent = tracker.title;
      title.style.cssText = 'font-weight:bold; font-size:14px; color:var(--app-text-primary);';

      const del = document.createElement('button');
      del.textContent = '🗑️';
      del.style.cssText = 'background:transparent; border:none; font-size:12px; cursor:pointer; opacity:0.5;';
      del.onclick = async () => {
        if (confirm('Удалить трекер и всю историю?')) {
          await this.organizerService.deleteTracker(tracker.id);
          await this.renderTrackers();
        }
      };

      head.appendChild(title);
      head.appendChild(del);

      const logForm = document.createElement('div');
      logForm.style.cssText = 'display:flex; flex-direction:column; gap:6px; background:var(--app-bg-secondary); padding:8px; border-radius:10px;';
      logForm.innerHTML = `
        <div style="display:flex; gap:6px;">
          <input type="text" id="tracker-log-val-${tracker.id}" placeholder="Значение..." style="flex:1; padding:8px; border-radius:6px; border:1px solid var(--app-border-color); background:var(--app-bg-tertiary); color:var(--app-text-primary); font-size:12px; outline:none;">
          <select id="tracker-log-date-${tracker.id}" style="padding:8px; border-radius:6px; border:1px solid var(--app-border-color); background:var(--app-bg-tertiary); color:var(--app-text-primary); font-size:11px; outline:none;">
            <option value="today">Сегодня</option>
            <option value="yesterday">Вчера</option>
          </select>
        </div>
        <textarea id="tracker-log-note-${tracker.id}" placeholder="Заметка..." rows="1" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--app-border-color); background:var(--app-bg-tertiary); color:var(--app-text-primary); font-size:12px; outline:none; resize:none; box-sizing:border-box;"></textarea>
        <button class="btn" style="padding:6px; border-radius:6px; font-size:11px; font-weight:bold;" onclick="window.organizerModule.addTrackerLog('${tracker.id}')">💾 Зафиксировать</button>
      `;

      const history = document.createElement('div');
      history.id = `tracker-logs-${tracker.id}`;
      history.style.cssText = 'max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;';

      card.appendChild(head);
      card.appendChild(logForm);
      card.appendChild(history);
      list.appendChild(card);

      this.renderTrackerLogs(tracker.id, logs);
    }
  }

  renderTrackerLogs(trackerId: string, logs: any[]): void {
    const history = document.getElementById(`tracker-logs-${trackerId}`);
    if (!history) return;

    const trackerLogs = logs
      .filter(l => l.tracker_id === trackerId)
      .sort((a, b) => new Date(b.logged_date).getTime() - new Date(a.logged_date).getTime());

    if (trackerLogs.length === 0) {
      history.innerHTML = `<div style="font-size:11px; color:var(--app-text-tertiary); text-align:center; margin:4px 0;">Журнал пуст</div>`;
      return;
    }

    history.innerHTML = '';
    for (const log of trackerLogs) {
      const row = document.createElement('div');
      row.style.cssText = 'background:var(--app-bg-tertiary); padding:6px 8px; border-radius:6px; font-size:11px; display:flex; justify-content:space-between; align-items:center;';

      const date = new Date(log.logged_date);
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      row.innerHTML = `
        <div>
          <span style="font-weight:bold; color:var(--app-accent-primary);">${dateStr}:</span>
          <span style="color:var(--app-text-primary);">${log.value}</span>
          ${log.note_text ? `<span style="color:var(--app-text-tertiary); font-style:italic; margin-left:4px;">📝 ${log.note_text}</span>` : ''}
        </div>
        <button onclick="window.organizerModule.deleteTrackerLog('${log.id}')" style="background:transparent; border:none; font-size:10px; cursor:pointer; opacity:0.4;">🗑️</button>
      `;
      history.appendChild(row);
    }
  }

  async addTrackerLog(trackerId: string): Promise<void> {
    const valInput = document.getElementById(`tracker-log-val-${trackerId}`) as HTMLInputElement;
    const dateSelect = document.getElementById(`tracker-log-date-${trackerId}`) as HTMLSelectElement;
    const noteInput = document.getElementById(`tracker-log-note-${trackerId}`) as HTMLTextAreaElement;

    if (!valInput || !valInput.value.trim()) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Введите значение!');
      return;
    }

    const targetDate = new Date();
    if (dateSelect?.value === 'yesterday') {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    const result = await this.organizerService.addTrackerLog(
      trackerId,
      valInput.value.trim(),
      noteInput?.value.trim() || null,
      targetDate.toISOString()
    );

    if (result) {
      valInput.value = '';
      if (noteInput) noteInput.value = '';
      await this.renderTrackers();
    }
  }

  async deleteTrackerLog(logId: string): Promise<void> {
    if (!confirm('Удалить запись?')) return;
    await this.organizerService.deleteTrackerLog(logId);
    await this.renderTrackers();
  }

  // ==========================================
  // УПРАВЛЕНИЕ МОДУЛЕМ
  // ==========================================

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this.loadTabData(this._activeTab);

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }
  }

  hide(): void {
    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки OrganizerModule:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 OrganizerModule отписан от событий');
  }
}

// Экспортируем класс в глобальный объект
(window as any).OrganizerModule = OrganizerModule;
console.log('✅ OrganizerModule v4.0.2 загружен');
