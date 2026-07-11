// ============================================
// api/auth/check.ts
// Описание: Проверка подписки и авторизации (с JWT)
// Версия: 4.1.0 - исправлены импорты через index
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  getOrCreateAuthUser,
  getSyncToken,
  updateSyncToken
} from '../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const telegramId = auth.userId!;
    const user = auth.user;
    const config = getSupabaseConfig('service');

    let authResult;
    try {
      authResult = await getOrCreateAuthUser(telegramId, user, config);
    } catch (err) {
      console.error('Ошибка создания/поиска пользователя в Auth:', err);
      return errorResponse('Ошибка авторизации: ' + (err as Error).message, 500);
    }

    const userId = authResult.userId;
    const userUuid = authResult.userUuid || userId;
    const jwtToken = authResult.jwtToken;
    const isNewUser = authResult.isNew;

    // 1. ПОЛУЧАЕМ sync_token ИЗ БД
    const dbSyncToken = await getSyncToken(telegramId, config);

    // 2. ПОЛУЧАЕМ sync_token ОТ КЛИЕНТА (из заголовка)
    const clientSyncToken = request.headers.get('x-sync-token') || null;

    // 3. СРАВНИВАЕМ!
    let finalSyncToken: string | null;
    let tokenChanged = false;

    if (clientSyncToken !== dbSyncToken) {
      const newToken = crypto.randomUUID();
      await updateSyncToken(telegramId, config);
      finalSyncToken = newToken;
      tokenChanged = true;
      console.log(`🔄 [auth/check] sync_token НЕ совпадает! Генерируем новый: ${finalSyncToken.substring(0, 8)}...`);
      console.log(`   Клиент: ${clientSyncToken?.substring(0, 8) || 'null'}... → Сервер: ${dbSyncToken?.substring(0, 8) || 'null'}...`);
    } else {
      finalSyncToken = dbSyncToken;
      tokenChanged = false;
      console.log(`✅ [auth/check] sync_token совпадает: ${finalSyncToken?.substring(0, 8) || 'null'}...`);
    }

    console.log(`👤 Пользователь ${telegramId} (${userId}) ${isNewUser ? 'создан' : 'найден'}`);
    console.log(`🔑 JWT сгенерирован: ${jwtToken.substring(0, 20)}...`);
    console.log(`🔄 sync_token: ${finalSyncToken?.substring(0, 8) || 'null'}... (${tokenChanged ? 'НОВЫЙ' : 'СУЩЕСТВУЮЩИЙ'})`);

    let dbUser: any = null;
    try {
      const userRes = await supabaseFetch(
        `users?id=eq.${userId}&select=telegram_id,role,premium_until,username,data_deadline,sync_token`,
        { method: 'GET' },
        config
      );

      if (userRes && Array.isArray(userRes) && userRes.length > 0) {
        dbUser = userRes[0];
        console.log(`✅ Пользователь ${telegramId} найден в БД`);
      } else {
        console.log(`🆕 Создаём пользователя ${telegramId} в public.users`);

        await supabaseFetch(
          'users',
          {
            method: 'POST',
            body: JSON.stringify({
              id: userId,
              telegram_id: telegramId,
              username: user?.username || null,
              role: 'trial',
              user_lang: user?.language_code || 'ru',
              sync_token: crypto.randomUUID()
            })
          },
          config
        );

        dbUser = { role: 'trial' };
        console.log(`✅ Пользователь ${telegramId} создан`);
      }
    } catch (err) {
      console.error('Error checking/creating user:', (err as Error).message);
      dbUser = { role: 'trial' };
    }

    let role = 'guest';
    let dailyLimit = 0;
    let syncEnabled = false;

    if (dbUser) {
      if (['admin', 'creator'].includes(dbUser.role)) {
        role = dbUser.role;
        dailyLimit = 9999;
        syncEnabled = true;
      } else if (dbUser.role === 'premium' && dbUser.premium_until && new Date(dbUser.premium_until) > new Date()) {
        role = 'premium';
        dailyLimit = 100;
        syncEnabled = true;
      } else {
        role = dbUser.role || 'trial';
        dailyLimit = 5;
        syncEnabled = false;
      }
    }

    if (!['admin', 'creator', 'premium'].includes(role)) {
      const channelId = process.env.CHANNEL_ID?.trim();
      const botToken = process.env.BOT_TOKEN?.trim();

      if (channelId && botToken) {
        try {
          const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${telegramId}`;
          const response = await fetch(url);
          const data = await response.json();

          if (data.ok) {
            const status = data.result.status;
            const isMember = ['member', 'administrator', 'creator', 'owner'].includes(status);

            if (['administrator', 'creator'].includes(status)) {
              role = 'admin';
              dailyLimit = 9999;
              syncEnabled = true;
              if (dbUser && dbUser.role !== 'admin') {
                await supabaseFetch(
                  `users?telegram_id=eq.${telegramId}`,
                  {
                    method: 'PATCH',
                    body: JSON.stringify({ role: 'admin' })
                  },
                  config
                );
              }
            } else if (isMember) {
              role = 'trial';
              dailyLimit = 5;
              syncEnabled = false;
            }
          }
        } catch (err) {
          console.error('Error checking channel membership:', (err as Error).message);
        }
      }
    }

    const responseData = {
      isMember: role !== 'guest',
      role,
      dailyLimit,
      syncEnabled,
      syncToken: finalSyncToken,
      userId: telegramId,
      authUserId: userId,
      userUuid: userUuid,
      jwtToken: jwtToken,
      expiresIn: 3600,
      isNewUser: isNewUser,
      serverModels: {
        gemini: true,
        deepseek: true,
        gpt: true,
        claude: true,
        grok: true
      }
    };

    return jsonResponse(responseData, 200, {
      'Authorization': `Bearer ${jwtToken}`
    });
  } catch (err) {
    console.error('Check auth error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
