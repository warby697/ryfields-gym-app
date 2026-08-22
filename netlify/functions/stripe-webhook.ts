import { createHmac, timingSafeEqual } from 'node:crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore,Timestamp, type Firestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  initializeApp(projectId && clientEmail && privateKey ? { credential: cert({ projectId, clientEmail, privateKey }) } : undefined)
}

// Verify Stripe's `Stripe-Signature` header: t=timestamp,v1=hmac(`${t}.${body}`), 5-min tolerance.
function verifyStripe(raw: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=') as [string, string]))
  const t = parts.t, v1 = parts.v1
  if (!t || !v1) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(v1)
  return a.length === b.length && timingSafeEqual(a, b)
}

type StripeEvent = { id: string; type: string; created?: number; data: { object: Record<string, any> } }

type GCSubscription={id:string;status:string;amount:number;currency:string;start_date:string;upcoming_payments?:Array<{charge_date:string;amount:number}>;links?:{mandate?:string}}
async function gcRequest<T>(path:string,options:{method?:string;body?:unknown;idempotencyKey?:string}={}){const token=String(process.env.GOCARDLESS_ACCESS_TOKEN||'').trim().replace(/^['"]|['"]$/g,'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('GoCardless access token is missing.');const environment=token.startsWith('sandbox_')?'sandbox':token.startsWith('live_')?'live':process.env.GOCARDLESS_ENVIRONMENT,base=environment==='sandbox'?'https://api-sandbox.gocardless.com':'https://api.gocardless.com',response=await fetch(`${base}${path}`,{method:options.method||'GET',headers:{Authorization:`Bearer ${token}`,'GoCardless-Version':'2015-07-06','Content-Type':'application/json',...(options.idempotencyKey?{'Idempotency-Key':options.idempotencyKey}:{})},body:options.body?JSON.stringify(options.body):undefined}),payload=await response.json() as Record<string,T>&{error?:{message?:string}};if(!response.ok)throw new Error(payload.error?.message||`GoCardless request failed (${response.status}).`);const key=Object.keys(payload).find(k=>k!=='error');if(!key)throw new Error('GoCardless returned an empty response.');return payload[key] as T}
async function replaceGymPlusSubscription(db:Firestore,member:FirebaseFirestore.DocumentSnapshot,session:Record<string,any>,metadata:Record<string,string>){
  const requestRef=db.collection('membershipUpgradeRequests').doc(String(session.id)),environment=String(process.env.GOCARDLESS_ENVIRONMENT||'sandbox').trim().toLowerCase(),liveEnabled=['true','yes','1','on'].includes(String(process.env.ENABLE_LIVE_GOCARDLESS_UPGRADES||'').trim().toLowerCase())
  if(environment==='live'&&!liveEnabled){await requestRef.set({status:'paid_awaiting_live_enable',updatedAt:FieldValue.serverTimestamp()},{merge:true});return}
  const oldId=metadata.old_subscription_id||String(member.get('gocardlessSubscriptionId')||''),mandateId=metadata.mandate_id||String(member.get('gocardlessMandateId')||''),startDate=metadata.renewal_date
  if(!oldId||!mandateId||!/^\d{4}-\d{2}-\d{2}$/.test(startDate||''))throw new Error('The upgrade is missing its GoCardless subscription, mandate or renewal date.')
  await requestRef.set({status:'switching_gocardless',oldSubscriptionId:oldId,mandateId,renewalDate:startDate,environment,updatedAt:FieldValue.serverTimestamp()},{merge:true})
  const old=await gcRequest<GCSubscription>(`/subscriptions/${oldId}`)
  let replacement:GCSubscription
  try{replacement=await gcRequest<GCSubscription>('/subscriptions',{method:'POST',idempotencyKey:`gym-plus-${session.id}`,body:{subscriptions:{amount:4000,currency:'GBP',name:'Ryfields Gym Plus',interval_unit:'monthly',interval:1,start_date:startDate,metadata:{member_id:member.id,upgrade_order:String(session.id)},links:{mandate:mandateId}}}})}catch(error){await requestRef.set({status:'gocardless_create_failed',error:error instanceof Error?error.message:'Unknown GoCardless error',updatedAt:FieldValue.serverTimestamp()},{merge:true});throw error}
  const handover=db.batch();handover.set(db.collection('subscriptions').doc(replacement.id),{provider:'gocardless',providerSubscriptionId:replacement.id,memberId:member.id,mandateId,membershipTypeId:'gym_plus',status:replacement.status,amountMinor:4000,currency:'GBP',interval:'monthly',startDate,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});handover.set(requestRef,{status:'replacement_created_cancelling_old',newSubscriptionId:replacement.id,updatedAt:FieldValue.serverTimestamp()},{merge:true});handover.update(member.ref,{membershipTypeId:'gym_plus',membershipTypeName:'Gym Plus',membershipStatus:'active',gocardlessSubscriptionId:replacement.id,updatedAt:FieldValue.serverTimestamp()});await handover.commit()
  try{if(old.status!=='cancelled')await gcRequest<GCSubscription>(`/subscriptions/${oldId}/actions/cancel`,{method:'POST'})}catch(error){await Promise.all([requestRef.set({status:'replacement_created_old_cancel_failed',newSubscriptionId:replacement.id,error:error instanceof Error?error.message:'Unknown GoCardless error',updatedAt:FieldValue.serverTimestamp()},{merge:true}),member.ref.set({needsReview:true,updatedAt:FieldValue.serverTimestamp()},{merge:true})]);throw error}
  const complete=db.batch();complete.set(db.collection('subscriptions').doc(oldId),{status:'cancelled',replacedBySubscriptionId:replacement.id,updatedAt:FieldValue.serverTimestamp()},{merge:true});complete.set(requestRef,{status:'complete',newSubscriptionId:replacement.id,completedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});await complete.commit()
}

async function findMember(db: Firestore, customerId?: string) {
  if (!customerId) return null
  const q = await db.collection('members').where('stripeCustomerId', '==', customerId).limit(1).get()
  return q.empty ? null : q.docs[0]
}

async function releaseEventReservation(db:Firestore,metadata:Record<string,string>,reason:string){const id=metadata.reservation_id,sessionId=metadata.event_session_id;if(!id||!sessionId)return;const ref=db.collection('eventTicketReservations').doc(id),sessionRef=db.collection('classSessions').doc(sessionId);await db.runTransaction(async transaction=>{const reservation=await transaction.get(ref);if(reservation.exists&&reservation.get('status')==='reserved'){transaction.update(ref,{status:'released',releaseReason:reason,updatedAt:FieldValue.serverTimestamp()});transaction.update(sessionRef,{reservedTickets:FieldValue.increment(-1),updatedAt:FieldValue.serverTimestamp()})}})}

async function fulfilEventTicket(db:Firestore,member:FirebaseFirestore.DocumentSnapshot,metadata:Record<string,string>,checkoutSessionId:string){const reservationId=metadata.reservation_id,sessionId=metadata.event_session_id,eventId=metadata.event_id;if(!reservationId||!sessionId||!eventId)throw new Error('Paid event ticket metadata is incomplete.');const reservationRef=db.collection('eventTicketReservations').doc(reservationId),sessionRef=db.collection('classSessions').doc(sessionId),bookingRef=sessionRef.collection('bookings').doc(member.id);await db.runTransaction(async transaction=>{const[reservation,booking]=await Promise.all([transaction.get(reservationRef),transaction.get(bookingRef)]);if(reservation.get('status')==='paid')return;if(!reservation.exists||reservation.get('status')!=='reserved'||reservation.get('memberId')!==member.id)throw new Error('Event ticket reservation is no longer valid.');const quantity=Number(reservation.get('quantity')||1),held=booking.exists&&String(booking.get('status'))==='confirmed'?Number(booking.get('tickets')||1):0;transaction.update(reservationRef,{status:'paid',stripeCheckoutSessionId:checkoutSessionId,paidAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});transaction.update(sessionRef,{reservedTickets:FieldValue.increment(-quantity),bookedCount:FieldValue.increment(quantity),updatedAt:FieldValue.serverTimestamp()});transaction.set(bookingRef,{memberId:member.id,memberName:`${member.get('firstName')||''} ${member.get('lastName')||''}`.trim(),memberNumber:member.get('memberNumber')||'',status:'confirmed',position:null,usedCredit:false,paidEvent:true,tickets:held+quantity,eventId,stripeCheckoutSessionId:checkoutSessionId,bookedAt:FieldValue.serverTimestamp(),source:'stripe_event'},{merge:true})})}

async function claimCheckoutFulfilment(db:Firestore,checkoutSessionId:string,eventId:string){const ref=db.collection('shopOrders').doc(checkoutSessionId),now=Date.now();return db.runTransaction(async transaction=>{const order=await transaction.get(ref),state=String(order.get('fulfilmentState')||''),lease=order.get('fulfilmentLeaseUntil') as Timestamp|undefined;if(state==='fulfilled'||state==='processing'&&lease&&lease.toMillis()>now)return false;transaction.set(ref,{fulfilmentState:'processing',fulfilmentEventId:eventId,fulfilmentLeaseUntil:Timestamp.fromMillis(now+5*60_000),updatedAt:FieldValue.serverTimestamp()},{merge:true});return true})}

async function processEvent(db: Firestore, event: StripeEvent) {
  const eventRef = db.collection('paymentEvents').doc(event.id)
  const previous=await eventRef.get()
  if(previous.get('processingStatus')==='processed')return

  const obj = event.data.object
  const customerId = typeof obj.customer === 'string' ? obj.customer : undefined
  const metadata=(obj.metadata||{}) as Record<string,string>,metadataMemberId=metadata.member_id
  let member = metadataMemberId?await db.collection('members').doc(metadataMemberId).get():await findMember(db, customerId)
  const linkedPaymentIntent=typeof obj.payment_intent==='string'?obj.payment_intent:''
  if(!member&&linkedPaymentIntent){const linked=await db.collection('payments').where('providerPaymentId','==',linkedPaymentIntent).limit(1).get(),linkedMemberId=String(linked.docs[0]?.get('memberId')||'');if(linkedMemberId)member=await db.collection('members').doc(linkedMemberId).get()}

  await eventRef.set({ provider: 'stripe', type: event.type, customerId: customerId || null, memberId: member?.id || null, matched: !!member, processingStatus:'processing',receivedAt: FieldValue.serverTimestamp(), providerCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null },{merge:true})
  if(!member){await eventRef.set({processingStatus:'processed',processedAt:FieldValue.serverTimestamp(),note:'No matching member.'},{merge:true});return}

  const cur = String(member.get('membershipStatus') || '')
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  let to: string | null = null, reason = ''

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if(obj.payment_status==='unpaid')break
      const productId=metadata.product_id,credits=Number(metadata.credit_qty||0),fulfilmentType=metadata.fulfilment_type,amount=Number(obj.amount_total||0)
      await db.collection('payments').doc(String(obj.payment_intent||obj.id)).set({provider:'stripe',providerPaymentId:obj.payment_intent||obj.id,checkoutSessionId:obj.id,memberId:member.id,memberName:`${member.get('firstName')||''} ${member.get('lastName')||''}`.trim(),amountMinor:amount,currency:String(obj.currency||'gbp').toUpperCase(),status:'confirmed',method:'stripe',purpose:`shop_${productId}`,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true})
      const orderRef=db.collection('shopOrders').doc(String(obj.id)),existingOrder=await orderRef.get()
      await orderRef.set({memberId:member.id,productId,productName:metadata.product_name||null,fulfilmentType:fulfilmentType||null,...(!existingOrder.exists&&fulfilmentType==='manual'?{fulfilmentStatus:'ordered'}:{}),amountMinor:amount,status:'paid',provider:'stripe',paidAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true})
      if(!await claimCheckoutFulfilment(db,String(obj.id),event.id))break
      try{
        const fulfilmentMemberUpdates:Record<string,unknown>={updatedAt:FieldValue.serverTimestamp()}
        if(fulfilmentType==='event_ticket')await fulfilEventTicket(db,member,metadata,String(obj.id))
        if(credits>0)fulfilmentMemberUpdates.classCredits=FieldValue.increment(credits)
        if(productId==='day'||fulfilmentType==='day_pass')await db.collection('dayPasses').doc(String(obj.id)).set({purchasedByMemberId:member.id,productId,status:'available',provider:'stripe',plannedVisitDate:metadata.planned_visit_date||null,dateIsFlexible:true,createdAt:FieldValue.serverTimestamp()})
        if(fulfilmentType==='manual')fulfilmentMemberUpdates.needsReview=true
        if(productId==='plus'){await db.collection('membershipUpgradeRequests').doc(String(obj.id)).set({memberId:member.id,fromMembershipTypeId:member.get('membershipTypeId'),toMembershipTypeId:'gym_plus',proRataPaidMinor:amount,status:'paid_awaiting_gocardless_switch',stripeCheckoutSessionId:obj.id,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});await replaceGymPlusSubscription(db,member,obj,metadata)}
        await db.runTransaction(async transaction=>{transaction.update(member!.ref,fulfilmentMemberUpdates);transaction.set(db.collection('shopOrders').doc(String(obj.id)),{fulfilmentState:'fulfilled',fulfilledAt:FieldValue.serverTimestamp(),fulfilmentLeaseUntil:null,updatedAt:FieldValue.serverTimestamp()},{merge:true})})
      }catch(error){await db.collection('shopOrders').doc(String(obj.id)).set({fulfilmentState:'failed',fulfilmentError:error instanceof Error?error.message:'Unknown fulfilment error',fulfilmentLeaseUntil:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});throw error}
      break
    }
    case 'checkout.session.async_payment_failed':
      await db.collection('shopOrders').doc(String(obj.id)).set({status:'payment_failed',failureRecordedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true})
      await releaseEventReservation(db,metadata,'payment_failed')
      updates.needsReview=true
      break
    case 'checkout.session.expired':
      await db.collection('shopOrders').doc(String(obj.id)).set({status:'expired',expiredAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true})
      await releaseEventReservation(db,metadata,'checkout_expired')
      break
    case 'charge.refunded': {
      const paymentIntent=typeof obj.payment_intent==='string'?obj.payment_intent:''
      const payments=paymentIntent?await db.collection('payments').where('providerPaymentId','==',paymentIntent).limit(1).get():null
      const payment=payments?.docs[0],sessionId=String(payment?.get('checkoutSessionId')||'')
      if(payment)await payment.ref.set({status:obj.refunded?'refunded':'partially_refunded',amountRefundedMinor:Number(obj.amount_refunded||0),updatedAt:FieldValue.serverTimestamp()},{merge:true})
      if(sessionId)await db.collection('shopOrders').doc(sessionId).set({status:obj.refunded?'refunded':'partially_refunded',amountRefundedMinor:Number(obj.amount_refunded||0),requiresReview:true,updatedAt:FieldValue.serverTimestamp()},{merge:true})
      updates.needsReview=true
      break
    }
    case 'charge.dispute.created':
      updates.needsReview=true
      await member.ref.collection('notes').add({body:'Gym Shop payment disputed. Review the order and any fulfilled pass before taking action.',source:'stripe_webhook',createdAt:FieldValue.serverTimestamp()})
      break
    case 'invoice.payment_failed':
      if (cur !== 'cancelled') { to = 'payment_failed'; reason = 'Stripe invoice payment failed' }
      break
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      if (['pending_payment', 'payment_failed', 'suspended'].includes(cur)) { to = 'active'; reason = 'Stripe payment succeeded' }
      if (obj.id) await db.collection('payments').doc(String(obj.id)).set({ provider: 'stripe', providerPaymentId: obj.id, memberId: member.id, memberName: `${member.get('firstName') || ''} ${member.get('lastName') || ''}`.trim(), amountMinor: obj.amount_paid ?? obj.amount_due ?? null, currency: (obj.currency || 'gbp').toUpperCase(), status: 'confirmed', method: 'stripe', providerCreatedAt: event.created ? new Date(event.created * 1000).toISOString() : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      break
    case 'customer.subscription.deleted':
      if (cur !== 'cancelled') { to = 'cancelled'; reason = 'Stripe subscription cancelled'; updates.needsReview = true }
      break
    case 'customer.subscription.updated':
      if (['canceled', 'unpaid', 'incomplete_expired'].includes(String(obj.status)) && cur !== 'cancelled') { to = obj.status === 'unpaid' ? 'payment_failed' : 'cancelled'; reason = `Stripe subscription ${obj.status}`; updates.needsReview = true }
      break
  }
  if (to) updates.membershipStatus = to
  await member.ref.update(updates)
  if (to) await member.ref.collection('statusHistory').add({ from: cur, to, reason, source: 'stripe_webhook', effectiveAt: FieldValue.serverTimestamp() })
  await eventRef.set({processingStatus:'processed',processedAt:FieldValue.serverTimestamp()},{merge:true})
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook not configured', { status: 503 })
  const raw = await req.text()
  const sig = req.headers.get('stripe-signature') || ''
  if (!verifyStripe(raw, sig, secret)) return new Response('Invalid signature', { status: 400 })
  let event: StripeEvent
  try { event = JSON.parse(raw) as StripeEvent } catch { return new Response('Bad payload', { status: 400 }) }
  try { await processEvent(getFirestore(), event) } catch (e) { console.error('stripe event failed', event.id, e); return new Response('Error', { status: 500 }) }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
