import { cert,getApps,initializeApp } from 'firebase-admin/app'
import { getFirestore,Timestamp,type DocumentSnapshot,type Firestore,type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { queueEmail } from '../../functions/lib/shared/emailOutbox.js'

if(!getApps().length){const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');initializeApp(projectId&&clientEmail&&privateKey?{credential:cert({projectId,clientEmail,privateKey})}:undefined)}
export const config={schedule:'*/5 * * * *'}
const money=(minor:unknown)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(minor||0)/100)
const when=(value:any)=>value?.toDate?.().toLocaleString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})||''
const itemName=(id:string)=>({single:'Single class pass',three:'3 class passes',day:'One-day gym pass',plus:'Gym Plus upgrade'} as Record<string,string>)[id]||'shop order'
async function member(db:FirebaseFirestore.Firestore,id:string){const s=await db.collection('members').doc(id).get();return s.exists?s:null}
// One broken source must not silence every other email. Before this guard a
// single failing query rejected the whole scan, so nothing was ever queued.
async function safe<T>(label:string,run:()=>Promise<T>,fallback:T):Promise<T>{
  try{return await run()}catch(error){console.error('email-trigger-scan: '+label+' failed',error);return fallback}
}
// Waitlist promotions used to use a collectionGroup query, which needs a
// COLLECTION_GROUP_ASC index this project's service account cannot deploy — it
// threw FAILED_PRECONDITION on every run. Walk each recent session's own
// bookings subcollection instead (single-field, no index needed).
async function promotedBookings(db:Firestore,cutoff:Timestamp){
  const sessions=await db.collection('classSessions').where('startsAt','>=',Timestamp.fromMillis(Date.now()-36*3600000)).get()
  const docs:QueryDocumentSnapshot[]=[]
  for(const session of sessions.docs){
    const found=await session.ref.collection('bookings').where('promotedAt','>=',cutoff).get()
    docs.push(...found.docs)
  }
  return{docs}
}
export default async()=>{const db=getFirestore(),cutoff=Timestamp.fromMillis(Date.now()-36*3600000);const[promotions,cancelled,changed,statuses,orders,paymentEvents]=await Promise.all([
  safe('waitlist promotions',()=>promotedBookings(db,cutoff),{docs:[] as QueryDocumentSnapshot[]}),safe('cancelled sessions',()=>db.collection('classSessions').where('cancelledAt','>=',cutoff).get(),{docs:[]} as never),safe('changed sessions',()=>db.collection('classSessions').where('memberChangeAt','>=',cutoff).get(),{docs:[]} as never),safe('member statuses',()=>db.collectionGroup('statusHistory').where('effectiveAt','>=',cutoff).get(),{docs:[]} as never),safe('shop orders',()=>db.collection('shopOrders').where('updatedAt','>=',cutoff).get(),{docs:[]} as never),safe('payment events',()=>db.collection('paymentEvents').where('receivedAt','>=',cutoff).get(),{docs:[]} as never)])
 for(const b of promotions.docs){const sessionRef=b.ref.parent.parent;if(!sessionRef)continue;const[s,m]=await Promise.all([sessionRef.get(),member(db,String(b.get('memberId')||b.id))]);if(!s.exists||!m)continue;await queueEmail(db,`waitlist-${sessionRef.id}-${b.id}`,{kind:'waitlist_promoted',to:String(m.get('email')||''),firstName:String(m.get('firstName')||''),signoff:String((s.get('instructorNames')||[])[0]||'Becky'),variables:{className:String(s.get('nameSnapshot')||'your class'),when:when(s.get('startsAt'))}})}
 for(const s of cancelled.docs){const bookings=await s.ref.collection('bookings').where('status','==','cancelled').get();for(const b of bookings.docs){if(b.get('cancellationEmail.status')==='sent')continue;const m=await member(db,String(b.get('memberId')||b.id));if(!m)continue;await queueEmail(db,`class-cancel-${s.id}-${b.id}`,{kind:'class_cancelled',to:String(m.get('email')||''),firstName:String(m.get('firstName')||''),signoff:String((s.get('instructorNames')||[])[0]||'Becky'),variables:{className:String(s.get('nameSnapshot')||'your class'),when:when(s.get('startsAt')),lowNumbers:['low_numbers','insufficient_bookings'].includes(String(s.get('cancelReason'))),refunded:b.get('usedCredit')===true}})}}
 for(const s of changed.docs){const bookings=await s.ref.collection('bookings').where('status','in',['confirmed','waitlisted']).get();for(const b of bookings.docs){const m=await member(db,String(b.get('memberId')||b.id));if(!m)continue;await queueEmail(db,`class-change-${s.id}-${s.get('memberChangeAt')?.toMillis?.()||0}-${b.id}`,{kind:'class_changed',to:String(m.get('email')||''),firstName:String(m.get('firstName')||''),signoff:String((s.get('instructorNames')||[])[0]||'Becky'),variables:{className:String(s.get('nameSnapshot')||'your class'),when:when(s.get('startsAt')),change:String(s.get('memberChangeSummary')||'Please check the app for the latest details.')}})}}
 for(const h of statuses.docs){const memberRef=h.ref.parent.parent;if(!memberRef)continue;const m=await memberRef.get();if(!m.exists)continue;const to=String(h.get('to')||''),kind=to==='active'?'membership_started':to==='cancelled'?'membership_cancelled':to==='payment_failed'||to==='suspended'?'payment_failed':null;if(!kind)continue;await queueEmail(db,`membership-${memberRef.id}-${h.id}`,{kind,to:String(m.get('email')||''),firstName:String(m.get('firstName')||''),variables:{plan:String(m.get('membershipTypeName')||'Ryfields Gym')},signoff:'Paul & Becky'})}
 async function ticketDetails(db:Firestore,order:QueryDocumentSnapshot,member:DocumentSnapshot){
  const sessionId=String(order.get('eventSessionId')||'')
  const session=sessionId?await db.collection('classSessions').doc(sessionId).get():null
  return{tickets:Number(order.get('quantity')||1),when:session?when(session.get('startsAt')):'',location:String(session?.get('locationSnapshot')||'Ryfields Gym'),memberName:`${member.get('firstName')||''} ${member.get('lastName')||''}`.trim()}
}
  for(const o of orders.docs){const m=await member(db,String(o.get('memberId')||''));if(!m)continue;const status=String(o.get('status')||''),product=String(o.get('productId')||''),name=String(o.get('productName')||itemName(product)),isTicket=String(o.get('fulfilmentType')||'')==='event_ticket',kind=status==='paid'?(product==='plus'?'membership_upgraded':isTicket?'event_ticket':'shop_receipt'):status.includes('refund')?'shop_refund':null;if(kind)await queueEmail(db,`shop-${o.id}-${status}-${Number(o.get('amountRefundedMinor')||o.get('amountMinor')||0)}`,{kind,to:String(m.get('email')||''),firstName:String(m.get('firstName')||''),variables:{item:name,amount:money(status.includes('refund')?o.get('amountRefundedMinor'):o.get('amountMinor')),...(isTicket?await ticketDetails(db,o,m):{})},signoff:'Paul & Becky'});if(status==='paid'&&o.get('fulfilmentType')==='manual'&&process.env.ADMIN_EMAIL)await queueEmail(db,`shop-staff-${o.id}`,{kind:'shop_staff_order',to:process.env.ADMIN_EMAIL,firstName:'team',variables:{item:name,amount:money(o.get('amountMinor')),memberName:`${m.get('firstName')||''} ${m.get('lastName')||''}`.trim(),memberEmail:String(m.get('email')||''),orderId:o.id},signoff:'Ryfields Gym app'});if(status==='paid'&&o.get('fulfilmentStatus')==='ready')await queueEmail(db,`shop-ready-${o.id}`,{kind:'shop_order_ready',to:String(m.get('email')||''),firstName:String(m.get('firstName')||''),variables:{item:name},signoff:'Paul & Becky'})}
 for(const e of paymentEvents.docs){if(e.get('provider')!=='gocardless'||!e.get('memberId'))continue;const action=String(e.get('action')||''),resource=String(e.get('resourceType')||'');if(!(['failed','charged_back','cancelled','expired'].includes(action)))continue;const m=await member(db,String(e.get('memberId')));if(!m)continue;await queueEmail(db,`gocardless-${e.id}`,{kind:resource==='payments'?'payment_failed':'direct_debit_problem',to:String(m.get('email')||''),firstName:String(m.get('firstName')||''),signoff:'Paul & Becky',variables:{}})}
 return new Response(null,{status:204})}
