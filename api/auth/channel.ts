// ============================================
// api/auth/channel.ts
// Кнопка «Я подписался — проверить» на заглушке: проверка подписки у Telegram
// прямо сейчас (без часового кэша). Не закрыта проверкой доступа (см. access-gate).
// Версия: 1.0.0
// ============================================

import { authenticate, isAdminTelegramId } from '../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig } from '../_lib/supabase-client';
import {
  accessDecision,
  getChannelUrl,
  loadAccessState,
  refreshChannelMembership,
} from '../_lib/access-gate';

export const config = { runtime: 'edge' };

/** Не чаще раза в столько миллисекунд на пользователя (защита от спама в Telegram API) */
const MIN_INTERVAL_MS = 5_000;
const lastCheck = new Map<number, number>();

export default async function handler(request: Request): Promise<Response> {
  const cors = handleCORS(request);
  if (cors) return cors;

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const auth = await authenticate(request);
    if (auth.error || !auth.userId) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401);
    }
    const userId = auth.userId;
    const config = getSupabaseConfig('service');

    if (isAdminTelegramId(userId)) {
      return jsonResponse({ success: true, member: true, channelRequired: false, blocked: false, channelUrl: getChannelUrl() });
    }

    const prev = lastCheck.get(userId) || 0;
    if (Date.now() - prev < MIN_INTERVAL_MS) {
      return errorResponse('Подождите несколько секунд и попробуйте снова', 429);
    }
    lastCheck.set(userId, Date.now());
    if (lastCheck.size > 5000) lastCheck.clear();

    const state = await loadAccessState(userId, config, false);
    let member = state.channelMember;
    if (state.gateEnabled && !state.blocked) {
      member = await refreshChannelMembership(userId, config, state.channelMember);
    }
    const denied = accessDecision(state, member);

    return jsonResponse({
      success: true,
      member: member !== false,
      channelRequired: denied?.code === 'channel_required',
      blocked: denied?.code === 'blocked',
      channelUrl: getChannelUrl(),
    });
  } catch (err) {
    console.error('[auth/channel] error:', (err as Error).message);
    return errorResponse('Не удалось проверить подписку. Попробуйте позже.', 500);
  }
}
