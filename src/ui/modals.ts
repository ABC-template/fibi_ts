// ============================================
// src/ui/modals.ts
// Модалки: избранное, корзина, контекст
// Версия: 1.0.0
// ============================================
import './modal.css';
import { profileUI } from '@/modules/ui/profile-ui';

export function showFavoritesModal(): void {
    if (profileUI && typeof profileUI.showFavoritesModal === 'function') {
        profileUI.showFavoritesModal();
    }
}

export function showTrashModal(): void {
    if (profileUI && typeof profileUI.showTrashModal === 'function') {
        profileUI.showTrashModal();
    }
}

export function showContextModal(chatId: string): void {
    if (profileUI && typeof profileUI.showContextModal === 'function') {
        profileUI.showContextModal(chatId);
    }
}

export function initExportButtons(): void {
    const exportContainer = document.getElementById('export-buttons-container');
    if (!exportContainer) {
        const profileTab = document.getElementById('tab-profile');
        if (profileTab) {
            const container = document.createElement('div');
            container.id = 'export-buttons-container';
            container.style.cssText = 'margin-top: 16px; display: flex; flex-direction: column; gap: 8px;';
            container.innerHTML = `
                <button class="btn btn-secondary" onclick="window.exportLocalArchive()" style="width:100%;">
                    💾 Экспорт локального архива
                </button>
                <button class="btn btn-secondary" id="cloud-export-btn" onclick="window.exportCloudArchive()" style="width:100%;">
                    ☁️ Экспорт облачного архива (PRO)
                </button>
            `;
            profileTab.appendChild(container);
        }
    }

    const cloudBtn = document.getElementById('cloud-export-btn');
    if (cloudBtn) {
        const userStore = window.userStore;
        if (userStore?.canSync()) {
            cloudBtn.style.display = 'block';
            cloudBtn.textContent = '☁️ Экспорт облачного архива (PRO)';
            cloudBtn.style.opacity = '1';
        } else {
            cloudBtn.style.display = 'block';
            cloudBtn.textContent = '🔒 Облачный архив (доступен по PRO подписке)';
            cloudBtn.style.opacity = '0.6';
        }
    }
}
