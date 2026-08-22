import { createHmac,timingSafeEqual } from 'node:crypto'
import { FieldValue,getFirestore,type DocumentSnapshot } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { BillingRequest,goCardlessAccessToken,goCardlessRequest,goCardlessWebhookSecret } from '../services/gocardless.js'

type ResourceType='payments'|'mandates'|'subscriptions'|'billing_requests'
type Event={id:string;created_at:string;resource_type:ResourceType;action:string;links:Record<string,string>;details?:Record<string,unknown>;metadata?:Record<string,string>}
type Subscription={id:string;status:string}
export function validGoCardlessSignature(raw:Buffer,received:string,secret:string){const expected=createHmac('sha256',secret).update(raw).digest('hex'),a=Buffer.from(expected),b=Buffer.from(received||'');return a.length===b.length&&timingSafeEqual(a,b)}
export function paymentStatus(action:string){return({created:'pending_submission',submitted:'submitted',confirmed:'confirmed',paid_out:'paid_out',failed:'failed',cancelled:'cancelled',charged_back:'failed'} as Record<string,string>)[action]}

export const goCardlessWebhook=onRequest({secrets:[goCardlessWebhookSecret,goCardlessAccessToken]},async(req,res)=>{
  const signature=String(req.header('Webhook-Signature')||'')
  if(!validGoCardlessSignature(req.rawBody,signature,goCardlessWebhookSecret.value())){res.status(498).send('Invalid signature');return}
  const events=(req.body as{events?:Event[]}).events
  if(!Array.isArray(events)){res.status(400).send('Invalid payload');return}
  const db=getFirestore()
  for(const event of events){
    let billing:BillingRequest|undefined
    if(event.resource_type==='billing_requests'&&event.action==='fulfilled'&&event.links.billing_request)billing=await goCardlessRequest<BillingRequest>(`/billing_requests/${event.links.billing_request}`)
    const eventRef=db.collection('paymentEvents').doc(event.id)
    await db.runTransaction(async transaction=>{
      const processed=await transaction.get(eventRef)
      if(processed.exists)return
      const resourceId=event.links[event.resource_type.slice(0,-1)]
      let resourceSnapshot:DocumentSnapshot|undefined,memberSnapshot:DocumentSnapshot|undefined
      if(resourceId&&event.resource_type==='payments')resourceSnapshot=await transaction.get(db.collection('payments').doc(resourceId))
      if(resourceId&&event.resource_type==='mandates')resourceSnapshot=await transaction.get(db.collection('mandates').doc(resourceId))
      if(resourceId&&event.resource_type==='subscriptions')resourceSnapshot=await transaction.get(db.collection('subscriptions').doc(resourceId))
      const linkedMemberId=resourceSnapshot?.get('memberId') as string|undefined
      if(linkedMemberId&&(event.resource_type==='payments'||event.resource_type==='mandates'))memberSnapshot=await transaction.get(db.collection('members').doc(linkedMemberId))
      transaction.create(eventRef,{provider:'gocardless',action:event.action,resourceType:event.resource_type,resourceId:resourceId||null,receivedAt:FieldValue.serverTimestamp(),providerCreatedAt:event.created_at,processingStatus:'processed'})
      if(billing){const memberId=billing.metadata?.member_id,paymentId=billing.payment_request?.links?.payment,mandateId=billing.mandate_request?.links?.mandate;if(memberId){transaction.set(db.collection('members').doc(memberId),{gocardlessCustomerId:billing.links?.customer||null,gocardlessMandateId:mandateId||null,updatedAt:FieldValue.serverTimestamp()},{merge:true});if(paymentId)transaction.set(db.collection('payments').doc(paymentId),{provider:'gocardless',providerPaymentId:paymentId,memberId,mandateId:mandateId||null,amountMinor:billing.payment_request?.amount||null,currency:billing.payment_request?.currency||'GBP',status:'submitted',providerCreatedAt:event.created_at,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});if(mandateId)transaction.set(db.collection('mandates').doc(mandateId),{provider:'gocardless',providerMandateId:mandateId,memberId,status:'pending',providerCreatedAt:event.created_at,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true})}}
      if(event.resource_type==='payments'&&resourceId){const status=paymentStatus(event.action),previousTime=String(resourceSnapshot?.get('providerCreatedAt')||''),newer=!previousTime||event.created_at>=previousTime,memberId=linkedMemberId||event.metadata?.member_id;if(status&&newer){transaction.set(db.collection('payments').doc(resourceId),{provider:'gocardless',providerPaymentId:resourceId,memberId:memberId||null,status,providerCreatedAt:event.created_at,updatedAt:FieldValue.serverTimestamp(),...(resourceSnapshot?.exists?{}:{createdAt:FieldValue.serverTimestamp()})},{merge:true});const currentMembership=memberSnapshot?.get('membershipStatus');if(memberId&&event.action==='failed'&&currentMembership!=='cancelled')transaction.set(db.collection('members').doc(memberId),{membershipStatus:'payment_failed',updatedAt:FieldValue.serverTimestamp()},{merge:true});if(memberId&&event.action==='confirmed'&&['pending_payment','payment_failed'].includes(String(currentMembership)))transaction.set(db.collection('members').doc(memberId),{membershipStatus:'active',updatedAt:FieldValue.serverTimestamp()},{merge:true})}}
      if(event.resource_type==='mandates'&&resourceId){const previousTime=String(resourceSnapshot?.get('providerCreatedAt')||''),newer=!previousTime||event.created_at>=previousTime;if(newer){transaction.set(db.collection('mandates').doc(resourceId),{provider:'gocardless',providerMandateId:resourceId,status:event.action,providerCreatedAt:event.created_at,updatedAt:FieldValue.serverTimestamp(),...(resourceSnapshot?.exists?{}:{createdAt:FieldValue.serverTimestamp()})},{merge:true});if(linkedMemberId&&['cancelled','failed','expired'].includes(event.action)&&memberSnapshot?.get('membershipStatus')!=='cancelled'){transaction.set(db.collection('members').doc(linkedMemberId),{membershipStatus:'suspended',updatedAt:FieldValue.serverTimestamp()},{merge:true});transaction.create(db.collection('members').doc(linkedMemberId).collection('statusHistory').doc(),{from:memberSnapshot?.get('membershipStatus'),to:'suspended',reason:`GoCardless mandate ${event.action}`,source:'gocardless_webhook',effectiveAt:FieldValue.serverTimestamp()})}}}
      if(event.resource_type==='subscriptions'&&resourceId){const previousTime=String(resourceSnapshot?.get('providerCreatedAt')||'');if(!previousTime||event.created_at>=previousTime)transaction.set(db.collection('subscriptions').doc(resourceId),{provider:'gocardless',providerSubscriptionId:resourceId,status:event.action,providerCreatedAt:event.created_at,updatedAt:FieldValue.serverTimestamp(),...(resourceSnapshot?.exists?{}:{createdAt:FieldValue.serverTimestamp()})},{merge:true})}
    })
    if(event.resource_type==='mandates'&&event.action==='active'&&event.links.mandate)await ensureSubscription(event.links.mandate)
  }
  res.status(204).send()
})

async function ensureSubscription(mandateId:string){const db=getFirestore(),mandateRef=db.collection('mandates').doc(mandateId),mandate=await mandateRef.get(),memberId=mandate.get('memberId') as string|undefined;if(!memberId||mandate.get('subscriptionId'))return;const member=await db.collection('members').doc(memberId).get(),typeId=member.get('membershipTypeId') as string|undefined;if(!typeId)return;const type=await db.collection('membershipTypes').doc(typeId).get();if(!type.exists)return;const subscription=await goCardlessRequest<Subscription>('/subscriptions',{method:'POST',idempotencyKey:`${mandateId}-monthly-v1`,body:{subscriptions:{amount:type.get('priceMinor'),currency:'GBP',name:type.get('name'),interval_unit:'monthly',interval:1,metadata:{member_id:memberId},links:{mandate:mandateId}}}});await Promise.all([mandateRef.set({subscriptionId:subscription.id,status:'active',updatedAt:FieldValue.serverTimestamp()},{merge:true}),db.collection('subscriptions').doc(subscription.id).set({provider:'gocardless',providerSubscriptionId:subscription.id,memberId,mandateId,membershipTypeId:typeId,status:subscription.status,amountMinor:type.get('priceMinor'),currency:'GBP',interval:'monthly',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true}),db.collection('members').doc(memberId).set({gocardlessSubscriptionId:subscription.id,updatedAt:FieldValue.serverTimestamp()},{merge:true})])}
import '../config.js'
