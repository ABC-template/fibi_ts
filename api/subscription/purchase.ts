// ============================================
// api/subscription/purchase.ts
// Покупка подписки через Telegram Stars
// Версия: 1.0.0
// ============================================

import {
  authenticate,
  corsHeaders,
  handleCORS,
  jsonResponse,
  errorResponse,
  getSupabaseConfig,
  supabaseFetch,
  supabaseRPC,
} from '../_lib/index';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error) {
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    const body = await request.json();
    const { tier_key } = body;

    if (!tier_key) {
      return errorResponse('Missing tier_key', 400);
    }

    // Получаем тариф
    const tier = await supabaseFetch(
      `subscription_tiers?tier_key=eq.${tier_key}&is_active=eq.true`,
      { method: 'GET' },
      config
    );

    if (!tier || !Array.isArray(tier) || tier.length === 0) {
      return errorResponse('Tier not found', 404);
    }

    const pkg = tier[0];

    // Проверяем, не одноразовый ли тариф
    if (pkg.is_one_time) {
      const used = await supabaseFetch(
        `user_subscriptions?user_id=eq.${userId}&tier_key=eq.${tier_key}`,
        { method: 'GET' },
        config
      );

      if (used && Array.isArray(used) && used.length > 0) {
        return errorResponse('This tier can only be purchased once', 400);
      }
    }

    // Создаем инвойс через Telegram Stars
    // Здесь будет интеграция с Telegram Stars API
    // Пока возвращаем заглушку

    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + pkg.days);

    // Создаем подписку
    await supabaseFetch(
      'user_subscriptions',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          tier_key: pkg.tier_key,
          starts_at: new Date().toISOString(),
          expires_at: expires_at.toISOString(),
          is_active: true,
        }),
      },
      config
    );

    // Обновляем пользователя
    await supabaseFetch(
      `users?telegram_id=eq.${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          role: 'premium',
          premium_until: expires_at.toISOString(),
          subscription_tier: pkg.tier_key,
          updated_at: new Date().toISOString(),
        }),
      },
      config
    );

    // Начисляем постоянные токены
    if (pkg.permanent_tokens > 0) {
      await supabaseRPC(
        'add_permanent_tokens',
        {
          p_user_id: userId,
          p_amount: pkg.permanent_tokens,
          p_source: `subscription:${pkg.tier_key}`,
        },
        config
      );
    }

    // Логируем
    await supabaseFetch(
      'system_logs',
      {
        method: 'POST',
        body: JSON.stringify({
          level: 'success',
          event_type: 'subscription_purchased',
          message: `Пользователь ${userId} купил подписку ${pkg.tier_key}`,
          user_id: userId,
          metadata: {
            tier: pkg.tier_key,
            days: pkg.days,
            price_stars: pkg.price_stars,
            tokens: pkg.permanent_tokens,
          },
        }),
      },
      config
    );

    return jsonResponse({
      success: true,
      tier: pkg.tier_key,
      days: pkg.days,
      permanent_tokens: pkg.permanent_tokens,
      expires_at: expires_at.toISOString(),
      // В будущем здесь будет invoice_link для Stars
    });
  } catch (err) {
    console.error('[subscription/purchase] Error:', err);
    return errorResponse((err as Error).message, 500);
  }
}
