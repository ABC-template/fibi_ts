// ============================================
// src/modules/ui-footer.ts
// Управление капсулой ввода
// Версия: 3.1.0 - FIXED
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('user-input') as HTMLTextAreaElement;
  const inputArea = document.getElementById('input-area') as HTMLElement;
  const chatContainer = document.getElementById('chat-container') as HTMLElement;
  const fabBtn = document.getElementById('fab-open-input') as HTMLElement;
  const overlay = document.getElementById('input-overlay') as HTMLElement;
  const clearBtn = document.getElementById('clear-input-btn') as HTMLElement;
  const tg = (window as any).Telegram?.WebApp;

  if (userInput && inputArea && chatContainer && fabBtn && overlay && clearBtn) {
    if ((navigator as any).virtualKeyboard) {
      (navigator as any).virtualKeyboard.overlaysContent = false;
    }

    const resizeTextArea = (): void => {
      userInput.style.height = 'auto';
      userInput.style.height = (userInput.scrollHeight) + 'px';

      if (userInput.value.trim().length > 0) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    };

    userInput.addEventListener('input', resizeTextArea);

    inputArea.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    (window as any).clearUserText = function(e?: Event): void {
      if (e) e.stopPropagation();
      userInput.value = '';
      userInput.style.height = 'auto';
      clearBtn.classList.add('hidden');
      userInput.focus();
    };

    (window as any).expandInputArea = function(): void {
      fabBtn.style.opacity = '0';
      fabBtn.style.pointerEvents = 'none';

      overlay.classList.remove('hidden');
      inputArea.classList.add('active');

      if (userInput.value.length > 0) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');

      resizeTextArea();
      userInput.focus();

      const nav = document.getElementById('bottom-nav');
      if (nav) {
        nav.style.display = 'none';
      }
    };

    (window as any).collapseInputArea = function(): void {
      if ((window as any).isVoiceRecording) return;

      userInput.blur();
      inputArea.classList.remove('active');
      inputArea.classList.remove('keyboard-up');
      overlay.classList.add('hidden');

      fabBtn.style.opacity = '1';
      fabBtn.style.pointerEvents = 'auto';

      const nav = document.getElementById('bottom-nav');
      if (nav) {
        nav.style.display = 'flex';
      }
    };

    overlay.addEventListener('click', () => {
      (window as any).collapseInputArea();
    });

    if (tg) {
      try {
        tg.onEvent('viewportChanged', () => {
          if (!inputArea.classList.contains('active')) return;
          const isKeyboardOpen = window.innerHeight < tg.viewportStableHeight;
          if (isKeyboardOpen) {
            inputArea.classList.add('keyboard-up');
          } else {
            inputArea.classList.remove('keyboard-up');
          }
        });
      } catch (err) {
        console.error('Ошибка контроля вьюпорта в капсуле:', err);
      }
    }
  }
});

console.log('✅ UI Footer v3.1.0 загружен');

// ✅ ДОБАВЛЯЕМ ЭКСПОРТ
export {};
