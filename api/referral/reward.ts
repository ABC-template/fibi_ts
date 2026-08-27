// ============================================
// api/referral/reward.ts
// Начисление награды за реферала (вызывается при активации)
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

// Конфигурация ступеней
const REFERRAL_TIERS = [
  { from: 0, to: 100, reward: 10 },
  { from: 101, to: 500, reward: 5 },
  { from: 501, to: 1000, reward: 3 },
  { from: 1001, to: Infinity, reward: 1 },
];

const REFERRAL_REWARD_LIMIT = 500;

interface IRewardRequest {
  referral_id: string;
}

/**
 * Получить награду в зависимости от количества рефералов
 */
function getRewardForReferral(totalReferrals: number): number {
  for (const tier of REFERRAL_TIERS) {
    if (totalReferrals >= tier.from && totalReferrals <= tier.to) {
      return tier.reward;
    }
  }
  return 1;
}

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

    const config = getSupabaseConfig('service');

    let body: IRewardRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { referral_id } = body;

    if (!referral_id) {
      return errorResponse('Missing referral_id', 400);
    }

    // Получаем информацию о реферале
    const referral = await supabaseFetch(
      `referrals?id=eq.${referral_id}&select=*,referrer:referrer_id`,
      { method: 'GET' },
      config
    );

    if (!referral || !Array.isArray(referral) || referral.length === 0) {
      return errorResponse('Referral not found', 404);
    }

    const ref = referral[0];

    if (ref.status === 'rewarded') {
      return jsonResponse({
        success: false,
        message: 'Already rewarded',
      });
    }

    // Получаем количество уже награждённых рефералов
    const existingRewards = await supabaseFetch(
      `referrals?referrer_id=eq.${ref.referrer_id}&status=eq.rewarded`,
      { method: 'GET' },
      config
    );

    const totalRewarded = existingRewards?.length || 0;
    const rewardAmount = getRewardForReferral(totalRewarded);

    // Проверяем лимит
    const totalEarned = await supabaseFetch(
      `referrals?referrer_id=eq.${ref.referrer_id}&status=eq.rewarded&select=reward_amount`,
      { method: 'GET' },
      config
    );

    const totalRewardEarned = (totalEarned || []).reduce(
      (sum: number, r: any) => sum + (r.reward_amount || 0),
      0
    );

    if (totalRewardEarned + rewardAmount > REFERRAL_REWARD_LIMIT) {
      const remaining = REFERRAL_REWARD_LIMIT - totalRewardEarned;
      if (remaining <= 0) {
        return jsonResponse({
          success: false,
          message: 'Referral reward limit reached',
        });
      }
      // Начисляем остаток
      await supabaseRPC(
        'add_coins',
        {
          p_user_id: ref.referrer_id,
          p_amount: remaining,
          p_source: `referral_${ref.referred_id}`,
          p_description: `Реферал ${ref.referred_username || ref.referred_id}`,
        },
        config
      );

      await supabaseFetch(
        `referrals?id=eq.${referral_id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'rewarded',
            reward_amount: remaining,
            rewarded_at: new Date().toISOString(),
          }),
        },
        config
      );

      return jsonResponse({
        success: true,
        reward: remaining,
        limit_reached: true,
      });
    }

    // Начисляем полную награду
    await supabaseRPC(
      'add_coins',
      {
        p_user_id: ref.referrer_id,
        p_amount: rewardAmount,
        p_source: `referral_${ref.referred_id}`,
        p_description: `Реферал ${ref.referred_username || ref.referred_id}`,
      },
      config
    );

    // Обновляем статус реферала
    await supabaseFetch(
      `referrals?id=eq.${referral_id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'rewarded',
          reward_amount: rewardAmount,
          rewarded_at: new Date().toISOString(),
        }),
      },
      config
    );

    console.log(`💰 Награда начислена: ${rewardAmount} монет за реферала ${ref.referred_id}`);

    return jsonResponse({
      success: true,
      reward: rewardAmount,
      limit_reached: false,
    });
  } catch (err) {
    console.error('Referral reward error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
