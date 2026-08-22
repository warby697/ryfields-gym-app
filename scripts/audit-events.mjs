import {applicationDefault,initializeApp} from 'firebase-admin/app'
import {getFirestore} from 'firebase-admin/firestore'

initializeApp({credential:applicationDefault(),projectId:'ryfields-gym'})
const db=getFirestore(),events=await db.collection('events').get()
const rows=[]
for(const event of events.docs){
  const data=event.data(),sessionId=String(data.sessionId||'')
  const session=sessionId?await db.collection('classSessions').doc(sessionId).get():null
  rows.push({id:event.id,title:data.title,type:data.type??null,active:data.active??null,startsOn:data.startsOn??null,endsOn:data.endsOn??null,sessionId:sessionId||null,storedSessionStartsAt:data.sessionStartsAt?.toDate?.().toISOString?.()??null,linkedSessionExists:session?.exists??false,linkedSessionStartsAt:session?.get('startsAt')?.toDate?.().toISOString?.()??null,linkedSessionStatus:session?.get('status')??null})
}
console.log(JSON.stringify(rows,null,2))
