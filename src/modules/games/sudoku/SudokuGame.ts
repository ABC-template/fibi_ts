// ============================================
// src/modules/games/sudoku/SudokuGame.ts
// Описание: Классическое Судоку
// Версия: 3.0.1 - CLEAN (исправлен key)
// ============================================

import './sudoku.css';
import { tasksStore } from '@/store/TasksStore';
import { eventBus } from '@/core/event-bus';

export interface ISudokuState {
  difficulty: 'easy' | 'medium' | 'hard';
  errors: number;
  hintsUsed: number;
  elapsedTime: number;
  isRunning: boolean;
  isPaused: boolean;
  gameOver: boolean;
  highScore: number;
}

export class SudokuGame {
  private container: HTMLElement | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private gameOver: boolean = false;
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  
  // Игровые данные
  private board: number[][] = [];
  private solution: number[][] = [];
  private given: boolean[][] = [];
  private errors: number = 0;
  private maxErrors: number = 5;
  private hintsUsed: number = 0;
  private maxHints: number = 3;
  private startTime: number | null = null;
  private elapsedTime: number = 0;
  private timerInterval: number | null = null;
  
  // UI состояния
  private selectedRow: number = -1;
  private selectedCol: number = -1;
  
  // Рекорды
  private highScore: number = 0;
  private bestTime: number | null = null;
  
  // DOM элементы
  private boardEl: HTMLElement | null = null;
  private timerEl: HTMLElement | null = null;
  private errorsEl: HTMLElement | null = null;
  private hintsEl: HTMLElement | null = null;
  private highEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;

  constructor() {
    // Пустой конструктор
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ
  // ==========================================

  init(container: HTMLElement, difficulty: 'easy' | 'medium' | 'hard' = 'medium'): void {
    this.container = container;
    this.difficulty = difficulty;
    
    this._loadHighScores();
    this._generatePuzzle();
    
    this.errors = 0;
    this.hintsUsed = 0;
    this.elapsedTime = 0;
    this.startTime = null;
    this.gameOver = false;
    this.selectedRow = -1;
    this.selectedCol = -1;
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    this._render();
    this._setupControls();
    
    console.log(`🧩 Судоку инициализирован (${this.difficulty})`);
  }

  // ==========================================
  // ГЕНЕРАЦИЯ ПОЛЯ
  // ==========================================

  private _generatePuzzle(): void {
    this.solution = this._generateSolvedBoard();
    this.board = this.solution.map(row => [...row]);
    this.given = Array(9).fill(null).map(() => Array(9).fill(false));
    
    const cellsToRemove = {
      'easy': 30,
      'medium': 40,
      'hard': 50
    };
    
    let toRemove = cellsToRemove[this.difficulty] || 40;
    let removed = 0;
    
    while (removed < toRemove) {
      const row = Math.floor(Math.random() * 9);
      const col = Math.floor(Math.random() * 9);
      
      if (this.given[row][col]) continue;
      
      this.board[row][col] = 0;
      this.given[row][col] = false;
      removed++;
    }
    
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.board[r][c] !== 0) {
          this.given[r][c] = true;
        }
      }
    }
  }

  private _generateSolvedBoard(): number[][] {
    const board = Array(9).fill(null).map(() => Array(9).fill(0));
    this._solveSudoku(board);
    return board;
  }

  private _solveSudoku(board: number[][]): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const nums = this._shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const num of nums) {
            if (this._isValid(board, r, c, num)) {
              board[r][c] = num;
              if (this._solveSudoku(board)) {
                return true;
              }
              board[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  private _isValid(board: number[][], row: number, col: number, num: number): boolean {
    for (let c = 0; c < 9; c++) {
      if (board[row][c] === num) return false;
    }
    
    for (let r = 0; r < 9; r++) {
      if (board[r][col] === num) return false;
    }
    
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        if (board[r][c] === num) return false;
      }
    }
    
    return true;
  }

  private _shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ==========================================
  // РЕКОРДЫ
  // ==========================================

  private _loadHighScores(): void {
    const key = `sudoku_${this.difficulty}_high_score`;
    this.highScore = (tasksStore.get(key) as number) || 0;
    this.bestTime = (tasksStore.get(`sudoku_${this.difficulty}_best_time`) as number) || null;
  }

  private _saveHighScore(): void {
    if (this.errors > this.maxErrors) return;
    
    const time = this.elapsedTime;
    const timeKey = `sudoku_${this.difficulty}_best_time`;
    
    if (!this.bestTime || time < this.bestTime) {
      this.bestTime = time;
      tasksStore.set(timeKey, time);
      
      const reward = 30;
      tasksStore.addBalance(reward, `🧩 Рекорд в Судоку (${this.difficulty})!`);
      
      eventBus.emit('game:score_updated', {
        gameId: 'sudoku',
        score: time,
        reward: reward,
        difficulty: this.difficulty
      });
      
      this._updateUI();
    }
    
    const points = Math.max(100, Math.floor(1000 / (time / 60)));
    if (points > this.highScore) {
      this.highScore = points;
      const highKey = `sudoku_${this.difficulty}_high_score`;
      tasksStore.set(highKey, points);
    }
  }

  // ==========================================
  // РЕНДЕРИНГ
  // ==========================================

  private _render(): void {
    if (!this.container) return;
    
    const timeStr = this._formatTime(this.elapsedTime);
    const errorsStr = `${this.errors}/${this.maxErrors}`;
    
    this.container.innerHTML = `
      <div class="sudoku-container" id="sudoku-container">
        <div class="sudoku-info-panel">
          <div class="sudoku-info-item">
            ⏱️ <span class="value" id="sudoku-timer">${timeStr}</span>
          </div>
          <div class="sudoku-info-item">
            ❌ <span class="value ${this.errors >= this.maxErrors ? 'danger' : ''}" id="sudoku-errors">${errorsStr}</span>
          </div>
          <div class="sudoku-info-item">
            💡 <span class="value" id="sudoku-hints">${this.hintsUsed}/${this.maxHints}</span>
          </div>
          <div class="sudoku-info-item">
            🏆 <span class="value" id="sudoku-high">${this.highScore}</span>
          </div>
        </div>
        
        <div class="sudoku-board-wrapper">
          <div class="sudoku-board" id="sudoku-board">
            ${this._renderBoard()}
          </div>
          
          <div id="sudoku-overlay" style="display:none;">
            <div class="sudoku-overlay">
              <h3 id="sudoku-overlay-title">💀 Game Over</h3>
              <div class="score" id="sudoku-overlay-score">0 очков</div>
              <div class="sub" id="sudoku-overlay-sub">Рекорд: 0</div>
              <button class="sudoku-btn primary" id="sudoku-btn-restart">🔄 Новая игра</button>
            </div>
          </div>
        </div>
        
        <div class="sudoku-numbers" id="sudoku-numbers">
          ${[1,2,3,4,5,6,7,8,9].map(n => `
            <button class="sudoku-num-btn" data-num="${n}" id="sudoku-num-${n}">
              ${n}
              <span class="count" id="sudoku-num-count-${n}">0</span>
            </button>
          `).join('')}
        </div>
        
        <div class="sudoku-controls">
          <button class="sudoku-btn" id="sudoku-btn-undo">↩️ Отмена</button>
          <button class="sudoku-btn" id="sudoku-btn-erase">🧹 Стереть</button>
          <button class="sudoku-btn" id="sudoku-btn-hint">💡 Подсказка</button>
          <button class="sudoku-btn danger" id="sudoku-btn-reset">🔄 Сброс</button>
        </div>
      </div>
    `;
    
    this.boardEl = document.getElementById('sudoku-board');
    this.timerEl = document.getElementById('sudoku-timer');
    this.errorsEl = document.getElementById('sudoku-errors');
    this.hintsEl = document.getElementById('sudoku-hints');
    this.highEl = document.getElementById('sudoku-high');
    this.overlayEl = document.getElementById('sudoku-overlay');
    
    this._bindButtons();
    this._updateUI();
    this._updateCounts();
  }

  private _renderBoard(): string {
    let html = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const value = this.board[r][c] || '';
        const isGiven = this.given[r][c];
        const isSelected = this.selectedRow === r && this.selectedCol === c;
        const isError = this._isCellError(r, c);
        
        let classes = 'sudoku-cell';
        if (isGiven) classes += ' given';
        else if (value) classes += ' user';
        if (isSelected) classes += ' selected';
        if (isError) classes += ' error';
        
        if (this.selectedRow !== -1) {
          if (r === this.selectedRow || c === this.selectedCol) {
            classes += ' highlight';
          }
          const selectedValue = this.board[this.selectedRow][this.selectedCol];
          if (selectedValue && value === selectedValue && !(r === this.selectedRow && c === this.selectedCol)) {
            classes += ' same-number';
          }
        }
        
        html += `<div class="${classes}" data-row="${r}" data-col="${c}">${value}</div>`;
      }
    }
    return html;
  }

  // ==========================================
  // ОБНОВЛЕНИЕ UI
  // ==========================================

  private _updateUI(): void {
    if (!this.boardEl) return;
    
    const cells = this.boardEl.querySelectorAll('.sudoku-cell');
    let idx = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = cells[idx] as HTMLElement;
        if (!cell) continue;
        
        const value = this.board[r][c] || '';
        const isGiven = this.given[r][c];
        const isSelected = this.selectedRow === r && this.selectedCol === c;
        const isError = this._isCellError(r, c);
        
        cell.textContent = String(value);
        cell.className = 'sudoku-cell';
        if (isGiven) cell.classList.add('given');
        else if (value) cell.classList.add('user');
        if (isSelected) cell.classList.add('selected');
        if (isError) cell.classList.add('error');
        
        if (this.selectedRow !== -1) {
          if (r === this.selectedRow || c === this.selectedCol) {
            cell.classList.add('highlight');
          }
          const selectedValue = this.board[this.selectedRow][this.selectedCol];
          if (selectedValue && value === selectedValue && !(r === this.selectedRow && c === this.selectedCol)) {
            cell.classList.add('same-number');
          }
        }
        
        idx++;
      }
    }
    
    if (this.timerEl) {
      this.timerEl.textContent = this._formatTime(this.elapsedTime);
    }
    if (this.errorsEl) {
      const isMax = this.errors >= this.maxErrors;
      this.errorsEl.textContent = `${this.errors}/${this.maxErrors}`;
      this.errorsEl.className = `value${isMax ? ' danger' : ''}`;
    }
    if (this.hintsEl) {
      this.hintsEl.textContent = `${this.hintsUsed}/${this.maxHints}`;
    }
    if (this.highEl) {
      this.highEl.textContent = String(this.highScore);
    }
    
    this._updateCounts();
  }

  private _updateCounts(): void {
    const counts: Record<number, number> = {};
    for (let n = 1; n <= 9; n++) {
      counts[n] = 0;
    }
    
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = this.board[r][c];
        if (val > 0) counts[val]++;
      }
    }
    
    for (let n = 1; n <= 9; n++) {
      const el = document.getElementById(`sudoku-num-count-${n}`);
      if (el) {
        el.textContent = String(counts[n]);
        const btn = document.getElementById(`sudoku-num-${n}`);
        if (btn) {
          if (counts[n] >= 9) {
            btn.classList.add('completed');
          } else {
            btn.classList.remove('completed');
          }
        }
      }
    }
  }

  private _isCellError(row: number, col: number): boolean {
    const val = this.board[row][col];
    if (val === 0 || this.given[row][col]) return false;
    return val !== this.solution[row][col];
  }

  private _isBoardComplete(): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.board[r][c] === 0) return false;
        if (this.board[r][c] !== this.solution[r][c]) return false;
      }
    }
    return true;
  }

  private _formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // ==========================================
  // ТАЙМЕР
  // ==========================================

  private _startTimer(): void {
    if (this.startTime !== null) return;
    this.startTime = Date.now() - this.elapsedTime * 1000;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerInterval = window.setInterval(() => {
      this._timerTick();
    }, 1000);
  }

  private _timerTick(): void {
    if (this.isPaused || this.gameOver) return;
    this.elapsedTime = (Date.now() - (this.startTime || 0)) / 1000;
    if (this.timerEl) {
      this.timerEl.textContent = this._formatTime(this.elapsedTime);
    }
  }

  // ==========================================
  // ЛОГИКА ИГРЫ
  // ==========================================

  private _selectCell(row: number, col: number): void {
    if (this.gameOver || this.isPaused) return;
    if (this.given[row][col]) {
      this.selectedRow = -1;
      this.selectedCol = -1;
      this._updateUI();
      return;
    }
    
    this.selectedRow = row;
    this.selectedCol = col;
    this._updateUI();
  }

  private _placeNumber(num: number): void {
    if (this.gameOver || this.isPaused) return;
    if (this.selectedRow === -1 || this.selectedCol === -1) return;
    
    const row = this.selectedRow;
    const col = this.selectedCol;
    
    if (this.given[row][col]) return;
    
    if (this.board[row][col] === num) {
      this.board[row][col] = 0;
      this._updateUI();
      this._updateCounts();
      return;
    }
    
    if (num === this.solution[row][col]) {
      this.board[row][col] = num;
      
      if (this._isBoardComplete()) {
        this._winGame();
      }
    } else {
      this.errors++;
      this.board[row][col] = num;
      
      if (this.errors >= this.maxErrors) {
        this._loseGame();
      }
    }
    
    if (this.startTime === null && !this.gameOver) {
      this._startTimer();
    }
    
    this._updateUI();
    this._updateCounts();
  }

  private _eraseNumber(): void {
    if (this.gameOver || this.isPaused) return;
    if (this.selectedRow === -1 || this.selectedCol === -1) return;
    
    const row = this.selectedRow;
    const col = this.selectedCol;
    
    if (this.given[row][col]) return;
    
    this.board[row][col] = 0;
    this._updateUI();
    this._updateCounts();
  }

  private _useHint(): void {
    if (this.gameOver || this.isPaused) return;
    if (this.hintsUsed >= this.maxHints) {
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('💡 Подсказки закончились!');
      }
      return;
    }
    
    const candidates: { row: number; col: number }[] = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!this.given[r][c] && this.board[r][c] !== this.solution[r][c]) {
          candidates.push({ row: r, col: c });
        }
      }
    }
    
    if (candidates.length === 0) {
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert('Все клетки уже правильные!');
      }
      return;
    }
    
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.board[pick.row][pick.col] = this.solution[pick.row][pick.col];
    this.hintsUsed++;
    
    if (this.startTime === null) {
      this._startTimer();
    }
    
    setTimeout(() => {
      if (!this.boardEl) return;
      const cells = this.boardEl.querySelectorAll('.sudoku-cell');
      const idx = pick.row * 9 + pick.col;
      if (cells[idx]) {
        (cells[idx] as HTMLElement).classList.add('hint');
      }
    }, 50);
    
    if (this._isBoardComplete()) {
      this._winGame();
    }
    
    this._updateUI();
    this._updateCounts();
    
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert(`💡 Подсказка использована! Осталось: ${this.maxHints - this.hintsUsed}`);
    }
  }

  private _resetGame(): void {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!this.given[r][c]) {
          this.board[r][c] = 0;
        }
      }
    }
    
    this.errors = 0;
    this.hintsUsed = 0;
    this.selectedRow = -1;
    this.selectedCol = -1;
    this.gameOver = false;
    this.elapsedTime = 0;
    this.startTime = null;
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    if (this.overlayEl) {
      this.overlayEl.style.display = 'none';
    }
    
    this._updateUI();
    this._updateCounts();
    console.log('🔄 Судоку сброшено');
  }

  private _winGame(): void {
    this.gameOver = true;
    this.isRunning = false;
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    this._saveHighScore();
    
    if (this.overlayEl) {
      const title = this.overlayEl.querySelector('#sudoku-overlay-title') as HTMLElement;
      const score = this.overlayEl.querySelector('#sudoku-overlay-score') as HTMLElement;
      const sub = this.overlayEl.querySelector('#sudoku-overlay-sub') as HTMLElement;
      
      if (title) title.textContent = '🎉 Победа!';
      if (score) score.textContent = `${this.highScore} очков`;
      if (sub) {
        const timeStr = this._formatTime(this.elapsedTime);
        sub.textContent = `⏱️ ${timeStr} • Рекорд: ${this.highScore}`;
      }
      
      this.overlayEl.style.display = 'block';
    }
    
    console.log('🎉 Судоку решено!');
  }

  private _loseGame(): void {
    this.gameOver = true;
    this.isRunning = false;
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    if (this.overlayEl) {
      const title = this.overlayEl.querySelector('#sudoku-overlay-title') as HTMLElement;
      const score = this.overlayEl.querySelector('#sudoku-overlay-score') as HTMLElement;
      const sub = this.overlayEl.querySelector('#sudoku-overlay-sub') as HTMLElement;
      
      if (title) title.textContent = '💀 Game Over';
      if (score) score.textContent = `${this.highScore} очков`;
      if (sub) sub.textContent = `Слишком много ошибок (${this.errors}/${this.maxErrors})`;
      
      this.overlayEl.style.display = 'block';
    }
    
    console.log('💀 Судоку проиграно');
  }

  // ==========================================
  // УПРАВЛЕНИЕ
  // ==========================================

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    console.log('▶️ Судоку запущен');
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    console.log('⏸️ Судоку на паузе');
  }

  resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    if (this.startTime !== null) {
      this.startTime = Date.now() - this.elapsedTime * 1000;
    }
    console.log('▶️ Судоку продолжен');
  }

  destroy(): void {
    this.isRunning = false;
    this.isPaused = false;
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    this._removeControls();
    
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    console.log('🧹 Судоку уничтожен');
  }

  // ==========================================
  // КНОПКИ
  // ==========================================

  private _bindButtons(): void {
    document.querySelectorAll('.sudoku-num-btn').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        const num = parseInt((btn as HTMLElement).dataset.num || '0', 10);
        this._placeNumber(num);
      };
    });
    
    if (this.boardEl) {
      this.boardEl.querySelectorAll('.sudoku-cell').forEach(cell => {
        (cell as HTMLElement).onclick = () => {
          const row = parseInt((cell as HTMLElement).dataset.row || '0', 10);
          const col = parseInt((cell as HTMLElement).dataset.col || '0', 10);
          this._selectCell(row, col);
        };
      });
    }
    
    const undoBtn = document.getElementById('sudoku-btn-undo');
    const eraseBtn = document.getElementById('sudoku-btn-erase');
    const hintBtn = document.getElementById('sudoku-btn-hint');
    const resetBtn = document.getElementById('sudoku-btn-reset');
    const restartBtn = document.getElementById('sudoku-btn-restart');
    
    if (undoBtn) {
      (undoBtn as HTMLElement).onclick = () => {
        if (this.selectedRow !== -1 && this.selectedCol !== -1) {
          this._eraseNumber();
        }
      };
    }
    
    if (eraseBtn) {
      (eraseBtn as HTMLElement).onclick = () => this._eraseNumber();
    }
    
    if (hintBtn) {
      (hintBtn as HTMLElement).onclick = () => this._useHint();
    }
    
    if (resetBtn) {
      (resetBtn as HTMLElement).onclick = () => {
        if ((window as any).tg?.showConfirm) {
          (window as any).tg.showConfirm('Сбросить прогресс в этой игре?', (ok: boolean) => {
            if (ok) this._resetGame();
          });
        } else if (confirm('Сбросить прогресс в этой игре?')) {
          this._resetGame();
        }
      };
    }
    
    if (restartBtn) {
      (restartBtn as HTMLElement).onclick = () => {
        this._resetGame();
      };
    }
  }

  // ==========================================
  // КЛАВИАТУРА
  // ==========================================

  private _setupControls(): void {
    document.addEventListener('keydown', this._handleKeyDown.bind(this));
    document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
  }

  private _removeControls(): void {
    document.removeEventListener('keydown', this._handleKeyDown.bind(this));
    document.removeEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    if (!this.isRunning || this.isPaused || this.gameOver) return;
    
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      this._placeNumber(parseInt(e.key, 10));
      return;
    }
    
    const key = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      e.preventDefault();
      if (this.selectedRow === -1) {
        this.selectedRow = 0;
        this.selectedCol = 0;
      } else {
        switch(key) {
          case 'ArrowUp': this.selectedRow = Math.max(0, this.selectedRow - 1); break;
          case 'ArrowDown': this.selectedRow = Math.min(8, this.selectedRow + 1); break;
          case 'ArrowLeft': this.selectedCol = Math.max(0, this.selectedCol - 1); break;
          case 'ArrowRight': this.selectedCol = Math.min(8, this.selectedCol + 1); break;
        }
      }
      this._updateUI();
      return;
    }
    
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      this._eraseNumber();
      return;
    }
    
    if (e.key === 'Escape') {
      this.selectedRow = -1;
      this.selectedCol = -1;
      this._updateUI();
      return;
    }
  }

  // ==========================================
  // ВИДИМОСТЬ ВКЛАДКИ
  // ==========================================

  private _handleVisibilityChange(): void {
    if (document.hidden) {
      if (this.isRunning && !this.isPaused && !this.gameOver) {
        this.pause();
      }
    }
  }

  // ==========================================
  // ПОЛУЧЕНИЕ СОСТОЯНИЯ
  // ==========================================

  getScore(): number {
    return this.highScore;
  }

  getState(): ISudokuState {
    return {
      difficulty: this.difficulty,
      errors: this.errors,
      hintsUsed: this.hintsUsed,
      elapsedTime: this.elapsedTime,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      gameOver: this.gameOver,
      highScore: this.highScore
    };
  }

  setSafeArea(_top: number, _bottom: number): void {
    // Судоку хорошо адаптируется через CSS
  }
}

// Экспортируем в глобальный объект
(window as any).SudokuGame = SudokuGame;
console.log('✅ SudokuGame v3.0.1 загружен');
