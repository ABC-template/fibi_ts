// ============================================
// api/users/register-device.ts
// Описание: Регистрация устройства пользователя
// Версия: 2.0.0 - TypeScript
// ============================================

import { authenticate } from '../_lib/auth';
import { corsHeaders, handleCORS, jsonResponse, errorResponse } from '../_lib/cors';
import { getSupabaseConfig, supabaseFetch } from '../_lib/supabase-client';
import { logSecurityEvent } from '../_lib/security-logger';

export const config = { runtime: 'edge' };

interface IRegisterDeviceRequest {
  deviceFingerprint: string;
  deviceType?: string;
  platform?: string;
}

/**
 * Генерация HMAC подписи для fingerprint
 */
async function signDeviceFingerprint(fingerprint: string, userId: number): Promise<string> {
  const secret = process.env.DEVICE_SECRET?.trim();
  if (!secret) {
    throw new Error('DEVICE_SECRET not configured');
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const message = encoder.encode(`${userId}:${fingerprint}`);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
      await logSecurityEvent(null, 'register_device_invalid_token', {}, request);
      return errorResponse(auth.error, auth.status || 401);
    }

    const userId = auth.userId!;
    const config = getSupabaseConfig('service');

    let body: IRegisterDeviceRequest;
    try {
      body = await request.json();
    } catch (err) {
      return errorResponse('Invalid JSON body', 400);
    }

    const { deviceFingerprint } = body;
    if (!deviceFingerprint) {
      return errorResponse('Missing deviceFingerprint', 400);
    }

    // Генерируем подписанную версию fingerprint
    let signedFingerprint: string;
    try {
      signedFingerprint = await signDeviceFingerprint(deviceFingerprint, userId);
    } catch (err) {
      console.error('Failed to sign fingerprint:', err);
      return errorResponse('Security configuration error', 500);
    }

    const userAgent = request.headers.get('user-agent') || '';
    const platform = userAgent.includes('Android') ? 'android' :
      userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'ios' : 'web';

    console.log(`📱 Регистрация устройства: userId=${userId}, platform=${platform}`);

    // Проверяем по ПОДПИСАННОМУ fingerprint
    const existing = await supabaseFetch(
      `user_devices?device_fingerprint=eq.${encodeURIComponent(signedFingerprint)}&select=id`,
      { method: 'GET' },
      config
    );

    if (existing && Array.isArray(existing) && existing.length > 0) {
      // Обновляем существующее устройство
      await supabaseFetch(
        `user_devices?device_fingerprint=eq.${encodeURIComponent(signedFingerprint)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            last_seen: new Date().toISOString(),
            is_active: true
          })
        },
        config
      );

      await logSecurityEvent(userId, 'device_updated', { platform }, request);

      return jsonResponse({
        success: true,
        isNew: false,
        signedFingerprint: signedFingerprint
      });
    } else {
      // Создаем новое устройство
      await supabaseFetch(
        'user_devices',
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            device_fingerprint: signedFingerprint,
            raw_fingerprint: deviceFingerprint,
            platform: platform,
            is_active: true,
            last_seen: new Date().toISOString()
          })
        },
        config
      );

      console.log(`✅ Устройство зарегистрировано`);
      await logSecurityEvent(userId, 'device_registered', { platform }, request);

      return jsonResponse({
        success: true,
        isNew: true,
        signedFingerprint: signedFingerprint
      });
    }
  } catch (err) {
    console.error('Register device error:', (err as Error).message);
    await logSecurityEvent(null, 'register_device_exception', { error: (err as Error).message }, request);
    return errorResponse((err as Error).message, 500);
  }
}
