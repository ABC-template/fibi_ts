// ============================================
// src/modules/games/tetris/TetrisGame.ts
// Описание: Классический Тетрис
// Версия: 4.0.0 - CLEAN
// ============================================

import './tetris.css';
import { tasksStore } from '@/store/TasksStore';

export interface ITetrisState {
  score: number;
  lines: number;
  level: number;
  highScore: number;
  isRunning: boolean;
  isPaused: boolean;
  gameOver: boolean;
  totalGames: number;
  totalLines: number;
  bestScore: number;
  gamesWon: number;
  achievements: Record<string, boolean>;
}

interface IPiece {
  shape: number[][];
  color: string;
}

export class TetrisGame {
  private container: HTMLElement | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private score: number = 0;
  private lines: number = 0;
  private level: number = 1;
  private gameOver: boolean = false;
  private highScore: number = 0;
  private animationId: number | null = null;
  private dropInterval: number = 1000;
  private lastDropTime: number = 0;
  
  // Игровое поле
  private cols: number = 10;
  private rows: number = 20;
  private board: string[][] = [];
  private currentPiece: IPiece & { row: number; col: number } | null = null;
  private nextPiece: IPiece | null = null;
  private ghostRow: number = 0;
  
  // Статистика
  private totalGames: number = 0;
  private totalLines: number = 0;
  private bestScore: number = 0;
  private gamesWon: number = 0;
  
  // Флаг для анимации удаления
  private _isClearingLines: boolean = false;
  private _isPausedByVisibility: boolean = false;
  
  // Фигуры
  private pieces: IPiece[] = [
    { shape: [[1, 1, 1, 1]], color: 'I' },
    { shape: [[1, 1], [1, 1]], color: 'O' },
    { shape: [[0, 1, 0], [1, 1, 1]], color: 'T' },
    { shape: [[0, 1, 1], [1, 1, 0]], color: 'S' },
    { shape: [[1, 1, 0], [0, 1, 1]], color: 'Z' },
    { shape: [[1, 0, 0], [1, 1, 1]], color: 'J' },
    { shape: [[0, 0, 1], [1, 1, 1]], color: 'L' }
  ];
  
  // Достижения
  private achievements: Record<string, boolean> = {
    firstGame: false,
    line10: false,
    line50: false,
    line100: false,
    score1000: false,
    score5000: false,
    level5: false,
    level10: false,
    tetris: false,
    perfectClear: false
  };
  
  // DOM элементы
  private boardEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private scoreEl: HTMLElement | null = null;
  private linesEl: HTMLElement | null = null;
  private levelEl: HTMLElement | null = null;
  private highEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private pauseBtn: HTMLElement | null = null;
  private resetBtn: HTMLElement | null = null;

  constructor() {
    // Пустой конструктор
  }

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ
  // ==========================================

  init(container: HTMLElement): void {
    this.container = container;
    this._loadStats();
    this._initBoard();
    this._spawnPiece();
    this._spawnNextPiece();
    this._render();
    this._setupControls();
    
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gameOver = false;
    this.isRunning = false;
    this.isPaused = false;
    this._isClearingLines = false;
    
    console.log('🧩 Тетрис v4.0.0 инициализирован');
  }

  // ==========================================
  // СТАТИСТИКА
  // ==========================================

  private _loadStats(): void {
    this.highScore = (tasksStore.get('tetris_high_score') as number) || 0;
    this.totalGames = (tasksStore.get('tetris_total_games') as number) || 0;
    this.totalLines = (tasksStore.get('tetris_total_lines') as number) || 0;
    this.bestScore = (tasksStore.get('tetris_best_score') as number) || 0;
    this.gamesWon = (tasksStore.get('tetris_games_won') as number) || 0;
    
    const savedAchievements = tasksStore.get('tetris_achievements') as Record<string, boolean>;
    if (savedAchievements) {
      this.achievements = { ...this.achievements, ...savedAchievements };
    }
  }

  private _saveStats(): void {
    tasksStore.set('tetris_high_score', this.highScore);
    tasksStore.set('tetris_total_games', this.totalGames);
    tasksStore.set('tetris_total_lines', this.totalLines);
    tasksStore.set('tetris_best_score', this.bestScore);
    tasksStore.set('tetris_games_won', this.gamesWon);
    tasksStore.set('tetris_achievements', this.achievements);
  }

  // ==========================================
  // УПРАВЛЕНИЕ
  // ==========================================

  start(): void {
    if (this.isRunning) return;
    if (this.gameOver) {
      this._resetGame();
    }
    
    this.isRunning = true;
    this.isPaused = false;
    this.lastDropTime = performance.now();
    this.totalGames++;
    this._saveStats();
    this._gameLoop(performance.now());
    
    console.log('▶️ Тетрис запущен');
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    if (this._isClearingLines) return;
    
    this.isPaused = true;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this._updateUI();
    console.log('⏸️ Тетрис на паузе');
  }

  resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.lastDropTime = performance.now();
    this._gameLoop(performance.now());
    this._updateUI();
    console.log('▶️ Тетрис продолжен');
  }

  destroy(): void {
    this.isRunning = false;
    this.isPaused = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    this._removeControls();
    
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    console.log('🧹 Тетрис уничтожен');
  }

  // ==========================================
  // ИГРОВОЙ ЦИКЛ
  // ==========================================

  private _gameLoop(timestamp: number): void {
    if (!this.isRunning || this.isPaused || this.gameOver) {
      return;
    }
    
    this.animationId = requestAnimationFrame((t) => this._gameLoop(t));
    
    const delta = timestamp - this.lastDropTime;
    const interval = Math.max(80, this.dropInterval - (this.level - 1) * 80);
    
    if (delta >= interval) {
      this.lastDropTime = timestamp;
      this._movePieceDown();
    }
  }

  // ==========================================
  // РЕНДЕРИНГ
  // ==========================================

  private _render(): void {
    if (!this.container) return;
    
    // Сокращенный рендеринг (основная логика)
    this.container.innerHTML = `
      <div class="tetris-container" id="tetris-container">
        <div class="tetris-game-wrapper">
          <div class="tetris-board" id="tetris-board">
            ${this._renderBoardWithPiece()}
          </div>
          <div class="tetris-side-panel">
            <div class="tetris-preview">
              <span class="tetris-preview-label">След.</span>
              <div id="tetris-preview-grid" class="tetris-preview-grid">
                ${this._renderPreview()}
              </div>
            </div>
            <div class="tetris-info">
              <div class="tetris-info-row">
                <span class="tetris-info-item">🏆 <span class="value" id="tetris-score">0</span></span>
                <span class="tetris-info-item">📊 <span class="value" id="tetris-lines">0</span></span>
              </div>
              <div class="tetris-info-row">
                <span class="tetris-info-item">📈 <span class="value" id="tetris-level">1</span></span>
                <span class="tetris-info-item">⭐ <span class="value" id="tetris-high">${this.highScore}</span></span>
              </div>
            </div>
            <div class="tetris-actions">
              <button class="tetris-btn" id="tetris-btn-pause"><i data-lucide="pause"></i></button>
              <button class="tetris-btn" id="tetris-btn-reset"><i data-lucide="rotate-ccw"></i></button>
            </div>
          </div>
        </div>
        <div class="tetris-controls">
          <button class="tetris-btn" data-action="left">◀</button>
          <button class="tetris-btn" data-action="rotate">↻</button>
          <button class="tetris-btn" data-action="down">▼</button>
          <button class="tetris-btn primary" data-action="drop">▼▼</button>
          <button class="tetris-btn" data-action="right">▶</button>
        </div>
        <div id="tetris-overlay" style="display:none;">
          <div class="tetris-overlay">
            <h3 id="tetris-overlay-title">⏸️ Пауза</h3>
            <div class="score" id="tetris-overlay-score">0</div>
            <div class="sub" id="tetris-overlay-sub"></div>
            <div class="btn-group">
              <button class="tetris-btn primary" id="tetris-overlay-primary">▶ Продолжить</button>
              <button class="tetris-btn" id="tetris-overlay-secondary">🔄 Новая игра</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.boardEl = document.getElementById('tetris-board');
    this.previewEl = document.getElementById('tetris-preview-grid');
    this.scoreEl = document.getElementById('tetris-score');
    this.linesEl = document.getElementById('tetris-lines');
    this.levelEl = document.getElementById('tetris-level');
    this.highEl = document.getElementById('tetris-high');
    this.overlayEl = document.getElementById('tetris-overlay');
    this.pauseBtn = document.getElementById('tetris-btn-pause');
    this.resetBtn = document.getElementById('tetris-btn-reset');
    
    this._bindButtons();
    this._updateUI();
  }

  private _renderBoardWithPiece(): string {
    const displayBoard = this.board.map(row => [...row]);
    
    if (this.currentPiece && this.ghostRow !== null && !this._isClearingLines) {
      const { shape, col, color } = this.currentPiece;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const boardRow = this.ghostRow + r;
            const boardCol = col + c;
            if (boardRow >= 0 && boardRow < this.rows && boardCol >= 0 && boardCol < this.cols) {
              if (!displayBoard[boardRow][boardCol]) {
                displayBoard[boardRow][boardCol] = color + ' ghost';
              }
            }
          }
        }
      }
    }
    
    if (this.currentPiece && !this._isClearingLines) {
      const { shape, row, col, color } = this.currentPiece;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const boardRow = row + r;
            const boardCol = col + c;
            if (boardRow >= 0 && boardRow < this.rows && boardCol >= 0 && boardCol < this.cols) {
              displayBoard[boardRow][boardCol] = color;
            }
          }
        }
      }
    }
    
    let html = '';
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const value = displayBoard[r][c] || '';
        const classes = value ? `tetris-cell ${value}` : 'tetris-cell';
        html += `<div class="${classes}"></div>`;
      }
    }
    return html;
  }

  private _renderPreview(): string {
    if (!this.nextPiece || !this.nextPiece.shape || this.nextPiece.shape.length === 0) {
      return Array(16).fill('').map(() => 
        `<div class="tetris-preview-cell"></div>`
      ).join('');
    }
    
    const shape = this.nextPiece.shape;
    const color = this.nextPiece.color;
    
    const rows = shape.length;
    const cols = shape[0].length;
    const offsetY = Math.floor((4 - rows) / 2);
    const offsetX = Math.floor((4 - cols) / 2);
    
    const flat: string[] = [];
    
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const shapeR = r - offsetY;
        const shapeC = c - offsetX;
        
        if (shapeR >= 0 && shapeR < rows && shapeC >= 0 && shapeC < cols && shape[shapeR] && shape[shapeR][shapeC]) {
          flat.push(`<div class="tetris-preview-cell ${color}"></div>`);
        } else {
          flat.push(`<div class="tetris-preview-cell"></div>`);
        }
      }
    }
    
    return flat.join('');
  }

  // ==========================================
  // ОБНОВЛЕНИЕ UI
  // ==========================================

  private _updateUI(): void {
    if (!this.boardEl) return;
    
    if (this._isClearingLines) return;
    
    this.boardEl.innerHTML = this._renderBoardWithPiece();
    
    if (this.scoreEl) this.scoreEl.textContent = String(this.score);
    if (this.linesEl) this.linesEl.textContent = String(this.lines);
    if (this.levelEl) this.levelEl.textContent = String(this.level);
    if (this.highEl) this.highEl.textContent = String(this.highScore);
    
    if (this.previewEl) {
      this.previewEl.innerHTML = this._renderPreview();
    }
    
    this._updateOverlay();
  }

  private _updateOverlay(): void {
    if (!this.overlayEl) return;
    
    if (this.isPaused || this.gameOver) {
      this.overlayEl.style.display = 'block';
      const title = document.getElementById('tetris-overlay-title') as HTMLElement;
      const score = document.getElementById('tetris-overlay-score') as HTMLElement;
      const sub = document.getElementById('tetris-overlay-sub') as HTMLElement;
      const primary = document.getElementById('tetris-overlay-primary') as HTMLElement;
      const secondary = document.getElementById('tetris-overlay-secondary') as HTMLElement;
      
      if (this.gameOver) {
        if (title) title.textContent = '💀 Game Over';
        if (score) score.textContent = `${this.score} очков`;
        if (sub) {
          const isNewRecord = this.score > this.highScore;
          sub.textContent = isNewRecord ? '🏆 Новый рекорд!' : `Рекорд: ${this.highScore}`;
        }
        if (primary) {
          primary.textContent = '🔄 Играть снова';
          (primary as HTMLElement).onclick = () => {
            this._resetGame();
            this.start();
          };
        }
        if (secondary) {
          secondary.textContent = '🏠 Выйти';
          (secondary as HTMLElement).onclick = () => {
            if ((window as any).gamesModule) {
              (window as any).gamesModule.closeGame();
            }
          };
        }
      } else if (this.isPaused) {
        if (title) title.textContent = '⏸️ Пауза';
        if (score) score.textContent = `${this.score} очков`;
        if (sub) sub.textContent = '';
        if (primary) {
          primary.textContent = '▶ Продолжить';
          (primary as HTMLElement).onclick = () => this.resume();
        }
        if (secondary) {
          secondary.textContent = '🔄 Новая игра';
          (secondary as HTMLElement).onclick = () => {
            this._resetGame();
            this.start();
          };
        }
      }
    } else {
      this.overlayEl.style.display = 'none';
    }
  }

  // ==========================================
  // ЛОГИКА ИГРЫ
  // ==========================================

  private _initBoard(): void {
    this.board = [];
    for (let r = 0; r < this.rows; r++) {
      this.board[r] = new Array(this.cols).fill('');
    }
  }

  private _getRandomPiece(): IPiece {
    const index = Math.floor(Math.random() * this.pieces.length);
    const piece = this.pieces[index];
    return {
      shape: piece.shape.map(row => [...row]),
      color: piece.color
    };
  }

  private _spawnPiece(): void {
    if (this.nextPiece) {
      this.currentPiece = {
        shape: this.nextPiece.shape.map(row => [...row]),
        color: this.nextPiece.color,
        row: 0,
        col: Math.floor((this.cols - this.nextPiece.shape[0].length) / 2)
      };
    } else {
      const piece = this._getRandomPiece();
      this.currentPiece = {
        shape: piece.shape.map(row => [...row]),
        color: piece.color,
        row: 0,
        col: Math.floor((this.cols - piece.shape[0].length) / 2)
      };
    }
    
    this.nextPiece = this._getRandomPiece();
    this.ghostRow = this._getGhostRow();
    
    if (this._collision(this.currentPiece.shape, this.currentPiece.row, this.currentPiece.col)) {
      this.gameOver = true;
      this.isRunning = false;
      this._checkHighScore();
      this._updateUI();
    }
  }

  private _spawnNextPiece(): void {
    this.nextPiece = this._getRandomPiece();
  }

  private _collision(shape: number[][], row: number, col: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardRow = row + r;
          const boardCol = col + c;
          if (boardRow >= this.rows || boardCol < 0 || boardCol >= this.cols || boardRow < 0) {
            return true;
          }
          if (boardRow >= 0 && this.board[boardRow][boardCol]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private _lockPiece(): void {
    const { shape, row, col, color } = this.currentPiece!;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardRow = row + r;
          const boardCol = col + c;
          if (boardRow >= 0 && boardRow < this.rows) {
            this.board[boardRow][boardCol] = color;
          }
        }
      }
    }
    
    this._clearLines();
    
    if (!this._isClearingLines) {
      this._spawnPiece();
      this._updateUI();
    }
  }

  // ==========================================
  // УДАЛЕНИЕ СТРОК
  // ==========================================

  private _clearLines(): void {
    let cleared = 0;
    const clearedRows: number[] = [];
    
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.board[r].every(cell => cell !== '')) {
        clearedRows.push(r);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      this._isClearingLines = true;
      
      if (cleared === 4) this._unlockAchievement('tetris');
      if (cleared === this.rows) this._unlockAchievement('perfectClear');
      
      const cells = this.boardEl?.querySelectorAll('.tetris-cell') || [];
      for (const row of clearedRows) {
        for (let c = 0; c < this.cols; c++) {
          const idx = row * this.cols + c;
          if (cells[idx]) {
            (cells[idx] as HTMLElement).classList.add('flash');
          }
        }
      }
      
      setTimeout(() => {
        clearedRows.sort((a, b) => b - a);
        
        for (const row of clearedRows) {
          this.board.splice(row, 1);
          this.board.unshift(new Array(this.cols).fill(''));
        }
        
        const points = [0, 100, 300, 500, 800];
        const earned = points[Math.min(cleared, 4)] * this.level;
        this.score += earned;
        this.lines += cleared;
        this.totalLines += cleared;
        this.level = Math.floor(this.lines / 10) + 1;
        
        if (this.lines >= 10) this._unlockAchievement('line10');
        if (this.lines >= 50) this._unlockAchievement('line50');
        if (this.lines >= 100) this._unlockAchievement('line100');
        if (this.score >= 1000) this._unlockAchievement('score1000');
        if (this.score >= 5000) this._unlockAchievement('score5000');
        if (this.level >= 5) this._unlockAchievement('level5');
        if (this.level >= 10) this._unlockAchievement('level10');
        
        this._checkHighScore();
        
        this._isClearingLines = false;
        this._spawnPiece();
        this._updateUI();
      }, 250);
    }
  }

  // ==========================================
  // ДВИЖЕНИЯ ФИГУР
  // ==========================================

  private _movePieceDown(): void {
    if (!this.currentPiece || this.gameOver || this.isPaused) return;
    if (this._isClearingLines) return;
    
    const { shape, row, col } = this.currentPiece;
    if (!this._collision(shape, row + 1, col)) {
      this.currentPiece.row++;
      this.ghostRow = this._getGhostRow();
      this._updateUI();
    } else {
      this._lockPiece();
      this._updateUI();
    }
  }

  private _movePieceLeft(): void {
    if (!this.currentPiece || this.gameOver || this.isPaused) return;
    if (this._isClearingLines) return;
    
    const { shape, row, col } = this.currentPiece;
    if (!this._collision(shape, row, col - 1)) {
      this.currentPiece.col--;
      this.ghostRow = this._getGhostRow();
      this._updateUI();
    }
  }

  private _movePieceRight(): void {
    if (!this.currentPiece || this.gameOver || this.isPaused) return;
    if (this._isClearingLines) return;
    
    const { shape, row, col } = this.currentPiece;
    if (!this._collision(shape, row, col + 1)) {
      this.currentPiece.col++;
      this.ghostRow = this._getGhostRow();
      this._updateUI();
    }
  }

  private _rotatePiece(): void {
    if (!this.currentPiece || this.gameOver || this.isPaused) return;
    if (this._isClearingLines) return;
    
    const shape = this.currentPiece.shape;
    const rotated = shape[0].map((_, index) => 
      shape.map(row => row[index]).reverse()
    );
    
    let offset = 0;
    const maxOffset = 2;
    const newCol = this.currentPiece.col;
    
    while (offset <= maxOffset) {
      if (!this._collision(rotated, this.currentPiece.row, newCol + offset)) {
        this.currentPiece.shape = rotated;
        this.currentPiece.col = newCol + offset;
        this.ghostRow = this._getGhostRow();
        this._updateUI();
        return;
      }
      if (!this._collision(rotated, this.currentPiece.row, newCol - offset)) {
        this.currentPiece.shape = rotated;
        this.currentPiece.col = newCol - offset;
        this.ghostRow = this._getGhostRow();
        this._updateUI();
        return;
      }
      offset++;
    }
  }

  private _hardDrop(): void {
    if (!this.currentPiece || this.gameOver || this.isPaused) return;
    if (this._isClearingLines) return;
    
    let dropDistance = 0;
    while (!this._collision(
      this.currentPiece.shape,
      this.currentPiece.row + dropDistance + 1,
      this.currentPiece.col
    )) {
      dropDistance++;
    }
    this.currentPiece.row += dropDistance;
    this._lockPiece();
    this._updateUI();
  }

  private _getGhostRow(): number {
    if (!this.currentPiece) return 0;
    let row = this.currentPiece.row;
    while (!this._collision(
      this.currentPiece.shape,
      row + 1,
      this.currentPiece.col
    )) {
      row++;
    }
    return row;
  }

  // ==========================================
  // ДОСТИЖЕНИЯ
  // ==========================================

  private _unlockAchievement(id: string): void {
    if (this.achievements[id]) return;
    
    this.achievements[id] = true;
    this._saveStats();
    
    const rewards: Record<string, number> = {
      firstGame: 10,
      line10: 15,
      line50: 30,
      line100: 50,
      score1000: 20,
      score5000: 40,
      level5: 25,
      level10: 45,
      tetris: 35,
      perfectClear: 60
    };
    
    const names: Record<string, string> = {
      firstGame: '🏁 Первая игра',
      line10: '📊 10 линий',
      line50: '📊 50 линий',
      line100: '📊 100 линий',
      score1000: '🏆 1000 очков',
      score5000: '🏆 5000 очков',
      level5: '📈 Уровень 5',
      level10: '📈 Уровень 10',
      tetris: '🧩 TETRIS!',
      perfectClear: '✨ Perfect Clear!'
    };
    
    const reward = rewards[id] || 10;
    tasksStore.addBalance(reward, `🏆 Достижение: ${names[id]}`);
    
    if ((window as any).uiRenderer) {
      (window as any).uiRenderer.showToast(`🏆 ${names[id]}! +${reward} 🪙`, 'success', 2500);
    }
    
    console.log(`🏆 Достижение разблокировано: ${names[id]}`);
  }

  // ==========================================
  // РЕКОРДЫ
  // ==========================================

  private _checkHighScore(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this._saveStats();
      
      tasksStore.addBalance(30, '🏆 Новый рекорд в Тетрисе!');
      
      if ((window as any).uiRenderer) {
        (window as any).uiRenderer.showToast('🏆 Новый рекорд! +30 🪙', 'success', 2000);
      }
    }
  }

  // ==========================================
  // СБРОС
  // ==========================================

  private _resetGame(): void {
    if (this.lines > 0) this.totalLines += this.lines;
    if (this.score > this.bestScore) this.bestScore = this.score;
    if (this.gameOver && this.lines > 0) this.gamesWon++;
    this._saveStats();
    
    this._initBoard();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gameOver = false;
    this.isRunning = false;
    this.isPaused = false;
    this._isClearingLines = false;
    
    if (this.overlayEl) {
      this.overlayEl.style.display = 'none';
    }
    
    this._spawnPiece();
    this._spawnNextPiece();
    this._updateUI();
    
    console.log('🔄 Тетрис сброшен');
  }

  // ==========================================
  // КНОПКИ
  // ==========================================

  private _bindButtons(): void {
    const actionMap: Record<string, () => void> = {
      'left': () => this._movePieceLeft(),
      'right': () => this._movePieceRight(),
      'rotate': () => this._rotatePiece(),
      'down': () => this._movePieceDown(),
      'drop': () => this._hardDrop()
    };
    
    document.querySelectorAll('.tetris-btn[data-action]').forEach(btn => {
      const action = (btn as HTMLElement).dataset.action || '';
      const handler = actionMap[action];
      
      if (handler) {
        (btn as HTMLElement).onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          handler();
        };
      }
    });
    
    if (this.pauseBtn) {
      (this.pauseBtn as HTMLElement).onclick = (e) => {
        e.preventDefault();
        if (this.gameOver) return;
        if (this._isClearingLines) return;
        
        if (this.isPaused) {
          this.resume();
        } else {
          this.pause();
        }
        this._updateUI();
      };
    }
    
    if (this.resetBtn) {
      (this.resetBtn as HTMLElement).onclick = (e) => {
        e.preventDefault();
        if ((window as any).tg?.showConfirm) {
          (window as any).tg.showConfirm('Начать новую игру?', (ok: boolean) => {
            if (ok) {
              this._resetGame();
              this.start();
            }
          });
        } else if (confirm('Начать новую игру?')) {
          this._resetGame();
          this.start();
        }
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
    if (!this.isRunning || this.gameOver) return;
    if (this._isClearingLines) return;
    
    const key = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Space'].includes(key)) {
      e.preventDefault();
    }
    
    switch(key) {
      case 'ArrowLeft': this._movePieceLeft(); break;
      case 'ArrowRight': this._movePieceRight(); break;
      case 'ArrowDown': this._movePieceDown(); break;
      case 'ArrowUp': this._rotatePiece(); break;
      case ' ':
      case 'Space': this._hardDrop(); break;
      case 'p':
      case 'P': 
        if (this.isPaused) {
          this.resume();
        } else {
          this.pause();
        }
        this._updateUI();
        break;
    }
  }

  // ==========================================
  // ВИДИМОСТЬ ВКЛАДКИ
  // ==========================================

  private _handleVisibilityChange(): void {
    if (document.hidden) {
      if (this.isRunning && !this.isPaused && !this.gameOver && !this._isClearingLines) {
        this._isPausedByVisibility = true;
        this.pause();
        this._updateUI();
      }
    } else {
      if (this._isPausedByVisibility && this.isPaused) {
        this._isPausedByVisibility = false;
        this.resume();
        this._updateUI();
      }
    }
  }

  // ==========================================
  // ПОЛУЧЕНИЕ СОСТОЯНИЯ
  // ==========================================

  getScore(): number {
    return this.score;
  }

  getState(): ITetrisState {
    return {
      score: this.score,
      lines: this.lines,
      level: this.level,
      highScore: this.highScore,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      gameOver: this.gameOver,
      totalGames: this.totalGames,
      totalLines: this.totalLines,
      bestScore: this.bestScore,
      gamesWon: this.gamesWon,
      achievements: this.achievements
    };
  }

  setSafeArea(_top: number, _bottom: number): void {
    // Адаптация через CSS
  }
}

// Экспортируем в глобальный объект
(window as any).TetrisGame = TetrisGame;
console.log('✅ TetrisGame v4.0.0 загружен');
