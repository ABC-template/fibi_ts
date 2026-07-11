// ============================================
// src/modules/games/GamesModule.ts
// Модуль игр (контейнер) с полноэкранным режимом
// Версия: 5.0.0 - ДИНАМИЧЕСКАЯ ЗАГРУЗКА ИГР
// ============================================

import { headerManager } from '@/core/header-manager';
import { navigationState } from '@/core/navigation-state';
import { eventBus } from '@/core/event-bus';
import { tasksStore } from '@/store/TasksStore';

export class GamesModule {
  private container: HTMLElement;
  private isInitialized: boolean = false;
  private _mode: 'list' | 'game' = 'list';
  private _currentGameId: string | null = null;
  private _gameInstance: any = null;
  private _subscriptions: Array<() => void> = [];
  private _gameContainer: HTMLElement | null = null;
  private _gameContent: HTMLElement | null = null;
  private _gameTitle: HTMLElement | null = null;
  private _isFullscreen: boolean = false;
  private _isLoadingGame: boolean = false;
  private headerManager = headerManager;
  private navigationState = navigationState;
  private eventBus = eventBus;
  private tasksStore = tasksStore;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).gamesModule = this;

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this._render();

    this._subscribeToEvents();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
    console.log('✅ GamesModule v5.0.0 инициализирован');
  }

  // ==========================================
  // РЕНДЕРИНГ
  // ==========================================

  private _render(): void {
    this.container.innerHTML = `
      <div style="padding: 16px; flex:1; overflow-y:auto; padding-bottom: 80px;">
        <h2 style="font-size:18px; font-weight:700; margin:0 0 16px 0; color:var(--app-text-primary); display:flex; align-items:center; gap:8px;">
          <i data-lucide="gamepad-2" style="width:24px;height:24px;"></i>
          Игры
        </h2>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <!-- Тетрис -->
          <div onclick="window.gamesModule.openGame('tetris')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:40px; margin-bottom:8px;">🧩</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Тетрис</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">Классика</div>
            <div style="font-size:10px; color:var(--app-accent-primary); margin-top:4px;" id="tetris-high-score">🏆 0</div>
          </div>

          <!-- Судоку -->
          <div onclick="window.gamesModule.openGame('sudoku')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:40px; margin-bottom:8px;">🧩</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Судоку</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">Логика</div>
            <div style="font-size:10px; color:var(--app-accent-primary); margin-top:4px;" id="sudoku-high-score">🏆 0</div>
          </div>

          <!-- Змейка -->
          <div onclick="window.gamesModule.openGame('snake')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:40px; margin-bottom:8px;">🐍</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Змейка</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">Классика</div>
            <div style="font-size:10px; color:var(--app-accent-primary); margin-top:4px;" id="snake-high-score">🏆 0</div>
          </div>

          <!-- Виселица -->
          <div onclick="window.gamesModule.openGame('hangman')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:40px; margin-bottom:8px;">💀</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Виселица</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">Угадай слово</div>
            <div style="font-size:10px; color:var(--app-accent-primary); margin-top:4px;" id="hangman-high-score">🏆 0</div>
          </div>
        </div>

        <div id="game-container" style="display:none; margin-top:16px; background:var(--app-bg-secondary); border-radius:16px; border:1px solid var(--app-border-color-light); min-height:300px; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--app-border-color-light);">
            <span id="game-title" style="font-weight:700; font-size:16px; color:var(--app-text-primary);">Игра</span>
          </div>
          <div id="game-content" style="display:flex; align-items:center; justify-content:center; min-height:250px; color:var(--app-text-tertiary); font-size:14px; padding:16px;">
            Выберите игру
          </div>
        </div>
      </div>
    `;

    this._gameContainer = document.getElementById('game-container');
    this._gameContent = document.getElementById('game-content');
    this._gameTitle = document.getElementById('game-title');

    this._updateHighScores();
  }

  // ==========================================
  // ОБНОВЛЕНИЕ РЕКОРДОВ
  // ==========================================

  private _updateHighScores(): void {
    const tetrisScore = this.tasksStore.get('tetris_high_score') || 0;
    const sudokuScore = this.tasksStore.get('sudoku_high_score') || 0;
    const snakeScore = this.tasksStore.get('snake_high_score') || 0;
    const hangmanScore = this.tasksStore.get('hangman_high_score') || 0;

    const tetrisEl = document.getElementById('tetris-high-score');
    const sudokuEl = document.getElementById('sudoku-high-score');
    const snakeEl = document.getElementById('snake-high-score');
    const hangmanEl = document.getElementById('hangman-high-score');

    if (tetrisEl) tetrisEl.textContent = `🏆 ${tetrisScore}`;
    if (sudokuEl) sudokuEl.textContent = `🏆 ${sudokuScore}`;
    if (snakeEl) snakeEl.textContent = `🏆 ${snakeScore}`;
    if (hangmanEl) hangmanEl.textContent = `🏆 ${hangmanScore}`;
  }

  // ==========================================
  // ПОЛНОЭКРАННЫЙ РЕЖИМ
  // ==========================================

  private _enterFullscreen(): void {
    if (this._isFullscreen) return;
    this._isFullscreen = true;

    const header = document.getElementById('header');
    if (header) {
      header.classList.add('hidden');
    }

    if ((window as any).navigation) {
      (window as any).navigation.hide();
    }

    if (this._gameContainer) {
      this._gameContainer.style.position = 'fixed';
      this._gameContainer.style.top = '0';
      this._gameContainer.style.left = '0';
      this._gameContainer.style.width = '100vw';
      this._gameContainer.style.height = '100dvh';
      this._gameContainer.style.zIndex = '1000';
      this._gameContainer.style.margin = '0';
      this._gameContainer.style.borderRadius = '0';
      this._gameContainer.style.background = 'var(--app-bg-primary)';
      this._gameContainer.style.border = 'none';
      this._gameContainer.style.maxHeight = '100dvh';
      this._gameContainer.style.minHeight = '100dvh';
    }

    document.body.classList.add('game-fullscreen');
    console.log('🎮 Полноэкранный режим включён');
  }

  private _exitFullscreen(): void {
    if (!this._isFullscreen) return;
    this._isFullscreen = false;

    const header = document.getElementById('header');
    if (header) {
      header.classList.remove('hidden');
    }

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }

    if (this._gameContainer) {
      this._gameContainer.style.position = '';
      this._gameContainer.style.top = '';
      this._gameContainer.style.left = '';
      this._gameContainer.style.width = '';
      this._gameContainer.style.height = '';
      this._gameContainer.style.zIndex = '';
      this._gameContainer.style.margin = '';
      this._gameContainer.style.borderRadius = '';
      this._gameContainer.style.background = '';
      this._gameContainer.style.border = '';
      this._gameContainer.style.maxHeight = '';
      this._gameContainer.style.minHeight = '';
    }

    document.body.classList.remove('game-fullscreen');
    console.log('🎮 Полноэкранный режим выключен');
  }

  // ==========================================
  // ОТКРЫТИЕ ИГРЫ (С ДИНАМИЧЕСКОЙ ЗАГРУЗКОЙ)
  // ==========================================

  async openGame(gameId: string): Promise<void> {
    console.log(`🎮 [openGame] Открываем игру: ${gameId}`);

    if (this._isLoadingGame) {
      console.log('⏳ Идет загрузка игры, подождите...');
      return;
    }

    // Если уже открыта другая игра — закрываем её
    if (this._gameInstance && this._mode === 'game') {
      this._gameInstance.destroy();
      this._gameInstance = null;
    }

    this._isLoadingGame = true;

    try {
      // Динамически импортируем нужную игру
      let GameClass: any = null;
      let gameName = '';

      switch (gameId) {
        case 'tetris':
          const tetrisModule = await import('./tetris/TetrisGame.ts');
          GameClass = tetrisModule.TetrisGame;
          gameName = '🧩 Тетрис';
          break;
        case 'sudoku':
          const sudokuModule = await import('./sudoku/SudokuGame.ts');
          GameClass = sudokuModule.SudokuGame;
          gameName = '🧩 Судоку';
          break;
        case 'snake':
          // Заглушка для будущих игр
          if ((window as any).tg?.showAlert) {
            (window as any).tg.showAlert('🐍 Змейка скоро появится!');
          }
          this._isLoadingGame = false;
          return;
        case 'hangman':
          if ((window as any).tg?.showAlert) {
            (window as any).tg.showAlert('💀 Виселица скоро появится!');
          }
          this._isLoadingGame = false;
          return;
        default:
          console.warn(`⚠️ Игра ${gameId} не найдена`);
          if ((window as any).tg?.showAlert) {
            (window as any).tg.showAlert(`Игра "${gameId}" не найдена.`);
          }
          this._isLoadingGame = false;
          return;
      }

      if (!GameClass) {
        console.error(`❌ Не удалось загрузить игру ${gameId}`);
        if ((window as any).tg?.showAlert) {
          (window as any).tg.showAlert(`Ошибка загрузки игры "${gameId}". Попробуйте позже.`);
        }
        this._isLoadingGame = false;
        return;
      }

      // Показываем контейнер
      if (this._gameContainer) {
        this._gameContainer.style.display = 'block';
      }
      if (this._gameTitle) {
        this._gameTitle.textContent = gameName;
      }

      // Создаём экземпляр игры
      try {
        this._gameInstance = new GameClass();
      } catch (err) {
        console.error(`❌ Ошибка создания игры ${gameId}:`, err);
        if ((window as any).tg?.showAlert) {
          (window as any).tg.showAlert(`Ошибка загрузки игры. Попробуйте позже.`);
        }
        this._isLoadingGame = false;
        return;
      }

      // Инициализируем игру в контейнере
      if (this._gameContent) {
        try {
          this._gameInstance.init(this._gameContent);
          this._gameInstance.start();
        } catch (err) {
          console.error(`❌ Ошибка инициализации игры ${gameId}:`, err);
          if ((window as any).tg?.showAlert) {
            (window as any).tg.showAlert(`Ошибка запуска игры. Попробуйте позже.`);
          }
          this._isLoadingGame = false;
          return;
        }
      }

      // Обновляем состояние
      this._mode = 'game';
      this._currentGameId = gameId;

      // Устанавливаем заголовок
      this.headerManager.setTitle(gameName);
      this.headerManager.setActions([]);

      // Включаем полноэкранный режим
      this._enterFullscreen();

      // Сообщаем NavigationState о переходе в игру
      if (this.navigationState) {
        (this.navigationState as any)._state.params = {
          ...(this.navigationState as any)._state.params,
          gameMode: 'game',
          gameId: gameId
        };
        (this.navigationState as any)._updateBackButton();
      }

      // Отправляем событие о смене режима
      this.eventBus.emit('games:mode_changed', { mode: 'game', gameId }, this);

      console.log(`✅ Игра ${gameId} открыта в полноэкранном режиме`);
    } catch (err) {
      console.error(`❌ Критическая ошибка при открытии игры ${gameId}:`, err);
      if ((window as any).tg?.showAlert) {
        (window as any).tg.showAlert(`Ошибка загрузки игры. Попробуйте позже.`);
      }
    } finally {
      this._isLoadingGame = false;
    }
  }

  // ==========================================
  // ЗАКРЫТИЕ ИГРЫ
  // ==========================================

  closeGame(): void {
    console.log('🎮 [closeGame] Закрываем игру...');

    if (this._gameInstance) {
      try {
        this._gameInstance.destroy();
      } catch (err) {
        console.warn('⚠️ Ошибка при уничтожении игры:', err);
      }
      this._gameInstance = null;
    }

    this._exitFullscreen();

    if (this._gameContainer) {
      this._gameContainer.style.display = 'none';
    }
    if (this._gameContent) {
      this._gameContent.innerHTML = '';
    }

    this.headerManager.setTitle(null);
    this.headerManager.setActions([]);

    this._mode = 'list';
    this._currentGameId = null;

    if (this.navigationState) {
      (this.navigationState as any)._state.params = {
        ...(this.navigationState as any)._state.params,
        gameMode: 'list',
        gameId: null
      };
      (this.navigationState as any)._updateBackButton();
    }

    this.eventBus.emit('games:mode_changed', { mode: 'list' }, this);

    this._updateHighScores();

    console.log('✅ Игра закрыта, возврат в список');
  }

  // ==========================================
  // ПОДПИСКА НА СОБЫТИЯ
  // ==========================================

  private _subscribeToEvents(): void {
    const unsubScore = this.eventBus.on('game:score_updated', () => {
      this._updateHighScores();
    }, this);
    this._subscriptions.push(unsubScore);

    const unsubNav = this.eventBus.on('navigation:go_back', () => {
      if (this._mode === 'game' && this._gameInstance) {
        this.closeGame();
      }
    }, this);
    this._subscriptions.push(unsubNav);

    console.log('📡 GamesModule подписан на события');
  }

  // ==========================================
  // ПОЛУЧЕНИЕ СОСТОЯНИЯ
  // ==========================================

  getMode(): 'list' | 'game' {
    return this._mode;
  }

  getCurrentGameId(): string | null {
    return this._currentGameId;
  }

  isGameOpen(): boolean {
    return this._mode === 'game';
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

    if (this._mode === 'game' && this._currentGameId) {
      const gameNames: Record<string, string> = {
        tetris: '🧩 Тетрис',
        sudoku: '🧩 Судоку',
        snake: '🐍 Змейка',
        hangman: '💀 Виселица'
      };
      this.headerManager.setTitle(gameNames[this._currentGameId] || 'Игра');
      this.headerManager.setActions([]);
      if (!this._isFullscreen) {
        this._enterFullscreen();
      }
    } else {
      this.headerManager.setTitle(null);
      this.headerManager.setActions([]);
      if (this._isFullscreen) {
        this._exitFullscreen();
      }
    }

    if ((window as any).navigation) {
      (window as any).navigation.show();
    }

    this._updateHighScores();
  }

  hide(): void {
    if (this._mode === 'game' && this._gameInstance) {
      try {
        this._gameInstance.destroy();
      } catch (err) {
        console.warn('⚠️ Ошибка при уничтожении игры:', err);
      }
      this._gameInstance = null;
      this._mode = 'list';
      this._currentGameId = null;

      this._exitFullscreen();

      if (this._gameContainer) {
        this._gameContainer.style.display = 'none';
      }
      if (this._gameContent) {
        this._gameContent.innerHTML = '';
      }
    }

    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  destroy(): void {
    if (this._gameInstance) {
      try {
        this._gameInstance.destroy();
      } catch (err) {
        console.warn('⚠️ Ошибка при уничтожении игры:', err);
      }
      this._gameInstance = null;
    }

    this._exitFullscreen();

    for (const unsub of this._subscriptions) {
      try {
        unsub();
      } catch (e) {
        console.warn('Ошибка отписки GamesModule:', e);
      }
    }
    this._subscriptions = [];
    console.log('📡 GamesModule отписан от событий');
  }
}

// Экспортируем класс в глобальный объект
(window as any).GamesModule = GamesModule;

console.log('✅ GamesModule v5.0.0 загружен (динамическая загрузка игр)');
