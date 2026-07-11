// ============================================
// src/modules/chat/media.ts
// Работа с изображениями
// Версия: 3.0.0 - TypeScript
// ============================================

import { userStore } from '@/store/UserStore';

// Глобальное состояние прикрепленного изображения
let currentAttachedImageBase64: string | null = null;
(window as any).currentAttachedImageBase64 = null;

/**
 * Инициализация скрытого инпута выбора файла
 */
(window as any).initMediaAttachment = function(): void {
  if (document.getElementById('hidden-file-input')) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'hidden-file-input';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  fileInput.addEventListener('change', function(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    (window as any).processAndResizeImage(file);
  });

  document.body.appendChild(fileInput);
};

/**
 * Открыть выбор файла (только для создателя)
 */
(window as any).triggerMediaSelector = function(): void {
  const userRole = userStore.role || 'trial';
  const hasAccess = userRole === 'creator' || userRole === 'admin';

  if (!hasAccess) {
    if ((window as any).showBetaAlert) (window as any).showBetaAlert();
    return;
  }

  (window as any).initMediaAttachment();
  const fileInput = document.getElementById('hidden-file-input') as HTMLInputElement;
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
};

/**
 * Обработка и ресайз изображения
 */
(window as any).processAndResizeImage = function(file: File): void {
  const MAX_FILE_SIZE_MB = 10;
  const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    if ((window as any).tg?.showAlert) {
      (window as any).tg.showAlert(`Файл слишком большой! Максимум ${MAX_FILE_SIZE_MB}MB.`);
    } else {
      alert(`Файл слишком большой! Максимум ${MAX_FILE_SIZE_MB}MB.`);
    }
    const fileInput = document.getElementById('hidden-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event: ProgressEvent<FileReader>) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const maxDimension = 1024;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      currentAttachedImageBase64 = canvas.toDataURL('image/jpeg', 0.75);
      (window as any).currentAttachedImageBase64 = currentAttachedImageBase64;
      (window as any).renderImagePreview();
    };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
};

/**
 * Рендеринг превью изображения
 */
(window as any).renderImagePreview = function(): void {
  (window as any).clearImagePreviewDOM();

  const inputArea = document.getElementById('input-area');
  if (!inputArea || !currentAttachedImageBase64) return;

  const previewContainer = document.createElement('div');
  previewContainer.id = 'media-preview-container';
  previewContainer.style.cssText = 'display:flex; align-items:center; background:rgba(0,0,0,0.03); padding:6px 10px; border-radius:12px; margin-bottom:4px; gap:8px; width:fit-content; border:1px solid rgba(0,0,0,0.04); animation:fadeInUp 0.2s ease;';

  const imgElement = document.createElement('img');
  imgElement.src = currentAttachedImageBase64;
  imgElement.style.cssText = 'width:36px; height:36px; border-radius:8px; object-fit:cover; border:1px solid rgba(0,0,0,0.08);';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '✕';
  deleteBtn.style.cssText = 'background:transparent; border:none; outline:none; font-size:12px; cursor:pointer; color:var(--hint-color); padding:4px; font-weight:bold;';
  deleteBtn.onclick = function(e: Event) {
    e.stopPropagation();
    (window as any).clearImageAttachment();
  };

  previewContainer.appendChild(imgElement);
  previewContainer.appendChild(deleteBtn);

  inputArea.insertBefore(previewContainer, inputArea.firstChild);
};

/**
 * Очистка DOM превью
 */
(window as any).clearImagePreviewDOM = function(): void {
  const existingContainer = document.getElementById('media-preview-container');
  if (existingContainer) existingContainer.remove();
};

/**
 * Полный сброс прикрепленного изображения
 */
(window as any).clearImageAttachment = function(): void {
  currentAttachedImageBase64 = null;
  (window as any).currentAttachedImageBase64 = null;
  (window as any).clearImagePreviewDOM();
  const fileInput = document.getElementById('hidden-file-input') as HTMLInputElement;
  if (fileInput) fileInput.value = '';
};

console.log('✅ ChatMedia v3.0.0 загружен');
