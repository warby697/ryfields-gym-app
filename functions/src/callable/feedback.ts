import { FieldValue,getFirestore } from 'firebase-admin/firestore'
import { HttpsError,onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'

// "How was your last session?" — one rating per visit when we have one (doc id = visitId),
// otherwise one per member per day (unstaffed gym: people forget to scan in). Members can update a rating.
const schema=z.object({memberId:z.string().min(1),visitId:z.string().min(1).optional(),rating:z.number().int().min(1).max(5),comment:z.string().trim().max(1000).optional(),prompt:z.string().trim().max(200).optional()})
export const submitSessionFeedback=onCall({enforceAppCheck:true},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign-in is required.')
  const parsed=schema.safeParse(request.data)
  if(!parsed.success)throw new HttpsError('invalid-argument','Feedback is invalid.')
  const db=getFirestore(),member=await db.collection('members').doc(parsed.data.memberId).get()
  if(!member.exists)throw new HttpsError('not-found','Member not found.')
  const staff=['staff','admin'].includes(String(request.auth.token.role))
  if(member.get('authUid')!==request.auth.uid&&!staff)throw new HttpsError('permission-denied','You cannot leave feedback for this member.')
  let visitAt:unknown=null
  if(parsed.data.visitId){
    const visit=await db.collection('visits').doc(parsed.data.visitId).get()
    if(!visit.exists||visit.get('memberId')!==parsed.data.memberId)throw new HttpsError('not-found','We couldn’t find that gym visit.')
    visitAt=visit.get('checkedInAt')||null
  }
  const docId=parsed.data.visitId||`${parsed.data.memberId}_${new Date().toISOString().slice(0,10)}`
  await db.collection('sessionFeedback').doc(docId).set({
    memberId:parsed.data.memberId,
    memberName:`${member.get('firstName')} ${member.get('lastName')}`,
    visitId:parsed.data.visitId||null,
    visitAt,
    prompt:parsed.data.prompt||'How was your last session?',
    rating:parsed.data.rating,
    comment:parsed.data.comment||'',
    updatedAt:FieldValue.serverTimestamp(),
    createdAt:FieldValue.serverTimestamp(),
  },{merge:true})
  return{ok:true}
})
import '../config.js'
