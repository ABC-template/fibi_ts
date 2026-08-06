// ============================================
// src/modules/chat/voice.ts
// Голосовой ввод
// Версия: 3.0.1 - FIXED TYPES
// ============================================

import { chatStore } from '@/store/ChatStore';
import { uiRenderer } from '@/modules/ui/renderer';

// Состояние голосовой записи
let isVoiceRecording = false;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: BlobPart[] = [];
let voiceInterval: ReturnType<typeof setInterval> | null = null;
let voiceTimeout: ReturnType<typeof setTimeout> | null = null;
let maxVolumeDetected = -100;
let audioContext: AudioContext | null = null;
let globalVoiceStream: MediaStream | null = null;

(window as any).isVoiceRecording = false;
(window as any).isExpressVoiceTarget = false;

(window as any).toggleVoiceRecording = async function(btn: HTMLElement): Promise<void> {
  const userInput = document.getElementById('user-input') as HTMLTextAreaElement;
  const sendBtn = document.querySelector('.send-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-input-btn');
  const timerEl = document.getElementById('voice-timer') as HTMLElement;
  const tg = (window as any).Telegram?.WebApp;

  if ((window as any).isSendingMessage) return;

  const resetVoiceUI = (): void => {
    if (voiceInterval) clearInterval(voiceInterval);
    if (voiceTimeout) clearTimeout(voiceTimeout);
    if (timerEl) {
      timerEl.classList.add('hidden');
      timerEl.textContent = '15s';
    }
    btn.classList.remove('recording-active');
    (btn as HTMLButtonElement).disabled = false;
    if (userInput) {
      userInput.disabled = false;
      userInput.placeholder = (window as any).getLangString ? (window as any).getLangString('placeholder') : 'Ваш вопрос...';
    }
    if (sendBtn) sendBtn.disabled = false;
  };

  if (isVoiceRecording) {
    isVoiceRecording = false;
    (window as any).isVoiceRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    return;
  }

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (tg && tg.showAlert) tg.showAlert('Голосовой ввод не поддерживается устройством.');
      return;
    }

    if (!globalVoiceStream || !globalVoiceStream.active) {
      globalVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const stream = globalVoiceStream;
    audioChunks = [];
    isVoiceRecording = true;
    (window as any).isVoiceRecording = true;
    maxVolumeDetected = -100;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const checkVolume = (): void => {
      if (!isVoiceRecording) return;
      analyser.getFloatFrequencyData(dataArray);
      for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxVolumeDetected) {
          maxVolumeDetected = dataArray[i];
        }
      }
      requestAnimationFrame(checkVolume);
    };
    checkVolume();

    if (timerEl) {
      timerEl.classList.remove('hidden');
      let timeLeft = 15;
      timerEl.textContent = `${timeLeft}s`;
      voiceInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = `${timeLeft}s`;
        if (timeLeft <= 0) clearInterval(voiceInterval!);
      }, 1000);
    }

    voiceTimeout = setTimeout(() => {
      if (isVoiceRecording) {
        (window as any).isExpressVoiceTarget = false;
        (window as any).toggleVoiceRecording(btn);
      }
    }, 15000);

    if (userInput) {
      userInput.disabled = true;
      userInput.placeholder = '🎙️...';
    }
    btn.classList.add('recording-active');

    let options: MediaRecorderOptions = { mimeType: 'audio/wav' };
    if (!MediaRecorder.isTypeSupported('audio/wav')) {
      options = { mimeType: 'audio/webm' };
      console.warn('⚠️ WAV не поддерживается, используем WebM');
    }

    mediaRecorder = new MediaRecorder(stream, options);
    console.log('🎙️ MediaRecorder создан с типом:', options.mimeType);

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      try {
        source.disconnect();
        analyser.disconnect();
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
        }
      } catch (e) {
        console.warn('Ошибка очистки Web Audio API:', e);
      }

      const isExpress = !!(window as any).isExpressVoiceTarget;
      (window as any).isExpressVoiceTarget = false;

      if (maxVolumeDetected < -48) {
        resetVoiceUI();
        if (isExpress && (window as any).expandInputArea) (window as any).expandInputArea();
        return;
      }

      (btn as HTMLButtonElement).disabled = true;
      if (userInput) userInput.placeholder = '⌛...';
      if (isExpress) {
        if ((window as any).collapseInputArea) (window as any).collapseInputArea();
      }

      const audioBlob = new Blob(audioChunks, { type: options.mimeType });

      try {
        const response = await fetch('/api/chat/whisper', {
          method: 'POST',
          body: audioBlob,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Audio-Type': audioBlob.type || 'audio/wav',
            'X-Telegram-Init-Data': (window as any).Telegram?.WebApp?.initData || ''
          }
        });

        const data = await response.json();
        resetVoiceUI();

        if (data.error || !data.text || data.text.trim().length === 0) {
          if (isExpress) {
            uiRenderer.hideSkeleton();
            uiRenderer.renderMessage(`⚠️ Error: ${data.error || 'Голос не распознан'}`, 'ai-msg');
          } else if (tg && tg.showAlert) {
            tg.showAlert(data.error || 'пустой ответ');
          }
          return;
        }

        const finalCleanText = data.text.trim();

        if (isExpress) {
          if (userInput) {
            userInput.value = '';
            userInput.style.height = 'auto';
          }
          if (clearBtn) clearBtn.classList.add('hidden');

          const activeChat = chatStore.getActiveChat();
          if (activeChat) {
            const { messageService } = await import('@/services/messages');
            await messageService.sendMessage(activeChat.id, finalCleanText, 'user-msg');
          }

          uiRenderer.showSkeleton();

          const activeChatForStream = chatStore.getActiveChat();
          const maxLimit = activeChatForStream ? (activeChatForStream.maxContext || 15) : 15;
          const cleanHist = activeChatForStream ?
            chatStore.getContextMessages(activeChatForStream.id, maxLimit).map(m => ({
              type: String(m.type),
              text: String(m.text)
            })) : [];

          (window as any).isSendingMessage = true;
          if (userInput) userInput.disabled = true;
          const vBtn = document.querySelector('.voice-btn') as HTMLButtonElement;
          if (vBtn) vBtn.disabled = true;
          if (sendBtn) sendBtn.disabled = true;

          if (typeof (window as any).streamAiResponse === 'function') {
            const userLang = activeChatForStream?.language || (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';
            await (window as any).streamAiResponse(
              cleanHist,
              chatStore.currentTopic,
              userLang,
              null,
              activeChatForStream
            );
          }

          (window as any).isSendingMessage = false;
          if (userInput) userInput.disabled = false;
          if (vBtn) vBtn.disabled = false;
          if (sendBtn) sendBtn.disabled = false;
        } else {
          if (userInput) {
            userInput.value = finalCleanText;
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
            if (clearBtn) clearBtn.classList.remove('hidden');
            userInput.focus();
          }
        }
      } catch (err) {
        console.error('Ошибка сети Whisper:', err);
        resetVoiceUI();
        if (isExpress) {
          uiRenderer.hideSkeleton();
          uiRenderer.renderMessage(`⚠️ Сбой сети: ${(err as Error).message}`, 'ai-msg');
        } else if (tg && tg.showAlert) {
          tg.showAlert(`Ошибка: ${(err as Error).message}`);
        }
      }
    };

    mediaRecorder.start();
  } catch (err) {
    console.error('Ошибка микрофона:', err);
    isVoiceRecording = false;
    (window as any).isVoiceRecording = false;
    if ((window as any).tg?.showAlert) (window as any).tg.showAlert('Доступ к микрофону отклонен.');

    const btn = document.querySelector('.voice-btn');
    if (btn) {
      btn.classList.remove('recording-active');
      (btn as HTMLButtonElement).disabled = false;
    }
    const userInput = document.getElementById('user-input') as HTMLTextAreaElement;
    if (userInput) {
      userInput.disabled = false;
      userInput.placeholder = (window as any).getLangString ? (window as any).getLangString('placeholder') : 'Ваш вопрос...';
    }
  }
};

console.log('✅ ChatVoice v3.0.1 загружен');
