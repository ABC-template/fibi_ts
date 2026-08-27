// ============================================
// api/_lib/tokens-usage.ts
// Утилиты для работы с токенами OpenRouter
// Версия: 1.0.0
// ============================================

import { getSupabaseConfig, supabaseFetch, supabaseRPC } from './supabase-client';

/**
 * Получить дневной лимит токенов OpenRouter для пользователя
 */
export async function getDailyTokenLimit(
  userId: number,
  config: any = null
): Promise<number> {
  try {
    const cfg = config || getSupabaseConfig('service');
    
    // Получаем роль пользователя
    const user = await supabaseFetch(
      `users?telegram_id=eq.${userId}&select=role`,
      { method: 'GET' },
      cfg
    );
    
    if (!user || !Array.isArray(user) || user.length === 0) {
      return 5000; // дефолт для trial
    }
    
    const role = user[0].role || 'trial';
    
    // Получаем настройки
    const configResult = await supabaseFetch(
      'economy_config?limit=1',
      { method: 'GET' },
      cfg
    );
    
    if (!configResult || !Array.isArray(configResult) || configResult.length === 0) {
      return 5000;
    }
    
    const settings = configResult[0];
    
    switch (role) {
      case 'admin':
      case 'creator':
        return settings.daily_token_limit_admin || 999999;
      case 'premium':
        return settings.daily_token_limit_premium || 50000;
      default:
        return settings.daily_token_limit_trial || 5000;
    }
  } catch (err) {
    console.error('Failed to get daily token limit:', err);
    return 5000;
  }
}

/**
 * Получить использованные токены OpenRouter за сегодня
 */
export async function getTodayTokenUsage(
  userId: number,
  config: any = null
): Promise<number> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const today = new Date().toISOString().slice(0, 10);
    
    const result = await supabaseFetch(
      `openrouter_usage?user_id=eq.${userId}&created_at=gte.${today}&select=total_tokens`,
      { method: 'GET' },
      cfg
    );
    
    if (!result || !Array.isArray(result)) {
      return 0;
    }
    
    return result.reduce((sum: number, record: any) => sum + (record.total_tokens || 0), 0);
  } catch (err) {
    console.error('Failed to get today token usage:', err);
    return 0;
  }
}

/**
 * Проверить, достаточно ли токенов OpenRouter для запроса
 */
export async function checkOpenRouterLimit(
  userId: number,
  estimatedTokens: number = 1000,
  config: any = null
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  error?: string;
}> {
  try {
    const limit = await getDailyTokenLimit(userId, config);
    const used = await getTodayTokenUsage(userId, config);
    const remaining = Math.max(0, limit - used);
    
    if (estimatedTokens > remaining) {
      return {
        allowed: false,
        remaining: 0,
        limit,
        used,
        error: `Превышен лимит токенов OpenRouter (${used}/${limit})`
      };
    }
    
    return {
      allowed: true,
      remaining,
      limit,
      used
    };
  } catch (err) {
    console.error('Failed to check OpenRouter limit:', err);
    // В случае ошибки пропускаем (fail open)
    return {
      allowed: true,
      remaining: 999999,
      limit: 999999,
      used: 0
    };
  }
}

/**
 * Сохранить использование токенов OpenRouter
 */
export async function logOpenRouterUsage(
  userId: number,
  data: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    model: string;
    topic?: string;
    user_lang?: string;
  },
  config: any = null
): Promise<boolean> {
  try {
    const cfg = config || getSupabaseConfig('service');
    
    await supabaseFetch(
      'openrouter_usage',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          prompt_tokens: data.prompt_tokens,
          completion_tokens: data.completion_tokens,
          total_tokens: data.total_tokens,
          model: data.model,
          topic: data.topic || null,
          user_lang: data.user_lang || null
        })
      },
      cfg
    );
    
    return true;
  } catch (err) {
    console.error('Failed to log OpenRouter usage:', err);
    return false;
  }
}

/**
 * Примерная оценка токенов для запроса
 */
export function estimateTokens(
  messages: Array<{ role: string; content: string | any[] }>,
  systemPrompt: string = ''
): number {
  let totalChars = systemPrompt.length;
  
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          totalChars += part.text.length;
        }
      }
    }
  }
  
  // Определяем язык (для более точной оценки)
  const hasCyrillic = /[а-яА-Я]/.test(systemPrompt + JSON.stringify(messages));
  const charsPerToken = hasCyrillic ? 2.5 : 4;
  
  // Примерная оценка: символы / коэффициент + overhead
  return Math.ceil(totalChars / charsPerToken) + 50;
}

/**
 * Получить статистику использования токенов для админки
 */
export async function getTokenUsageStats(
  userId?: number,
  days: number = 7,
  config: any = null
): Promise<any> {
  try {
    const cfg = config || getSupabaseConfig('service');
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    let query = `openrouter_usage?created_at=gte.${fromDate}&select=*`;
    if (userId) {
      query += `&user_id=eq.${userId}`;
    }
    
    const result = await supabaseFetch(
      query,
      { method: 'GET' },
      cfg
    );
    
    if (!result || !Array.isArray(result)) {
      return {
        total_requests: 0,
        total_tokens: 0,
        by_model: {},
        by_day: {}
      };
    }
    
    const stats = {
      total_requests: result.length,
      total_tokens: 0,
      by_model: {} as Record<string, { requests: number; tokens: number }>,
      by_day: {} as Record<string, { requests: number; tokens: number }>
    };
    
    for (const record of result) {
      stats.total_tokens += record.total_tokens || 0;
      
      // По модели
      const model = record.model || 'unknown';
      if (!stats.by_model[model]) {
        stats.by_model[model] = { requests: 0, tokens: 0 };
      }
      stats.by_model[model].requests++;
      stats.by_model[model].tokens += record.total_tokens || 0;
      
      // По дню
      const day = record.created_at?.slice(0, 10) || 'unknown';
      if (!stats.by_day[day]) {
        stats.by_day[day] = { requests: 0, tokens: 0 };
      }
      stats.by_day[day].requests++;
      stats.by_day[day].tokens += record.total_tokens || 0;
    }
    
    return stats;
  } catch (err) {
    console.error('Failed to get token usage stats:', err);
    return {
      total_requests: 0,
      total_tokens: 0,
      by_model: {},
      by_day: {}
    };
  }
}
