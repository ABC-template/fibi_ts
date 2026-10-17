// ============================================
// src/modules/games/GamesModule.ts
// Модуль игр (контейнер) с полноэкранным режимом
// Версия: 6.3.1 - без console.log с устаревшим номером версии
//          6.3.0 - открытая игра — слой в стеке навигации: «Назад» Telegram закрывает игру
//                 (раньше закрывались и игра, и раздел — два обработчика одной кнопки);
//                 нижнее меню скрывается на время игры через navigation.setVisible;
//                 шапку не трогает (рамку экрана ведёт ModuleLoader); уход из раздела
//                 закрывает игру через closeGame
//          6.2.0 - исправлен импорт
// ============================================

import { navigationState } from '@/core/navigation-state';
import { navigation } from '@/core/navigation';
import { eventBus } from '@/core/event-bus';
import { questsStore } from '@/store/QuestsStore';

/** Открытая игра в стеке слоёв навигации («Назад» закрывает её) */
const GAME_LAYER_ID = 'game';

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
  private navigationState = navigationState;
  private eventBus = eventBus;
  private questsStore = questsStore;
  
  private userId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    (window as any).gamesModule = this;

    this._render();
    this._subscribeToEvents();
    this._subscribeToBalance();

    setTimeout(() => {
      if (typeof (window as any).lucide !== 'undefined') {
        (window as any).lucide.createIcons();
      }
    }, 200);

    this.isInitialized = true;
  }

  private _subscribeToBalance(): void {
    const unsub = this.eventBus.on('economy:balance:updated', (data) => {
      if (data.userId === this.userId) {
        this._updateBalanceUI(data.newBalance);
      }
    }, this);
    this._subscriptions.push(unsub);
  }

  private _updateBalanceUI(newBalance: number): void {
    document.querySelectorAll('.game-balance-display').forEach(el => {
      (el as HTMLElement).textContent = String(newBalance);
    });
  }

  private _render(): void {
    this.container.innerHTML = `
      <div style="padding: 16px; flex:1; overflow-y:auto;">
        <h2 style="font-size:18px; font-weight:700; margin:0 0 16px 0; color:var(--app-text-primary); display:flex; align-items:center; gap:8px;">
          <i data-lucide="gamepad-2" style="width:24px;height:24px;"></i>
          Игры
        </h2>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div onclick="window.gamesModule.openGame('tetris')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:40px; margin-bottom:8px;">🧩</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Тетрис</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">Классика</div>
            <div style="font-size:10px; color:var(--app-accent-primary); margin-top:4px;" id="tetris-high-score">🏆 0</div>
          </div>

          <div onclick="window.gamesModule.openGame('sudoku')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:40px; margin-bottom:8px;">🧩</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Судоку</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">Логика</div>
            <div style="font-size:10px; color:var(--app-accent-primary); margin-top:4px;" id="sudoku-high-score">🏆 0</div>
          </div>

          <div onclick="window.gamesModule.openGame('snake')" style="background:var(--app-bg-secondary); padding:20px; border-radius:16px; text-align:center; cursor:pointer; border:1px solid var(--app-border-color-light); transition:all 0.2s;">
            <div style="font-size:40px; margin-bottom:8px;">🐍</div>
            <div style="font-size:14px; font-weight:600; color:var(--app-text-primary);">Змейка</div>
            <div style="font-size:11px; color:var(--app-text-tertiary);">Классика</div>
            <div style="font-size:10px; color:var(--app-accent-primary); margin-top:4px;" id="snake-high-score">🏆 0</div>
          </div>

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

  private _updateHighScores(): void {
    const tetrisScore = this.questsStore.getGameData<number>('tetris_high_score', 0);
    const sudokuScore = this.questsStore.getGameData<number>('sudoku_high_score', 0);
    const snakeScore = this.questsStore.getGameData<number>('snake_high_score', 0);
    const hangmanScore = this.questsStore.getGameData<number>('hangman_high_score', 0);

    const tetrisEl = document.getElementById('tetris-high-score');
    const sudokuEl = document.getElementById('sudoku-high-score');
    const snakeEl = document.getElementById('snake-high-score');
    const hangmanEl = document.getElementById('hangman-high-score');

    if (tetrisEl) tetrisEl.textContent = `🏆 ${tetrisScore}`;
    if (sudokuEl) sudokuEl.textContent = `🏆 ${sudokuScore}`;
    if (snakeEl) snakeEl.textContent = `🏆 ${snakeScore}`;
    if (hangmanEl) hangmanEl.textContent = `🏆 ${hangmanScore}`;
  }

  private _enterFullscreen(): void {
    if (this._isFullscreen) return;
    this._isFullscreen = true;

    const header = document.getElementById('header');
    if (header) {
      header.classList.add('hidden');
    }

    navigation.setVisible(false);

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

    navigation.setVisible(true);

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

  async openGame(gameId: string): Promise<void> {
    console.log(`🎮 [openGame] Открываем игру: ${gameId}`);

    if (this._isLoadingGame) {
      console.log('⏳ Идет загрузка игры, подождите...');
      return;
    }

    if (this._gameInstance && this._mode === 'game') {
      this._gameInstance.destroy();
      this._gameInstance = null;
    }

    this._isLoadingGame = true;

    try {
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

      if (this._gameContainer) {
        this._gameContainer.style.display = 'block';
      }
      if (this._gameTitle) {
        this._gameTitle.textContent = gameName;
      }

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

      this._mode = 'game';
      this._currentGameId = gameId;

      this._enterFullscreen();
      this.navigationState.toggleModal(true, GAME_LAYER_ID);

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

    this._mode = 'list';
    this._currentGameId = null;
    this.navigationState.toggleModal(false, GAME_LAYER_ID);

    this._updateHighScores();

    console.log('✅ Игра закрыта, возврат в список');
  }

  private _subscribeToEvents(): void {
    const unsubScore = this.eventBus.on('game:score_updated', () => {
      this._updateHighScores();
    }, this);
    this._subscriptions.push(unsubScore);

    // «Назад» Telegram: NavigationState снял слой игры — закрываем её
    const unsubNav = this.eventBus.on('modal:state_changed', (data) => {
      if (data?.action === 'back' && data.modalId === GAME_LAYER_ID && this._mode === 'game') {
        this.closeGame();
      }
    }, this);
    this._subscriptions.push(unsubNav);

    console.log('📡 GamesModule подписан на события');
  }

  getMode(): 'list' | 'game' {
    return this._mode;
  }

  getCurrentGameId(): string | null {
    return this._currentGameId;
  }

  isGameOpen(): boolean {
    return this._mode === 'game';
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.width = '100%';

    this._updateHighScores();
  }

  /** Уход из раздела закрывает игру (она живёт только на экране игр) */
  hide(): void {
    if (this._mode === 'game') this.closeGame();

    this.container.classList.add('hidden');
    this.container.style.display = 'none';
  }

  destroy(): void {
    if (this._mode === 'game') this.closeGame();

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

(window as any).GamesModule = GamesModule;
