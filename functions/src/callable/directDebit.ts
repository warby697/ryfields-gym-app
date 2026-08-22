import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'

// Direct GoCardless call reading config from process.env (works in the Netlify dispatcher).
async function gcRequest<T>(path: string, opts: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const token = process.env.GOCARDLESS_ACCESS_TOKEN
  if (!token) throw new HttpsError('failed-precondition', 'Direct Debit is not available just yet. Please contact the gym.')
  const cleanToken=token.trim().replace(/^['"]|['"]$/g,'').replace(/^Bearer\s+/i,'')
  const environment=cleanToken.startsWith('live_')?'live':cleanToken.startsWith('sandbox_')?'sandbox':String(process.env.GOCARDLESS_ENVIRONMENT||'live').trim().toLowerCase()
  const base = environment === 'live' ? 'https://api.gocardless.com' : 'https://api-sandbox.gocardless.com'
  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${cleanToken}`, 'GoCardless-Version': '2015-07-06', 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json() as Record<string, any>
  if (!res.ok) throw new HttpsError('internal', json?.error?.message || 'GoCardless request failed.')
  const key = Object.keys(json).find(k => k !== 'meta')
  return (key ? json[key] : json) as T
}

const schema = z.object({ memberId: z.string().min(1) })
export const startDirectDebit = onCall({ enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in is required.')
  const p = schema.safeParse(request.data)
  if (!p.success) throw new HttpsError('invalid-argument', 'Member is required.')
  const db = getFirestore(), memberRef = db.collection('members').doc(p.data.memberId), snap = await memberRef.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Member not found.')
  const role = request.auth.token.role
  if (snap.get('authUid') !== request.auth.uid && !['staff', 'admin'].includes(String(role))) throw new HttpsError('permission-denied', 'You cannot set up payment for this member.')
  const typeId = String(snap.get('membershipTypeId') || '')
  const type = await db.collection('membershipTypes').doc(typeId).get()
  if (!type.exists) throw new HttpsError('failed-precondition', 'Membership type not found.')

  const appBase = (process.env.CONTEXT === 'dev' ? 'http://localhost:8888' : process.env.APP_BASE_URL || 'https://ryfields-gym.netlify.app').replace(/\/$/, '')
  const idem = `member-${memberRef.id}-dd-${Date.now()}`
  // Mandate-only billing request; the recurring subscription is created by the webhook once the mandate is set up.
  const billing = await gcRequest<{ id: string }>('/billing_requests', { method: 'POST', idempotencyKey: idem, body: { billing_requests: { mandate_request: { scheme: 'bacs' }, metadata: { member_id: memberRef.id, membership_type_id: typeId } } } })
  // Prefill the hosted page with what we already hold so the member isn't retyping their signup details.
  const prefilled: Record<string, string> = { country_code: 'GB' }
  const email = String(snap.get('email') || ''), given = String(snap.get('firstName') || ''), family = String(snap.get('lastName') || ''), address = String(snap.get('addressLine') || ''), postcode = String(snap.get('postcode') || '')
  if (email) prefilled.email = email
  if (given) prefilled.given_name = given
  if (family) prefilled.family_name = family
  if (address) prefilled.address_line1 = address
  if (postcode) prefilled.postal_code = postcode
  const flow = await gcRequest<{ authorisation_url: string }>('/billing_request_flows', { method: 'POST', idempotencyKey: `${idem}-flow`, body: { billing_request_flows: { redirect_uri: `${appBase}/payment/return`, exit_uri: `${appBase}/`, prefilled_customer: prefilled, links: { billing_request: billing.id } } } })
  await memberRef.update({ gocardlessBillingRequestId: billing.id, paymentSetupStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  return { authorisationUrl: flow.authorisation_url }
})
import '../config.js'
