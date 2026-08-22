import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

// Self-contained admin init (same pattern as the other scheduled functions).
if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  initializeApp(projectId && clientEmail && privateKey ? { credential: cert({ projectId, clientEmail, privateKey }) } : undefined)
}

const MIN_BOOKINGS = 3
// Auto-cancel is OFF (owner's request, 2026-08-17). Set this back to true to switch
// the under-3-bookings cancellation on again — nothing else needs changing.
const AUTO_CANCEL_ENABLED = false

const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!))
async function sendCancellationEmail(input:{to:string;firstName:string;className:string;startsAt:Date;instructor:string}){
  const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM
  if(!apiKey||!from)throw new Error('Resend is not configured.')
  const when=input.startsAt.toLocaleString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})
  const signoff=input.instructor||'Becky'
  const text=`Hi ${input.firstName},\n\nWe’re really sorry to let you down, but there aren’t quite enough people booked onto today’s ${input.className} at ${when} to create the atmosphere and energy we want from the session.\n\nWe’ve therefore cancelled today’s class. If you used a class pass, it has already been returned to your account.\n\nIf this becomes a regular occurrence, rest assured we’ll be looking at the timing and format of the class to understand what we can change and get more people involved.\n\nSorry again, and we hope to see you at another session soon.\n\n${signoff}`
  const html=`<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#263019"><h2 style="color:#15451c">Ryfields Gym</h2>${text.split('\n\n').map(p=>`<p style="line-height:1.6">${esc(p)}</p>`).join('')}</div>`
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[input.to],subject:`We’re sorry — today’s ${input.className} has been cancelled`,text,html})})
  if(!response.ok)throw new Error(`Resend ${response.status}: ${await response.text()}`)
  return response.json() as Promise<{id:string}>
}

// Every 15 min: any class starting in ~1 hour with fewer than 3 bookings is cancelled,
// and everyone booked gets their class credit back. (Ticketed events are exempt.)
export const config = { schedule: '*/15 * * * *' }
export default async () => {
  if (!AUTO_CANCEL_ENABLED) return new Response(null, { status: 204 })
  const db = getFirestore(), now = Date.now()
  const lo = Timestamp.fromMillis(now + 45 * 60_000), hi = Timestamp.fromMillis(now + 75 * 60_000)
  // Single-field range query (no composite index); status filtered in code.
  const snap = await db.collection('classSessions').where('startsAt', '>=', lo).where('startsAt', '<=', hi).get()
  for (const s of snap.docs) {
    const cancelled=await db.runTransaction(async transaction=>{
      const fresh=await transaction.get(s.ref)
      if(!fresh.exists||fresh.get('status')!=='scheduled'||fresh.get('creditExempt')===true||Number(fresh.get('bookedCount')||0)>=MIN_BOOKINGS)return null
      const bookings=await transaction.get(s.ref.collection('bookings').where('status','in',['confirmed','waitlisted']))
      if(bookings.size>200)throw new Error(`Class ${s.id} has too many bookings to cancel safely.`)
      for(const b of bookings.docs){
        transaction.update(b.ref,{status:'cancelled',cancelledAt:FieldValue.serverTimestamp(),cancelReason:'class_cancelled_low_numbers',creditForfeited:false})
        if(b.get('usedCredit'))transaction.update(db.collection('members').doc(String(b.get('memberId'))),{classCredits:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()})
      }
      transaction.update(s.ref,{status:'cancelled',cancelReason:'low_numbers',bookedCount:0,waitlistCount:0,cancelledAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()})
      return bookings.docs.map(booking=>({id:booking.id,data:booking.data()}))
    })
    if(!cancelled)continue
    const startsAt=(s.get('startsAt') as Timestamp).toDate(),className=String(s.get('nameSnapshot')||'class'),instructor=String((s.get('instructorNames')||[])[0]||'Becky')
    for(const booking of cancelled){
      const memberId=String(booking.data.memberId||'')
      try{
        const member=await db.collection('members').doc(memberId).get(),to=String(member.get('email')||'')
        if(!to)throw new Error('Member has no email address.')
        const result=await sendCancellationEmail({to,firstName:String(member.get('firstName')||'there'),className,startsAt,instructor})
        await s.ref.collection('bookings').doc(booking.id).set({cancellationEmail:{status:'sent',sentAt:FieldValue.serverTimestamp(),providerMessageId:result.id,recipient:to}},{merge:true})
      }catch(error){
        console.error('Class cancellation email failed',s.id,memberId,error)
        await s.ref.collection('bookings').doc(booking.id).set({cancellationEmail:{status:'failed',attemptedAt:FieldValue.serverTimestamp(),error:error instanceof Error?error.message:'Unknown email error'}},{merge:true})
      }
    }
  }
  return new Response(null, { status: 204 })
}
