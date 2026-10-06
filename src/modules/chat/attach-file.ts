// ============================================
// src/modules/chat/attach-file.ts
// Прикрепление текстовых файлов (.md, .txt — repomix-дампы и т.п.)
// Версия: 1.0.0 — v1: доступно только creator/admin, файл НЕ сохраняется,
//                  содержимое уходит только в один запрос (см. send.ts и
//                  api/chat/stream.ts), жёсткий потолок размера — клиентская
//                  проверка здесь лишь для быстрой обратной связи,
//                  финальная проверка (в т.ч. по context_length агента)
//                  всегда на сервере.
// ============================================

import { userStore } from '@/store/UserStore';

const MAX_FILE_SIZE_MB = 3;
const ALLOWED_EXTENSIONS = ['.md', '.txt'];

// Глобальное состояние прикреплённого файла
let currentAttachedFileText: string | null = null;
let currentAttachedFileName: string | null = null;
(window as any).currentAttachedFileText = null;
(window as any).currentAttachedFileName = null;

/**
 * Инициализация скрытого инпута выбора файла
 */
(window as any).initFileAttachment = function(): void {
  if (document.getElementById('hidden-text-file-input')) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'hidden-text-file-input';
  fileInput.accept = ALLOWED_EXTENSIONS.join(',');
  fileInput.style.display = 'none';

  fileInput.addEventListener('change', function(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    (window as any).processTextFile(file);
  });

  document.body.appendChild(fileInput);
};

/**
 * Открыть выбор файла (только для создателя/админа — v1)
 */
(window as any).triggerFileSelector = function(): void {
  const userRole = userStore.role || 'trial';
  const hasAccess = userRole === 'creator' || userRole === 'admin';

  if (!hasAccess) {
    if ((window as any).showBetaAlert) (window as any).showBetaAlert();
    return;
  }

  (window as any).initFileAttachment();
  const fileInput = document.getElementById('hidden-text-file-input') as HTMLInputElement;
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
};

/**
 * Чтение текстового файла
 */
(window as any).processTextFile = function(file: File): void {
  const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const msg = `Неподдерживаемый тип файла. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}`;
    if ((window as any).tg?.showAlert) (window as any).tg.showAlert(msg);
    else alert(msg);
    return;
  }

  if (file.size > maxSizeBytes) {
    const msg = `Файл слишком большой! Максимум ${MAX_FILE_SIZE_MB} МБ.`;
    if ((window as any).tg?.showAlert) (window as any).tg.showAlert(msg);
    else alert(msg);
    const fileInput = document.getElementById('hidden-text-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event: ProgressEvent<FileReader>) {
    currentAttachedFileText = event.target?.result as string;
    currentAttachedFileName = file.name;
    (window as any).currentAttachedFileText = currentAttachedFileText;
    (window as any).currentAttachedFileName = currentAttachedFileName;
    (window as any).renderFilePreview();
  };
  reader.onerror = function() {
    const msg = 'Не удалось прочитать файл';
    if ((window as any).tg?.showAlert) (window as any).tg.showAlert(msg);
    else alert(msg);
  };
  reader.readAsText(file);
};

/**
 * Рендеринг превью прикреплённого файла
 */
(window as any).renderFilePreview = function(): void {
  (window as any).clearFilePreviewDOM();

  const inputArea = document.getElementById('input-area');
  if (!inputArea || !currentAttachedFileText || !currentAttachedFileName) return;

  const sizeKb = Math.round(currentAttachedFileText.length / 1024);

  const previewContainer = document.createElement('div');
  previewContainer.id = 'file-preview-container';
  previewContainer.style.cssText = 'display:flex; align-items:center; background:rgba(0,0,0,0.03); padding:6px 10px; border-radius:12px; margin-bottom:4px; gap:8px; width:fit-content; max-width:100%; border:1px solid rgba(0,0,0,0.04); animation:fadeInUp 0.2s ease;';

  const icon = document.createElement('span');
  icon.textContent = '📎';
  icon.style.cssText = 'font-size:16px;flex-shrink:0;';

  const nameEl = document.createElement('span');
  nameEl.textContent = `${currentAttachedFileName} (${sizeKb} КБ)`;
  nameEl.style.cssText = 'font-size:12px; color:var(--app-text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '✕';
  deleteBtn.style.cssText = 'background:transparent; border:none; outline:none; font-size:12px; cursor:pointer; color:var(--hint-color); padding:4px; font-weight:bold; flex-shrink:0;';
  deleteBtn.onclick = function(e: Event) {
    e.stopPropagation();
    (window as any).clearFileAttachment();
  };

  previewContainer.appendChild(icon);
  previewContainer.appendChild(nameEl);
  previewContainer.appendChild(deleteBtn);

  inputArea.insertBefore(previewContainer, inputArea.firstChild);
};

/**
 * Очистка DOM превью
 */
(window as any).clearFilePreviewDOM = function(): void {
  const existingContainer = document.getElementById('file-preview-container');
  if (existingContainer) existingContainer.remove();
};

/**
 * Полный сброс прикреплённого файла
 */
(window as any).clearFileAttachment = function(): void {
  currentAttachedFileText = null;
  currentAttachedFileName = null;
  (window as any).currentAttachedFileText = null;
  (window as any).currentAttachedFileName = null;
  (window as any).clearFilePreviewDOM();
  const fileInput = document.getElementById('hidden-text-file-input') as HTMLInputElement;
  if (fileInput) fileInput.value = '';
};

console.log('✅ ChatAttachFile v1.0.0 загружен');
