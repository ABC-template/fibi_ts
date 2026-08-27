// ============================================
// api/_lib/security-logger.ts
// Описание: Опциональное логирование безопасности
// Версия: 2.0.0 - TypeScript
// ============================================

export interface ISecurityLogEntry {
  user_id: number | null;
  action: string;
  details: string;
  ip: string;
  user_agent: string;
  origin: string;
  timestamp: string;
}

/**
 * Записать событие безопасности
 */
export async function logSecurityEvent(
  userId: number | null,
  action: string,
  details: any,
  request?: Request
): Promise<void> {
  // Если не хочешь логировать, просто возвращай
  if (!process.env.ENABLE_SECURITY_LOGS) {
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return;
  }

  const logEntry: ISecurityLogEntry = {
    user_id: userId || null,
    action: action,
    details: typeof details === 'string' ? details : JSON.stringify(details),
    ip: request?.headers?.get('cf-connecting-ip') ||
      request?.headers?.get('x-forwarded-for') ||
      'unknown',
    user_agent: request?.headers?.get('user-agent') || 'unknown',
    origin: request?.headers?.get('origin') || 'unknown',
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(`${supabaseUrl}/rest/v1/security_logs`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logEntry)
    });
  } catch (err) {
    // Игнорируем ошибки логирования
    console.error('Failed to write security log:', (err as Error).message);
  }
}
