import { createHmac, timingSafeEqual } from 'node:crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'

// Self-contained admin init (same pattern as functions/index.ts) so this webhook
// runs independently of the callable dispatcher.
if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  initializeApp(projectId && clientEmail && privateKey ? { credential: cert({ projectId, clientEmail, privateKey }) } : undefined)
}

type GcEvent = { id: string; created_at?: string; resource_type: string; action: string; links: Record<string, string> }

async function goCardlessGet<T = Record<string, unknown>>(path: string): Promise<T | null> {
  const token = process.env.GOCARDLESS_ACCESS_TOKEN
  if (!token) return null
  const environment=token.trim().startsWith('live_')?'live':token.trim().startsWith('sandbox_')?'sandbox':String(process.env.GOCARDLESS_ENVIRONMENT||'live').trim().toLowerCase()
  const base = environment === 'live' ? 'https://api.gocardless.com' : 'https://api-sandbox.gocardless.com'
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}`, 'GoCardless-Version': '2015-07-06', Accept: 'application/json' } })
  if (!res.ok) return null
  const json = await res.json() as Record<string, T>
  const key = Object.keys(json).find(k => k !== 'meta')
  return key ? json[key] : null
}

async function goCardlessPost<T = any>(path: string, body: unknown, idempotencyKey: string): Promise<T | null> {
  const token = process.env.GOCARDLESS_ACCESS_TOKEN
  if (!token) return null
  const environment=token.trim().startsWith('live_')?'live':token.trim().startsWith('sandbox_')?'sandbox':String(process.env.GOCARDLESS_ENVIRONMENT||'live').trim().toLowerCase()
  const base = environment === 'live' ? 'https://api.gocardless.com' : 'https://api-sandbox.gocardless.com'
  const res = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'GoCardless-Version': '2015-07-06', 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) })
  if (!res.ok) return null
  const json = await res.json() as Record<string, T>
  const key = Object.keys(json).find(k => k !== 'meta')
  return key ? json[key] : null
}

// A member finished the hosted Direct Debit flow: link them, activate access, create the subscription.
async function handleBillingRequest(db: Firestore, event: GcEvent): Promise<{ memberId: string | null; matched: boolean }> {
  const br = event.links.billing_request ? await goCardlessGet<any>(`/billing_requests/${event.links.billing_request}`) : null
  const memberId = br?.metadata?.member_id as string | undefined
  const customerId = br?.links?.customer as string | undefined
  const mandateId = br?.mandate_request?.links?.mandate as string | undefined
  const typeId = br?.metadata?.membership_type_id as string | undefined
  if (!memberId) return { memberId: null, matched: false }
  const mref = db.collection('members').doc(memberId)
  const msnap = await mref.get()
  if (!msnap.exists) return { memberId, matched: false }
  const cur = String(msnap.get('membershipStatus') || '')
  const updates: Record<string, unknown> = { gocardlessCustomerId: customerId || msnap.get('gocardlessCustomerId') || null, gocardlessMandateId: mandateId || null, updatedAt: FieldValue.serverTimestamp() }
  if (cur !== 'active') updates.membershipStatus = 'active'
  await mref.update(updates)
  if (cur !== 'active') await mref.collection('statusHistory').add({ from: cur, to: 'active', reason: 'Direct Debit set up', source: 'gocardless_webhook', effectiveAt: FieldValue.serverTimestamp() })
  if (mandateId && typeId && !msnap.get('gocardlessSubscriptionId')) {
    const type = await db.collection('membershipTypes').doc(typeId).get()
    if (type.exists) {
      const sub = await goCardlessPost<any>('/subscriptions', { subscriptions: { amount: type.get('priceMinor'), currency: 'GBP', name: type.get('name'), interval_unit: 'monthly', interval: 1, metadata: { member_id: memberId }, links: { mandate: mandateId } } }, `${mandateId}-sub-v1`)
      if (sub?.id) {
        await mref.update({ gocardlessSubscriptionId: sub.id })
        await db.collection('subscriptions').doc(sub.id).set({ provider: 'gocardless', providerSubscriptionId: sub.id, memberId, mandateId, membershipTypeId: typeId, status: sub.status || 'pending', amountMinor: type.get('priceMinor'), currency: 'GBP', interval: 'monthly', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      }
    }
  }
  return { memberId, matched: true }
}

// Resolve the GoCardless customer id (and mandate id + payment amount) behind an event.
async function resolve(event: GcEvent) {
  let customerId: string | undefined, mandateId: string | undefined, amountMinor: number | undefined
  if (event.resource_type === 'payments' && event.links.payment) {
    const p = await goCardlessGet<{ amount?: number; links?: { mandate?: string } }>(`/payments/${event.links.payment}`)
    amountMinor = p?.amount; mandateId = p?.links?.mandate
  } else if (event.resource_type === 'mandates') {
    mandateId = event.links.mandate
  } else if (event.resource_type === 'subscriptions' && event.links.subscription) {
    const s = await goCardlessGet<{ links?: { mandate?: string } }>(`/subscriptions/${event.links.subscription}`)
    mandateId = s?.links?.mandate
  }
  if (mandateId) {
    const m = await goCardlessGet<{ links?: { customer?: string } }>(`/mandates/${mandateId}`)
    customerId = m?.links?.customer
  }
  return { customerId, mandateId, amountMinor }
}

async function processEvent(db: Firestore, event: GcEvent) {
  const eventRef = db.collection('paymentEvents').doc(event.id)
  if ((await eventRef.get()).get('processingStatus')==='processed') return

  // New-joiner Direct Debit set-up completes here.
  if (event.resource_type === 'billing_requests') {
    let res = { memberId: null as string | null, matched: false }
    if (event.action === 'fulfilled') res = await handleBillingRequest(db, event)
    await eventRef.set({ provider: 'gocardless', resourceType: 'billing_requests', action: event.action, memberId: res.memberId, matched: res.matched, processingStatus:'processed',receivedAt: FieldValue.serverTimestamp(),processedAt:FieldValue.serverTimestamp(), providerCreatedAt: event.created_at || null },{merge:true})
    return
  }

  const { customerId, mandateId, amountMinor } = await resolve(event).catch(() => ({ customerId: undefined, mandateId: undefined, amountMinor: undefined }))
  let member = null as FirebaseFirestore.QueryDocumentSnapshot | null
  if (customerId) {
    const q = await db.collection('members').where('gocardlessCustomerId', '==', customerId).limit(1).get()
    if (!q.empty) member = q.docs[0]
  }

  await eventRef.set({ provider: 'gocardless', resourceType: event.resource_type, action: event.action, customerId: customerId || null, memberId: member?.id || null, matched: !!member,processingStatus:'processing', receivedAt: FieldValue.serverTimestamp(), providerCreatedAt: event.created_at || null },{merge:true})
  if (!member){await eventRef.set({processingStatus:'processed',processedAt:FieldValue.serverTimestamp()},{merge:true});return}

  const cur = String(member.get('membershipStatus') || '')
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (mandateId) updates.gocardlessMandateId = mandateId
  let to: string | null = null, reason = ''
  if (event.resource_type === 'payments') {
    if ((event.action === 'failed' || event.action === 'charged_back') && cur !== 'cancelled') { to = 'payment_failed'; reason = `GoCardless payment ${event.action}` }
    else if ((event.action === 'confirmed' || event.action === 'paid_out') && ['pending_payment', 'payment_failed', 'suspended'].includes(cur)) { to = 'active'; reason = 'GoCardless payment confirmed' }
    // log the payment itself into the shared payments collection
    if (event.links.payment) await db.collection('payments').doc(event.links.payment).set({ provider: 'gocardless', providerPaymentId: event.links.payment, memberId: member.id, memberName: `${member.get('firstName') || ''} ${member.get('lastName') || ''}`.trim(), amountMinor: amountMinor ?? null, currency: 'GBP', status: event.action, method: 'gocardless', providerCreatedAt: event.created_at || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  } else if (event.resource_type === 'mandates') {
    if (['cancelled', 'expired'].includes(event.action) && cur !== 'cancelled') { to = 'cancelled'; reason = `GoCardless mandate ${event.action}`; updates.needsReview = true }
    else if (event.action === 'failed' && cur !== 'cancelled') { to = 'suspended'; reason = 'GoCardless mandate failed'; updates.needsReview = true }
  } else if (event.resource_type === 'subscriptions') {
    const eventSubscriptionId=String(event.links.subscription||''),currentSubscriptionId=String(member.get('gocardlessSubscriptionId')||'')
    if (['cancelled', 'finished'].includes(event.action) && eventSubscriptionId===currentSubscriptionId && cur !== 'cancelled') { to = 'cancelled'; reason = `GoCardless subscription ${event.action}`; updates.needsReview = true }
  }
  if (to) updates.membershipStatus = to
  await member.ref.update(updates)
  if (to) await member.ref.collection('statusHistory').add({ from: cur, to, reason, source: 'gocardless_webhook', effectiveAt: FieldValue.serverTimestamp() })
  await eventRef.set({processingStatus:'processed',processedAt:FieldValue.serverTimestamp()},{merge:true})
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 503 })
  const raw = await req.text()
  const received = req.headers.get('webhook-signature') || ''
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(received)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response('Invalid signature', { status: 498 })
  let events: GcEvent[]
  try { events = (JSON.parse(raw) as { events?: GcEvent[] }).events || [] } catch { return new Response('Bad payload', { status: 400 }) }
  const db = getFirestore()
  let failed=false
  for (const event of events) { try { await processEvent(db, event) } catch (e) { failed=true;console.error('gocardless event failed', event.id, e) } }
  return failed?new Response('Event processing failed',{status:500}):new Response(null, { status: 204 })
}
