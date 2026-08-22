import { cert,getApps,initializeApp } from 'firebase-admin/app'
import { FieldValue,getFirestore,Timestamp } from 'firebase-admin/firestore'

if(!getApps().length){const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');initializeApp(projectId&&clientEmail&&privateKey?{credential:cert({projectId,clientEmail,privateKey})}:undefined)}
export const config={schedule:'* * * * *'}
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!))
function content(kind:string,firstName:string,v:Record<string,string|number|boolean|null>,signoff:string){const hi=`Hi ${firstName||'there'},`,when=String(v.when||''),name=String(v.className||'your class'),amount=String(v.amount||'');switch(kind){
case'class_cancelled':return{subject:`We’re sorry — ${name} has been cancelled`,body:`${hi}\n\nWe’re really sorry to let you down, but ${name}${when?` on ${when}`:''} has been cancelled. ${v.lowNumbers?'There aren’t quite enough people booked to create the atmosphere and energy we want from the session.':''}\n\n${v.refunded?'Any class credit used has already been returned to your account.':'No class credit was affected.'}\n\nPlease check the app for your latest bookings.\n\n${signoff}`}
case'class_changed':return{subject:`A change to your ${name} booking`,body:`${hi}\n\nThere has been an important change to ${name}${when?` on ${when}`:''}.\n\n${String(v.change||'Please open the app to see the latest class details.')}\n\n${signoff}`}
case'waitlist_promoted':return{subject:`You’re in — a place has opened on ${name}`,body:`${hi}\n\nGood news — a place has opened up and you’re now booked onto ${name}${when?` on ${when}`:''}.\n\nYou’ll find the confirmed booking in the app.\n\n${signoff}`}
case'membership_started':return{subject:'Welcome to your Ryfields Gym membership',body:`${hi}\n\nYour ${String(v.plan||'Ryfields Gym')} membership is now active. Everything you need is in the app.\n\n${signoff}`}
case'membership_upgraded':return{subject:'You’re officially Gym Plus',body:`${hi}\n\nYour Gym Plus upgrade is complete. You keep unlimited gym access and all classes are now included.\n\n${amount?`Your pro-rata payment was ${amount}.\n\n`:''}${signoff}`}
case'membership_cancelled':return{subject:'Your Ryfields Gym membership has been cancelled',body:`${hi}\n\nYour membership has been cancelled. The app now shows its latest status. If this doesn’t look right, please contact us directly.\n\n${signoff}`}
case'payment_failed':case'direct_debit_problem':return{subject:'There’s a problem with your Ryfields Gym payment',body:`${hi}\n\nYour latest membership payment or Direct Debit instruction needs attention. Please check the app and your bank details, or contact us if you need a hand.\n\n${signoff}`}
case'shop_receipt':return{subject:`Payment received — ${String(v.item||'Ryfields Gym shop')}`,body:`${hi}\n\nThanks — we’ve received your ${amount||''} payment for ${String(v.item||'your shop order')}. Your purchase is now shown in the app.\n\n${signoff}`}
case'shop_staff_order':return{subject:`New shop order — ${String(v.item||'product')}`,body:`Hi Paul & Becky\n\n${String(v.memberName||'A member')} has paid ${amount||''} for ${String(v.item||'a physical product')}.\n\nMember email: ${String(v.memberEmail||'Not recorded')}\nOrder reference: ${String(v.orderId||'Not recorded')}\n\nThis order needs handing over to the member.\n\n${signoff}`}
case'shop_order_ready':return{subject:`Your ${String(v.item||'Ryfields Gym order')} is ready!`,body:`${hi}\n\nGood news — your ${String(v.item||'shop order')} is ready for you at Ryfields Gym. Just ask us when you’re next in.\n\n${signoff}`}
case'event_ticket':{const count=Number(v.tickets||1),eventName=String(v.item||'our event')
  return{subject:`Your ${count>1?`${count} tickets`:'ticket'} for ${eventName}`,body:`${hi}

You're all booked in for ${eventName} — we can't wait to see you there.

WHEN: ${String(v.when||'See the app for timings')}
WHERE: ${String(v.location||'Ryfields Gym')}
TICKETS: ${count} ${count>1?'tickets':'ticket'} in the name of ${String(v.memberName||'you')}
${amount?`PAID: ${amount}
`:''}
Just give your name on arrival and we'll check you off the list — there's no need to print anything.

${signoff}`}}
case'shop_refund':return{subject:'Your Ryfields Gym shop refund',body:`${hi}\n\nA refund of ${amount||'your payment'} has been processed for ${String(v.item||'your shop order')}. Your bank may take a few working days to display it.\n\n${signoff}`}
default:return{subject:String(v.subject||'Important update from Ryfields Gym'),body:`${hi}\n\n${String(v.message||'Please open the Ryfields Gym app for an important update.')}\n\n${signoff}`}}}
function html(text:string){return`<!doctype html><html><body style="margin:0;background:#f4f6ef;font-family:Arial,sans-serif;color:#263019"><div style="max-width:580px;margin:auto;padding:30px 18px"><div style="background:#fff;border-radius:18px;border-top:6px solid #8cab45;padding:30px"><strong style="letter-spacing:.12em;color:#6f873c">RYFIELDS GYM</strong>${text.split('\n\n').map(p=>`<p style="line-height:1.65;margin:0 0 14px">${esc(p).replace(/\n/g,"<br>")}</p>`).join('')}</div></div></body></html>`}
export default async()=>{
  const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM
  if(!apiKey||!from)return new Response('Email not configured',{status:503})
  const db=getFirestore(),now=Date.now(),leaseUntil=Timestamp.fromMillis(now+5*60_000)
  const [queued,sending]=await Promise.all([
    db.collection('emailOutbox').where('status','==','queued').limit(50).get(),
    db.collection('emailOutbox').where('status','==','sending').limit(50).get(),
  ])
  const candidates=[...queued.docs,...sending.docs.filter(item=>item.get('leaseUntil')?.toMillis?.()<=now)].slice(0,50)
  for(const item of candidates){
    const claimed=await db.runTransaction(async transaction=>{
      const fresh=await transaction.get(item.ref)
      if(!fresh.exists)return null
      const d=fresh.data()!,status=String(d.status||'queued'),activeLease=d.leaseUntil?.toMillis?.()>Date.now()
      if(status==='sent'||status==='failed'||(status==='sending'&&activeLease)||d.nextAttemptAt?.toMillis?.()>Date.now())return null
      const attempts=Number(d.attempts||0)+1
      transaction.update(item.ref,{status:'sending',attempts,leaseUntil,updatedAt:FieldValue.serverTimestamp()})
      return{...d,attempts}
    })
    if(!claimed)continue
    const {subject,body}=content(String(claimed.kind),String(claimed.firstName||'there'),claimed.variables||{},String(claimed.signoff||'Paul & Becky'))
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`outbox/${item.id}`},body:JSON.stringify({from,to:[claimed.to],subject,text:body,html:html(body)})})
      if(!response.ok)throw new Error(`Resend ${response.status}: ${await response.text()}`)
      const result=await response.json() as{id:string}
      await item.ref.update({status:'sent',leaseUntil:FieldValue.delete(),providerMessageId:result.id,sentAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()})
    }catch(error){
      await item.ref.update({status:claimed.attempts>=5?'failed':'queued',leaseUntil:FieldValue.delete(),lastError:error instanceof Error?error.message:'Unknown error',nextAttemptAt:Timestamp.fromMillis(Date.now()+Math.min(3_600_000,claimed.attempts*300_000)),updatedAt:FieldValue.serverTimestamp()})
    }
  }
  return new Response(null,{status:204})
}
