// ============================================
// src/modules/admin/tabs/index.ts
// Экспорт всех вкладок админ-панели
// Версия: 1.0.0
// ============================================

// Импортируем все вкладки для автоматической регистрации
import './AdminDashboardTab';
import './AdminLimitsTab';
import './AdminSettingsTab';
import './AdminSubscriptionsTab';
import './AdminAuditTab';
import './AdminUsersTab';
import './AdminSecurityTab';
import './AdminTestingTab';

// Экспортируем все вкладки (на случай использования)
export { AdminDashboardTab } from './AdminDashboardTab';
export { AdminLimitsTab } from './AdminLimitsTab';
export { AdminSettingsTab } from './AdminSettingsTab';
export { AdminSubscriptionsTab } from './AdminSubscriptionsTab';
export { AdminAuditTab } from './AdminAuditTab';
export { AdminUsersTab } from './AdminUsersTab';
export { AdminSecurityTab } from './AdminSecurityTab';
export { AdminTestingTab } from './AdminTestingTab';
