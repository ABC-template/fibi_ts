// ============================================
// api/config.ts
// Описание: Эндпоинт для получения конфигурации клиентом
// Версия: 2.0.0 - TypeScript
// ============================================

import { corsHeaders, handleCORS, jsonResponse } from './_lib/cors';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  // Обработка CORS
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Только GET
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  // Получаем переменные окружения
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();

  // Проверяем, что переменные есть
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ /api/config: Отсутствуют переменные окружения');
    return jsonResponse({
      error: 'Configuration not available',
      supabaseUrl: !!supabaseUrl,
      supabaseAnonKey: !!supabaseAnonKey
    }, 500);
  }

  // Возвращаем конфигурацию
  return jsonResponse({
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey
  });
}
