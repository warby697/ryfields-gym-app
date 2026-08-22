import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { paymentStatus, validGoCardlessSignature } from './gocardless.js';
describe('GoCardless webhook helpers', () => { it('accepts only a matching HMAC signature', () => { const body = Buffer.from('{"events":[]}'), secret = 'test-secret', signature = createHmac('sha256', secret).update(body).digest('hex'); expect(validGoCardlessSignature(body, signature, secret)).toBe(true); expect(validGoCardlessSignature(body, 'bad', secret)).toBe(false); }); it('maps access-affecting payment states', () => { expect(paymentStatus('confirmed')).toBe('confirmed'); expect(paymentStatus('failed')).toBe('failed'); expect(paymentStatus('unknown')).toBeUndefined(); }); });
