// ============================================
// api/coins/add.ts
// Начисление монет (с подписью)
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

// Секрет для подписи транзакций
const COIN_SECRET = process.env.COIN_SECRET?.trim();

interface IAddCoinsRequest {
  amount: number;
  source: string;
  description: string;
  signature: string;
  timestamp: number;
}

/**
 * Проверка подписи транзакции
 */
async function verifySignature(
  userId: number,
  amount: number,
  source: string,
  timestamp: number,
  signature: string
): Promise<boolean> {
  if (!COIN_SECRET) {
    console.error('❌ COIN_SECRET не настроен');
    return false;
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(COIN_SECRET);
  const message = encoder.encode(`${userId}:${amount}:${source}:${timestamp}`);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === expectedSignature;
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

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    let body: IAddCoinsRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { amount, source, description, signature, timestamp } = body;

    // Валидация
    if (!amount || amount <= 0) {
      return errorResponse('Invalid amount', 400);
    }

    if (!source || !description) {
      return errorResponse('Missing source or description', 400);
    }

    // Проверяем timestamp (не старше 5 минут)
    const now = Date.now();
    if (Math.abs(now - timestamp) > 300000) {
      return errorResponse('Transaction expired', 400);
    }

    // Проверяем подпись
    const isValid = await verifySignature(userId, amount, source, timestamp, signature);
    if (!isValid) {
      console.error(`❌ Неверная подпись для пользователя ${userId}`);
      return errorResponse('Invalid signature', 403);
    }

    // Начисляем монеты через RPC
    const result = await supabaseRPC(
      'add_coins',
      {
        p_user_id: userId,
        p_amount: amount,
        p_source: source,
        p_description: description,
      },
      config
    );

    if (!result || typeof result !== 'object') {
      return errorResponse('Failed to add coins', 500);
    }

    return jsonResponse({
      success: true,
      new_balance: result.new_balance || 0,
      transaction_id: result.transaction_id || null,
    });
  } catch (err) {
    console.error('Add coins error:', (err as Error).message);
    return errorResponse((err as Error).message, 500);
  }
}
