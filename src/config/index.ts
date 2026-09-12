// ============================================
// src/config/index.ts
// Экспорт центрального конфига и всех типов
// Версия: 3.0.1 - замена @types → @app-types
// ============================================

// Экспорт конфига
export * from './topics';

// Реэкспорт всех типов из @app-types для удобного импорта
export type {
  // Common
  TopicId,
  TopicFilter,
  UserRole,
  MessageType,
  ReminderStatus,
  TrackerStatus,
  UserLanguage,
  TrackerTone,
  AssistantRole,
  AssistantTone,
  FeatureFlags,
  UUID,
  ISODateString,
  ApiResponse,
  PaginationParams,
  SortParams,
  // Chat
  IChat,
  IMessage,
  IMessageDB,
  IChatDB,
  ICreateChatData,
  ICreateMessageData,
  ITrash,
  IExportArchive,
  IFavoriteItem,
  // User
  ITelegramUser,
  IAppUser,
  IAuthResult,
  IAuthCheckResponse,
  IUserStats,
  IUserDevice,
  // Organizer
  IReminder,
  ICreateReminderData,
  ITracker,
  ITrackerSettings,
  ITrackerLog,
  ITodoItem,
  ICreateTrackerData,
  IAddTrackerLogData,
  // Tasks
  IDailyQuest,
  IAchievement,
  IExchangeResult,
  IDailyBonusResult,
  IProgressUpdate,
  // Store
  IChatStoreData,
  IUserStoreData,
  IOrganizerStoreData,
  ITasksStoreData,
  INavigationState,
  // API
  IStreamRequest,
  IStreamResponse,
  ICreateChatRequest,
  ICreateChatResponse,
  IChatActionRequest,
  IMessageActionRequest,
  IBatchRequest,
  IExportRequest,
  IExportResponse,
  IUsageLimit,
} from '@app-types';

console.log('✅ Config v3.0.1 загружен');
