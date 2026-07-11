// ============================================
// src/types/global.d.ts
// Расширение интерфейса Window для глобальных функций
// Версия: 2.1.0 - исправлены типы chatSend
// ============================================

import type { TopicId, TopicFilter, UUID } from '@types/index';

declare global {
    interface Window {
        // ==========================================
        // TELEGRAM
        // ==========================================
        tg?: any;
        Telegram?: {
            WebApp: any;
        };

        // ==========================================
        // БИБЛИОТЕКИ
        // ==========================================
        lucide?: {
            createIcons: () => void;
        };
        eruda?: {
            init: () => void;
        };
        marked?: any;
        DOMPurify?: any;
        supabase?: any;

        // ==========================================
        // CORE UI
        // ==========================================
        openDrawer: () => void;
        closeDrawer: (options?: { instant?: boolean }) => void;
        openChat: (chatId: UUID, topic: TopicId) => void;
        goToChatList: () => void;
        goToProfile: () => void;
        goToTasks: () => void;
        fullDataReload: () => Promise<boolean>;
        refreshSyncToken: () => Promise<string | null>;
        updateRealtimeIndicator: (status: 'connected' | 'connecting' | 'offline' | 'syncing') => void;
        showBetaAlert: () => void;
        showGuest: (data: { msg: string; joke: string }) => void;
        initExportButtons: () => void;

        // ==========================================
        // DRAWER
        // ==========================================
        renderChatsInDrawer: () => void;
        updateDrawerUserInfo: () => void;
        updateDrawerCoins: () => void;
        updateCoinsDisplay: () => void;
        updateDrawerRole: (role: string) => void;
        updateDrawerTrashCount: () => void;
        updateThemeLabel: (theme: 'light' | 'amoled') => void;
        appendDrawerNav: (container: HTMLElement) => void;
        toggleChatMenu: (chatId: UUID, container: HTMLElement) => void;
        closeAllChatMenus: () => void;
        handleChatAction: (action: string, chatId: UUID, chatTitle: string, isPinned: boolean) => void;
        togglePinChat: (chatId: UUID, pinned: boolean) => void;
        renameChatFromDrawer: (chatId: UUID, currentTitle: string) => void;
        deleteChatFromDrawer: (chatId: UUID) => void;

        // ==========================================
        // MODALS
        // ==========================================
        showModal: (options: any) => void;
        closeModal: () => void;
        showFavoritesModal: () => void;
        showTrashModal: () => void;
        showContextModal: (chatId: UUID) => void;

        // ==========================================
        // CHAT
        // ==========================================
        streamAiResponse: (
            historyMessages: Array<{ type: string; text: string }>,
            topic: TopicId,
            userLang: string,
            attachedImage: string | null,
            chatId: UUID
        ) => Promise<boolean>;
        
        // ✅ ИСПРАВЛЕНО: сигнатура соответствует ChatSend
        chatSend: {
            sendMessage: () => Promise<void>;
            copyMsgText: (btn: HTMLElement, msgId: UUID) => void;
            shareMsgText: (btn: HTMLElement, msgId: UUID) => void;
            toggleFavoriteMsg: (msgId: UUID, chatId?: UUID) => Promise<void>;
            deleteMessage: (msgId: UUID) => void;
            clearUserText: (e?: Event) => void;
        };
        
        isVoiceRecording: boolean;
        isExpressVoiceTarget: boolean;
        toggleVoiceRecording: (btn: HTMLElement) => Promise<void>;
        initMediaAttachment: () => void;
        triggerMediaSelector: () => void;
        processAndResizeImage: (file: File) => void;
        renderImagePreview: () => void;
        clearImagePreviewDOM: () => void;
        clearImageAttachment: () => void;
        currentAttachedImageBase64: string | null;

        // ==========================================
        // INPUT
        // ==========================================
        expandInputArea: () => void;
        collapseInputArea: () => void;
        clearUserText: (e?: Event) => void;

        // ==========================================
        // EXPORT
        // ==========================================
        exportLocalArchive: () => Promise<void>;
        exportCloudArchive: () => Promise<void>;
        downloadMultiPartArchive: (firstPart: any) => Promise<void>;
        downloadJSON: (data: any, filename: string) => void;

        // ==========================================
        // TRASH
        // ==========================================
        openTrashModal: () => void;
        closeTrashModal: () => void;
        loadTrashContent: () => void;
        restoreFromTrash: (chatId: UUID) => Promise<void>;
        permanentDelete: (chatId: UUID) => Promise<void>;
        clearAllTrash: () => void;
        updateTrashCount: () => void;

        // ==========================================
        // MODULES CORE
        // ==========================================
        moduleLoader: any;
        navigationState: any;
        navigation: any;
        backButtonManager: any;
        modalManager: any;
        headerManager: any;
        themeManager: any;
        eventBus: any;

        // ==========================================
        // STORES
        // ==========================================
        chatStore: any;
        userStore: any;
        organizerStore: any;
        tasksStore: any;

        // ==========================================
        // SERVICES
        // ==========================================
        authService: any;
        chatService: any;
        messageService: any;
        syncService: any;
        organizerService: any;
        apiClient: any;

        // ==========================================
        // UI
        // ==========================================
        uiRenderer: any;
        chatUI: any;
        profileUI: any;
        organizerUI: any;

        // ==========================================
        // MODULES INSTANCES
        // ==========================================
        chatListModule: any;
        chatModule: any;
        organizerModule: any;
        profileModule: any;
        tasksModule: any;
        gamesModule: any;

        // ==========================================
        // CONFIG
        // ==========================================
        config: any;
        currentTopic: TopicId;
        currentModel: string;
        currentFilter: string;
        usedToday: number;
        allUserKeys: any;
        isSendingMessage: boolean;
        mediaRecorder: MediaRecorder | null;
        audioChunks: BlobPart[];
        topicNames: Record<TopicId, string>;
        topicShortNames: Record<TopicId, string>;
        welcomeTexts: Record<TopicId, string>;
        modelNames: Record<string, string>;

        // ==========================================
        // LOCALE
        // ==========================================
        getLangString: (key: string, lang?: string) => string;
        applyUiLocalization: () => void;
        updateLimitDisplay: () => void;

        // ==========================================
        // HELPERS
        // ==========================================
        formatDate: (dateStr: string) => string;
        pluralize: (count: number, one: string, two: string, five: string) => string;
        generateUUID: () => string;
        sleep: (ms: number) => Promise<void>;
        safeJSONParse: <T = any>(str: string, fallback?: T | null) => T | null;
        truncate: (str: string, maxLength: number, suffix?: string) => string;
        isEmptyObject: (obj: any) => boolean;
        cloneObject: <T>(obj: T) => T;
        debounce: <T extends (...args: any[]) => any>(func: T, wait: number) => (...args: Parameters<T>) => void;
        throttle: <T extends (...args: any[]) => any>(func: T, limit: number) => (...args: Parameters<T>) => void;

        // ==========================================
        // VALIDATORS
        // ==========================================
        isValidUUID: (uuid: string) => boolean;
        isValidTopic: (topic: string) => boolean;
        isValidMessageLength: (text: string, maxLength?: number) => boolean;
        isValidEmail: (email: string) => boolean;
        isValidURL: (url: string) => boolean;
        isValidFileSize: (bytes: number, maxMB?: number) => boolean;
        isValidImageBase64: (str: string) => boolean;
        sanitizeHTML: (html: string) => string;

        // ==========================================
        // OTHER
        // ==========================================
        getCurrentActiveChat: () => any;
        refreshBackButton: () => void;
        handleNewChatClick: () => void;
        showOfflineBanner: (message?: string) => void;
        hideOfflineBanner: () => void;
    }
}

export {};
