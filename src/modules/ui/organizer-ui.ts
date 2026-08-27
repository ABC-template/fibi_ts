// ============================================
// src/modules/ui/organizer-ui.ts
// Интерфейс органайзера
// Версия: 3.1.0 - с использованием конфига
// ============================================

import { organizerStore } from '@/store/OrganizerStore';
import { organizerService } from '@/services/organizer';
import { chatStore } from '@/store/ChatStore';
import { eventBus } from '@/core/event-bus';
import { 
  getActiveTopics, 
  getTopicLabel, 
  getTopicShortLabel, 
  getTopicIcon,
  getTopicEmoji,
  isValidTopic,
  type ITodoItem, 
  type IReminder, 
  type ITracker, 
  type ITrackerLog, 
  type TopicId, 
  type UUID 
} from '@/config';

export class OrganizerUI {
  private organizerStore = organizerStore;
  private organizerService = organizerService;
  private chatStore = chatStore;
  private eventBus = eventBus;
  private _subscriptions: Array<() => void> = [];

  constructor() {
    this._subscribeToEvents();
    console.log('✅ OrganizerUI v3.1.0 загружен');
  }

  private _subscribeToEvents(): void {
    const unsubTodoAdd = this.eventBus.on('organizer:todo_added', (data) => {
      this._addTodoItemReactive(data.todo);
    }, this);
    this._subscriptions.push(unsubTodoAdd);

    const unsubTodoToggle = this.eventBus.on('organizer:todo_toggled', (data) => {
      this._toggleTodoItemReactive(data.id, data.isCompleted);
    }, this);
    this._subscriptions.push(unsubTodoToggle);

    const unsubTodoDelete = this.eventBus.on('organizer:todo_deleted', (data) => {
      this._removeTodoItemReactive(data.id);
    }, this);
    this._subscriptions.push(unsubTodoDelete);

    const unsubReminderAdd = this.eventBus.on('organizer:reminder_added', () => {
      if (document.getElementById('scheduler-module-container')) {
        this.syncReminders();
      }
    }, this);
    this._subscriptions.push(unsubReminderAdd);

    const unsubReminderDelete = this.eventBus.on('organizer:reminder_deleted', () => {
      if (document.getElementById('scheduler-module-container')) {
        this.syncReminders();
      }
    }, this);
    this._subscriptions.push(unsubReminderDelete);

    const unsubTrackerAdd = this.eventBus.on('organizer:tracker_added', () => {
      if (document.getElementById('tracker-module-container')) {
        this.syncTrackers();
      }
    }, this);
    this._subscriptions.push(unsubTrackerAdd);

    const unsubTrackerDelete = this.eventBus.on('organizer:tracker_deleted', () => {
      if (document.getElementById('tracker-module-container')) {
        this.syncTrackers();
      }
    }, this);
    this._subscriptions.push(unsubTrackerDelete);

    const unsubLogAdd = this.eventBus.on('organizer:tracker_log_added', () => {
      if (document.getElementById('tracker-module-container')) {
        this.syncTrackers();
      }
    }, this);
    this._subscriptions.push(unsubLogAdd);

    const unsubLogDelete = this.eventBus.on('organizer:tracker_log_deleted', () => {
      if (document.getElementById('tracker-module-container')) {
        this.syncTrackers();
      }
    }, this);
    this._subscriptions.push(unsubLogDelete);

    console.log('📡 OrganizerUI подписан на события');
  }

  // ==========================================
  // ТОЧЕЧНОЕ ОБНОВЛЕНИЕ TO-DO
  // ==========================================

  private _addTodoItemReactive(todo: ITodoItem): void {
    const zone = document.getElementById('todo-items-render-zone');
    if (!zone) return;

    const currentTopic = this.chatStore.currentTopic;
    if (todo.topic !== currentTopic && todo.topic !== 'all') return;

    if (document.getElementById(`todo-row-${todo.id}`)) return;

    const row = this._createTodoRow(todo);
    zone.prepend(row);
    this._updateTodoCounter();
  }

  private _toggleTodoItemReactive(id: string, isCompleted: boolean): void {
    const row = document.getElementById(`todo-row-${id}`);
    if (!row) return;

    const textSpan = row.querySelector('.todo-text') as HTMLElement;
    const checkbox = row.querySelector('.todo-checkbox') as HTMLInputElement;

    if (textSpan) {
      textSpan.style.textDecoration = isCompleted ? 'line-through' : 'none';
      textSpan.style.opacity = isCompleted ? '0.5' : '1';
    }
    if (checkbox) {
      checkbox.checked = isCompleted;
    }

    this._updateTodoCounter();
  }

  private _removeTodoItemReactive(id: string): void {
    const row = document.getElementById(`todo-row-${id}`);
    if (row) {
      row.style.transition = 'all 0.25s ease';
      row.style.opacity = '0';
      row.style.transform = 'scale(0.95)';
      setTimeout(() => row.remove(), 250);
    }
    this._updateTodoCounter();
  }

  private _updateTodoCounter(): void {
    const counter = document.getElementById('todo-counter-label');
    if (!counter) return;

    const currentTopic = this.chatStore.currentTopic;
    const items = this.organizerStore.getTodoByTopic(currentTopic);
    const stats = this.organizerStore.getTodoStats(currentTopic);
    counter.textContent = `${stats.completed}/${stats.total}`;
  }

  private _createTodoRow(task: ITodoItem): HTMLElement {
    const row = document.createElement('div');
    row.id = `todo-row-${task.id}`;
    row.style.cssText = `display: flex; align-items: center; justify-content: space-between; background: var(--bg-color); padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04); gap: 10px; animation: fadeInUp 0.2s ease;`;

    const leftGroup = document.createElement('div');
    leftGroup.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.isCompleted;
    checkbox.className = 'todo-checkbox';
    checkbox.style.cssText = 'cursor: pointer; width: 16px; height: 16px; accent-color: var(--button-color); margin: 0;';
    checkbox.onclick = () => this.toggleTodoTask(task.id);

    const textSpan = document.createElement('span');
    textSpan.textContent = task.text;
    textSpan.className = 'todo-text';
    textSpan.style.cssText = `font-size: 13px; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; ${task.isCompleted ? 'text-decoration: line-through; opacity: 0.5;' : ''}`;

    leftGroup.appendChild(checkbox);
    leftGroup.appendChild(textSpan);

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑️';
    delBtn.style.cssText = 'background: transparent; border: none; outline: none; font-size: 12px; cursor: pointer; opacity: 0.6; padding: 2px;';
    delBtn.onclick = () => this.deleteTodoTask(task.id);

    row.appendChild(leftGroup);
    row.appendChild(delBtn);
    return row;
  }

  // ==========================================
  // TO-DO (основные методы)
  // ==========================================

  renderTodoModule(): void {
    const container = document.getElementById('todo-module-container');
    if (!container) return;

    this.organizerStore.load();

    container.innerHTML = `
      <div style="background: var(--secondary-bg); padding: 14px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.03); margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="font-weight: bold; font-size: 14px; color: var(--text-color);">📋 To-Do List</span>
          <span style="font-size: 11px; font-weight: 600; color: var(--hint-color);" id="todo-counter-label">0/0</span>
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <input type="text" id="manual-todo-input" placeholder="Добавить задачу..." style="flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); background: var(--bg-color); color: var(--text-color); font-size: 13px; outline: none;">
          <button class="btn" style="padding: 10px 14px; border-radius: 10px; font-size: 13px;" onclick="window.organizerUI.addTodoTask()">➕</button>
        </div>
        <div id="todo-items-render-zone" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 2px;"></div>
      </div>
    `;

    this.refreshTodoItems();
  }

  refreshTodoItems(): void {
    const zone = document.getElementById('todo-items-render-zone');
    if (!zone) return;

    const currentTopic = this.chatStore.currentTopic;
    const items = this.organizerStore.getTodoByTopic(currentTopic);

    zone.innerHTML = '';
    for (const task of items) {
      const row = this._createTodoRow(task);
      zone.appendChild(row);
    }

    this._updateTodoCounter();
  }

  addTodoTask(): void {
    const input = document.getElementById('manual-todo-input') as HTMLInputElement;
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    this.organizerStore.addTodo(text);
    input.value = '';
  }

  toggleTodoTask(id: string): void {
    this.organizerStore.toggleTodo(id);
  }

  deleteTodoTask(id: string): void {
    const confirmMsg = (window as any).getLangString ? (window as any).getLangString('confirm_del_msg') : 'Удалить эту задачу?';

    const action = () => {
      this.organizerStore.deleteTodo(id);
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  // ==========================================
  // НАПОМИНАНИЯ
  // ==========================================

  renderSchedulerModule(): void {
    const container = document.getElementById('scheduler-module-container');
    if (!container) return;

    container.innerHTML = `
      <div style="background: var(--secondary-bg); padding: 14px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.03); margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="font-weight: bold; font-size: 14px; color: var(--text-color);">⏰ Напоминания (Push)</span>
          <span style="font-size: 11px; font-weight: 600; color: var(--hint-color);" id="scheduler-counter-label">В ожидании: 0</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; background: var(--bg-color); padding: 10px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.02);">
          <input type="text" id="sched-task-input" placeholder="О чем напомнить?..." style="padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 13px; outline: none;">
          <div style="display: flex; gap: 6px;">
            <input type="date" id="sched-date-input" style="flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 12px; outline: none;">
            <input type="time" id="sched-time-input" style="width: 90px; padding: 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 12px; outline: none;">
          </div>
          <button class="btn" style="padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 600;" onclick="window.organizerUI.createReminder()">🔔 Поставить будильник</button>
        </div>
        <div id="scheduler-items-render-zone" style="display: flex; flex-direction: column; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 2px;"></div>
      </div>
    `;

    const dateInput = document.getElementById('sched-date-input') as HTMLInputElement;
    if (dateInput) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    this.syncReminders();
  }

  async syncReminders(): Promise<void> {
    const topicId = this.chatStore.currentTopic;
    const reminders = await this.organizerService.getReminders(topicId);
    this.refreshReminders(reminders);
  }

  refreshReminders(reminders: IReminder[]): void {
    const zone = document.getElementById('scheduler-items-render-zone');
    const counter = document.getElementById('scheduler-counter-label');
    if (!zone) return;

    zone.innerHTML = '';

    const pending = (reminders || []).filter(r => r.status === 'pending');

    if (counter) {
      counter.textContent = `В ожидании: ${pending.length}`;
    }

    if (pending.length === 0) {
      zone.innerHTML = `<p style="font-size: 12px; color: var(--hint-color); text-align: center; margin: 15px 0;">Нет активных напоминаний.</p>`;
      return;
    }

    for (const rem of pending) {
      const row = document.createElement('div');
      row.id = `reminder-row-${rem.id}`;
      row.style.cssText = `display: flex; align-items: center; justify-content: space-between; background: var(--bg-color); padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04); gap: 10px; animation: fadeInUp 0.2s ease;`;

      const triggerDate = new Date(rem.trigger_at);
      const timeStr = triggerDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = triggerDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

      const infoDiv = document.createElement('div');
      infoDiv.style.cssText = 'display: flex; flex-direction: column; flex: 1; overflow: hidden; gap: 2px; text-align: left;';
      infoDiv.innerHTML = `
        <span style="font-size: 10px; font-weight: bold; color: var(--button-color);">⏰ ${dateStr}, ${timeStr}</span>
        <span style="font-size: 12px; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">${rem.task_text}</span>
      `;

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.style.cssText = 'background: transparent; border: none; outline: none; font-size: 12px; cursor: pointer; opacity: 0.6; padding: 2px;';
      delBtn.onclick = () => this.deleteReminder(rem.id);

      row.appendChild(infoDiv);
      row.appendChild(delBtn);
      zone.appendChild(row);
    }
  }

  async createReminder(): Promise<void> {
    const textInput = document.getElementById('sched-task-input') as HTMLInputElement;
    const dateInput = document.getElementById('sched-date-input') as HTMLInputElement;
    const timeInput = document.getElementById('sched-time-input') as HTMLInputElement;

    if (!textInput || !dateInput || !timeInput) return;

    const text = textInput.value.trim();
    const dateVal = dateInput.value;
    const timeVal = timeInput.value;

    if (!text || !dateVal || !timeVal) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Заполните все поля напоминания!');
      return;
    }

    const targetDateTime = new Date(`${dateVal}T${timeVal}`);
    if (targetDateTime <= new Date()) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Время напоминания уже прошло!');
      return;
    }

    const topicId = this.chatStore.currentTopic;
    const result = await this.organizerService.createReminder(topicId, text, targetDateTime.toISOString());

    if (result) {
      textInput.value = '';
      timeInput.value = '';
      await this.syncReminders();
    }
  }

  async deleteReminder(id: UUID): Promise<void> {
    const confirmMsg = (window as any).getLangString ? (window as any).getLangString('confirm_del_msg') : 'Удалить это напоминание?';

    const action = async () => {
      const success = await this.organizerService.deleteReminder(id);
      if (success) {
        await this.syncReminders();
      }
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  // ==========================================
  // ТРЕКЕРЫ
  // ==========================================

  renderTrackerModule(): void {
    const container = document.getElementById('tracker-module-container');
    if (!container) return;

    container.innerHTML = `
      <div style="background: var(--secondary-bg); padding: 14px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-weight: bold; font-size: 14px; color: var(--text-color);">📊 Lifestyle-Трекеры</span>
          <button class="btn" style="padding: 4px 10px; font-size: 11px; border-radius: 8px;" onclick="window.organizerUI.showCreateTrackerForm()">➕ Создать цель</button>
        </div>
        <div id="tracker-creation-zone" style="display: none; flex-direction: column; gap: 8px; background: var(--bg-color); padding: 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04); margin-bottom: 12px; animation: fadeInUp 0.2s ease;"></div>
        <div id="trackers-cards-render-zone" style="display: flex; flex-direction: column; gap: 12px;"></div>
      </div>
    `;

    this.syncTrackers();
  }

  showCreateTrackerForm(): void {
    const zone = document.getElementById('tracker-creation-zone');
    if (!zone) return;

    if (zone.style.display === 'flex') {
      zone.style.display = 'none';
      return;
    }

    zone.style.display = 'flex';
    zone.innerHTML = `
      <div style="font-size: 12px; font-weight: bold; color: var(--hint-color); margin-bottom: 2px;">Название цели:</div>
      <input type="text" id="new-tracker-title" placeholder="Напр: Без сигарет, Тренировки, Калории..." style="padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 13px; outline: none;">
      <div style="font-size: 12px; font-weight: bold; color: var(--hint-color); margin-top: 4px; margin-bottom: 2px;">Тон мотивации ИИ:</div>
      <select id="new-tracker-tone" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); background: var(--secondary-bg); color: var(--text-color); font-size: 13px; outline: none;">
        <option value="support">🌤️ Мягкая поддержка и эмпатия</option>
        <option value="discipline">⚡ Жесткая армейская дисциплина</option>
        <option value="sarcasm">😎 Юмор и Сарказм (Grok стиль)</option>
      </select>
      <button class="btn" style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: bold; margin-top: 8px;" onclick="window.organizerUI.createTracker()">🚀 Запустить трекер</button>
    `;
  }

  async syncTrackers(): Promise<void> {
    const topicId = this.chatStore.currentTopic;
    const data = await this.organizerService.getTrackers(topicId);
    this.refreshTrackers(data.trackers, data.logs);
  }

  refreshTrackers(trackers: ITracker[], logs: ITrackerLog[]): void {
    const zone = document.getElementById('trackers-cards-render-zone');
    if (!zone) return;

    zone.innerHTML = '';

    const currentTopic = this.chatStore.currentTopic;
    const topicTrackers = (trackers || []).filter(t => t.topic_id === currentTopic && t.status === 'active');

    if (topicTrackers.length === 0) {
      zone.innerHTML = `<p style="font-size: 12px; color: var(--hint-color); text-align: center; margin: 15px 0;">У вас пока нет активных трекеров в этом разделе.</p>`;
      return;
    }

    for (const tracker of topicTrackers) {
      const card = this.createTrackerCard(tracker, logs);
      zone.appendChild(card);
    }
  }

  createTrackerCard(tracker: ITracker, logs: ITrackerLog[]): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `background: var(--bg-color); border: 1px solid rgba(0,0,0,0.04); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.01); animation: fadeInUp 0.2s ease;`;

    const head = document.createElement('div');
    head.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = tracker.title;
    titleSpan.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--text-color);';

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑️';
    delBtn.style.cssText = 'background: transparent; border: none; outline: none; font-size: 12px; cursor: pointer; opacity: 0.5;';
    delBtn.onclick = () => this.deleteTracker(tracker.id);

    head.appendChild(titleSpan);
    head.appendChild(delBtn);

    const aiBtn = document.createElement('button');
    aiBtn.textContent = '🧠 Анализ прогресса ИИ';
    aiBtn.style.cssText = 'background: rgba(var(--tg-theme-button-color,0,136,204), 0.07); color: var(--button-color); border: none; border-radius: 8px; padding: 8px; font-size: 11px; font-weight: bold; cursor: pointer; display: block; width: 100%; text-align: center; margin-top: 2px;';
    aiBtn.onclick = () => this.triggerTrackerAnalysis(tracker.id, tracker.title);

    const quickLog = document.createElement('div');
    quickLog.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 4px; background: var(--secondary-bg); padding: 8px; border-radius: 10px;';
    quickLog.innerHTML = `
      <div style="display: flex; gap: 6px;">
        <input type="text" id="log-val-${tracker.id}" placeholder="Значение..." style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06); background: var(--bg-color); color: var(--text-color); font-size: 12px; outline: none;">
        <select id="log-date-${tracker.id}" style="padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06); background: var(--bg-color); color: var(--text-color); font-size: 11px; outline: none;">
          <option value="today">Сегодня</option>
          <option value="yesterday">Вчера</option>
        </select>
      </div>
      <textarea id="log-note-${tracker.id}" placeholder="Добавить заметку..." rows="1" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06); background: var(--bg-color); color: var(--text-color); font-size: 12px; outline: none; resize: none; box-sizing: border-box; font-family: inherit;"></textarea>
      <button class="btn" style="padding: 6px; border-radius: 6px; font-size: 11px; font-weight: bold;" onclick="window.organizerUI.addTrackerLog('${tracker.id}')">💾 Зафиксировать</button>
    `;

    const historyZone = document.createElement('div');
    historyZone.id = `logs-history-${tracker.id}`;
    historyZone.style.cssText = 'max-height: 110px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding-right: 2px;';

    card.appendChild(head);
    card.appendChild(aiBtn);
    card.appendChild(quickLog);
    card.appendChild(historyZone);

    this.renderTrackerLogs(tracker.id, logs);

    return card;
  }

  renderTrackerLogs(trackerId: UUID, logs: ITrackerLog[]): void {
    const historyZone = document.getElementById(`logs-history-${trackerId}`);
    if (!historyZone) return;

    historyZone.innerHTML = '';

    const trackerLogs = (logs || [])
      .filter(l => l.tracker_id === trackerId)
      .sort((a, b) => new Date(b.logged_date).getTime() - new Date(a.logged_date).getTime());

    if (trackerLogs.length === 0) {
      historyZone.innerHTML = `<div style="font-size: 11px; color: var(--hint-color); text-align: center; margin: 6px 0;">Журнал событий пуст.</div>`;
      return;
    }

    for (const log of trackerLogs) {
      const row = document.createElement('div');
      row.id = `log-item-row-${log.id}`;
      row.style.cssText = 'background: rgba(0,0,0,0.02); padding: 8px; border-radius: 8px; font-size: 11px; display: flex; flex-direction: column; gap: 3px; border-left: 3px solid var(--button-color); position: relative; animation: fadeInUp 0.15s ease;';

      const dateObj = new Date(log.logged_date);
      const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-weight: bold;';
      topRow.innerHTML = `
        <span style="color: var(--text-color);">${dateString}: <span style="color: var(--button-color);">${log.value}</span></span>
        <button style="background: transparent; border: none; outline: none; font-size: 10px; cursor: pointer; opacity: 0.5; padding: 0;" onclick="window.organizerUI.deleteTrackerLog('${log.id}', '${trackerId}')">🗑️</button>
      `;

      row.appendChild(topRow);

      if (log.note_text && log.note_text.trim().length > 0) {
        const noteDiv = document.createElement('div');
        noteDiv.style.cssText = 'color: var(--text-color); font-style: italic; line-height: 1.3; opacity: 0.85; word-wrap: break-word; background: var(--bg-color); padding: 4px 6px; border-radius: 4px; margin-top: 2px;';
        noteDiv.textContent = `📝 ${log.note_text}`;
        row.appendChild(noteDiv);
      }

      historyZone.appendChild(row);
    }
  }

  async createTracker(): Promise<void> {
    const titleInput = document.getElementById('new-tracker-title') as HTMLInputElement;
    const toneSelect = document.getElementById('new-tracker-tone') as HTMLSelectElement;

    if (!titleInput || !toneSelect) return;

    const title = titleInput.value.trim();
    const tone = toneSelect.value;

    if (!title) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Введите название цели!');
      return;
    }

    const topicId = this.chatStore.currentTopic;
    const result = await this.organizerService.createTracker(topicId, title, { tone });

    if (result) {
      titleInput.value = '';
      const zone = document.getElementById('tracker-creation-zone');
      if (zone) zone.style.display = 'none';
      await this.syncTrackers();
    }
  }

  async addTrackerLog(trackerId: UUID): Promise<void> {
    const valInput = document.getElementById(`log-val-${trackerId}`) as HTMLInputElement;
    const dateSelect = document.getElementById(`log-date-${trackerId}`) as HTMLSelectElement;
    const noteTextarea = document.getElementById(`log-note-${trackerId}`) as HTMLTextAreaElement;

    if (!valInput || !dateSelect || !noteTextarea) return;

    const value = valInput.value.trim();
    const dateType = dateSelect.value;
    const noteText = noteTextarea.value.trim();

    if (!value) {
      if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Введите значение фиксации!');
      return;
    }

    const targetDate = new Date();
    if (dateType === 'yesterday') {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    const result = await this.organizerService.addTrackerLog(
      trackerId,
      value,
      noteText || null,
      targetDate.toISOString()
    );

    if (result) {
      valInput.value = '';
      noteTextarea.value = '';
      await this.syncTrackers();
    }
  }

  async deleteTrackerLog(logId: UUID, trackerId: UUID): Promise<void> {
    const confirmMsg = 'Удалить эту запись из журнала?';

    const action = async () => {
      const success = await this.organizerService.deleteTrackerLog(logId);
      if (success) {
        await this.syncTrackers();
      }
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  async deleteTracker(trackerId: UUID): Promise<void> {
    const confirmMsg = 'Полностью удалить этот трекер и всю историю его заметок?';

    const action = async () => {
      const success = await this.organizerService.deleteTracker(trackerId);
      if (success) {
        await this.syncTrackers();
      }
    };

    if ((window as any).tg?.showConfirm) {
      (window as any).tg.showConfirm(confirmMsg, (ok: boolean) => { if (ok) action(); });
    } else if (confirm(confirmMsg)) {
      action();
    }
  }

  triggerTrackerAnalysis(trackerId: UUID, trackerTitle: string): void {
    const card = document.getElementById('profile-card');
    if (card) card.classList.add('hidden');
    if ((window as any).tg?.BackButton) (window as any).tg.BackButton.hide();

    (window as any).uiRenderer.showSkeleton();

    const logs = this.organizerStore.getLogsForTracker(trackerId);
    const logText = logs.map(l =>
      `[Дата: ${l.logged_date.substring(0, 10)}, Действие: ${l.value}, Заметка: ${l.note_text || 'нет'}]`
    ).join('\n');

    const prompt = `Сделай подробный научный, физиологический и психологический анализ моего прогресса по цели: "${trackerTitle}". Вот журнал моих фиксаций и текстовых заметок триггеров:\n${logText || 'Журнал пуст, я только начинаю свой путь.'}\n\nПожалуйста, разложи по полочкам, какие позитивные изменения происходят в моем организме, мозге и дофаминовых рецепторах прямо сейчас на этом этапе. Отвечай развернуто, структурировано.`;

    if ((window as any).streamAiResponse) {
      const userLang = this.chatStore.getActiveChat()?.language || 'ru';
      (window as any).streamAiResponse(
        [{ type: 'user-msg', text: prompt }],
        'fast',
        userLang,
        null,
        this.chatStore.getActiveChat()
      );
    }
  }

  // ==========================================
  // ОЧИСТКА ПОДПИСОК
  // ==========================================

  destroy(): void {
    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки OrganizerUI:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 OrganizerUI отписан от событий');
  }
}

// Создаем экземпляр
export const organizerUI = new OrganizerUI();
console.log('✅ OrganizerUI v3.1.0 загружен');
