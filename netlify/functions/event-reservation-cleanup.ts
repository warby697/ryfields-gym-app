import { cert,getApps,initializeApp } from 'firebase-admin/app'
import { FieldValue,getFirestore,Timestamp } from 'firebase-admin/firestore'

if(!getApps().length){const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');initializeApp(projectId&&clientEmail&&privateKey?{credential:cert({projectId,clientEmail,privateKey})}:undefined)}

// Stripe normally releases these through checkout.session.expired. This five-minute
// sweep is an independent failsafe so an abandoned checkout can never hold capacity.
export const config={schedule:'*/5 * * * *'}
export default async()=>{
  const db=getFirestore(),expired=await db.collection('eventTicketReservations').where('status','==','reserved').where('expiresAt','<=',Timestamp.now()).limit(100).get()
  for(const reservation of expired.docs){
    const sessionId=String(reservation.get('sessionId')||'')
    if(!sessionId)continue
    const sessionRef=db.collection('classSessions').doc(sessionId)
    await db.runTransaction(async transaction=>{
      const fresh=await transaction.get(reservation.ref)
      if(!fresh.exists||fresh.get('status')!=='reserved')return
      transaction.update(reservation.ref,{status:'released',releaseReason:'reservation_expired_failsafe',updatedAt:FieldValue.serverTimestamp()})
      transaction.update(sessionRef,{reservedTickets:FieldValue.increment(-Number(fresh.get('quantity')||1)),updatedAt:FieldValue.serverTimestamp()})
    })
  }
  return new Response(null,{status:204})
}
