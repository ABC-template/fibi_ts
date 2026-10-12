// ============================================
// api/admin/coins.ts
// Совместимость: начисление монет / постоянной энергии из админки (вкладка «Тесты»).
// Новый код использует POST /api/admin/users { action: 'balance' }.
// Тело: { user_id, amount, currency?: 'coins'|'tokens', action?: 'add'|'subtract', reason? }
// Версия: 3.0.0 — через SQL admin_adjust_coins / admin_adjust_permanent_tokens
//                  (старые RPC add_coins/spend_coins не существовали); доступ по Telegram ID
// ============================================

import { authenticate, isAdminTelegramId } from '../_lib/auth';
import { handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseRPC } from '../_lib/supabase-client';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  const auth = await authenticate(request);
  if (auth.error || !isAdminTelegramId(auth.userId)) {
    return errorResponse('Доступ запрещён', 403);
  }

  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  try {
    const body = await request.json();
    const userId = Number(body?.user_id);
    const raw = Math.trunc(Number(body?.amount));

    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isFinite(raw) || raw <= 0) {
      return errorResponse('Invalid parameters', 400);
    }

    const amount = body?.action === 'subtract' ? -raw : raw;
    const fn = body?.currency === 'tokens' ? 'admin_adjust_permanent_tokens' : 'admin_adjust_coins';

    const result = await supabaseRPC(
      fn,
      {
        p_user_id: userId,
        p_amount: amount,
        p_admin_id: auth.userId,
        p_reason: typeof body?.reason === 'string' ? body.reason.slice(0, 200) : null,
      },
      getSupabaseConfig('service')
    );

    if (!result?.success) {
      return errorResponse(result?.error || 'Operation failed', 400);
    }
    return jsonResponse({ success: true, ...result });
  } catch (err) {
    console.error('Admin coins error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
