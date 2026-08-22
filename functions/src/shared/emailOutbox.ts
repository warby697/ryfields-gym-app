import { FieldValue,type Firestore } from 'firebase-admin/firestore'

export type TransactionalEmailKind='class_cancelled'|'class_changed'|'waitlist_promoted'|'membership_started'|'membership_upgraded'|'membership_cancelled'|'payment_failed'|'shop_receipt'|'event_ticket'|'shop_staff_order'|'shop_order_ready'|'shop_refund'|'direct_debit_problem'|'urgent_notice'

export async function queueEmail(db:Firestore,id:string,input:{kind:TransactionalEmailKind;to:string;firstName?:string;variables?:Record<string,string|number|boolean|null>;signoff?:string}){
  if(!input.to)return
  await db.collection('emailOutbox').doc(id.replace(/[^a-zA-Z0-9_-]/g,'_')).create({...input,to:input.to.toLowerCase(),status:'queued',attempts:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()}).catch(error=>{const code=String((error as{code?:number|string}).code||'');if(code!=='6'&&!code.includes('already-exists'))throw error})
}
