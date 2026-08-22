import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
export const goCardlessAccessToken = defineSecret('GOCARDLESS_ACCESS_TOKEN');
export const goCardlessWebhookSecret = defineSecret('GOCARDLESS_WEBHOOK_SECRET');
// Ryfields Gym uses its live GoCardless account for local acceptance testing too.
// An explicit GOCARDLESS_ENVIRONMENT value can still override this if a sandbox is added later.
export const goCardlessEnvironment = defineString('GOCARDLESS_ENVIRONMENT', { default: 'live' });
export const appBaseUrl = defineString('APP_BASE_URL', { default: 'http://localhost:5173' });
export async function goCardlessRequest(path, options = {}) {
    const token = goCardlessAccessToken.value().trim().replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '');
    if (!token)
        throw new HttpsError('failed-precondition', 'GoCardless is not configured.');
    const configured = goCardlessEnvironment.value().trim().toLowerCase(), environment = token.startsWith('sandbox_') ? 'sandbox' : token.startsWith('live_') ? 'live' : configured;
    const base = environment === 'sandbox' ? 'https://api-sandbox.gocardless.com' : 'https://api.gocardless.com';
    const response = await fetch(`${base}${path}`, { method: options.method || 'GET', headers: { Authorization: `Bearer ${token}`, 'GoCardless-Version': '2015-07-06', 'Content-Type': 'application/json', Accept: 'application/json', ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
    const payload = await response.json();
    if (!response.ok)
        throw new HttpsError('internal', payload.error?.message || 'GoCardless request failed.');
    const key = Object.keys(payload).find(item => item !== 'error');
    if (!key)
        throw new HttpsError('internal', 'GoCardless returned an empty response.');
    return payload[key];
}
