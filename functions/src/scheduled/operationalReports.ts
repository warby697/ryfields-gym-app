import { FieldValue,getFirestore,Timestamp } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

export const aggregateOperationalReports=onSchedule({schedule:'every day 02:10',timeZone:'Europe/London'},async()=>{const db=getFirestore(),since=Timestamp.fromMillis(Date.now()-30*86400000),[sessions,visits,active]=await Promise.all([db.collection('classSessions').where('startsAt','>=',since).get(),db.collection('visits').where('checkedInAt','>=',since).get(),db.collection('members').where('membershipStatus','==','active').count().get()]),classes=new Map<string,{bookings:number;capacity:number;sessions:number}>(),visitCounts=new Map<string,number>();for(const item of sessions.docs){const name=String(item.get('nameSnapshot')||'Class'),entry=classes.get(name)||{bookings:0,capacity:0,sessions:0};entry.bookings+=Number(item.get('bookedCount')||0);entry.capacity+=Number(item.get('capacity')||0);entry.sessions++;classes.set(name,entry)}for(const item of visits.docs){const memberId=String(item.get('memberId'));visitCounts.set(memberId,(visitCounts.get(memberId)||0)+1)}const popularClasses=[...classes.entries()].map(([name,data])=>({name,...data,utilisation:data.capacity?Math.round(data.bookings/data.capacity*100):0})).sort((a,b)=>b.bookings-a.bookings).slice(0,10),frequency={frequent:0,regular:0,occasional:0,none:Math.max(0,active.data().count-visitCounts.size)};for(const count of visitCounts.values()){if(count>=8)frequency.frequent++;else if(count>=4)frequency.regular++;else frequency.occasional++}await db.collection('reportSnapshots').doc('current').set({periodDays:30,popularClasses,visitFrequency:frequency,activeMembers:active.data().count,generatedAt:FieldValue.serverTimestamp()},{merge:true})
// Busy-times profile (London local) for the "busiest at" chart on the member portal.
const byHour=new Array(24).fill(0),byDay=new Array(7).fill(0),dayName=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const hourFmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}),dayFmt=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/London',weekday:'short'})
for(const item of visits.docs){if(item.get('countsTowardOccupancy')===false)continue;const d=item.get('checkedInAt')?.toDate?.();if(!d)continue;const h=Number(hourFmt.format(d));if(h>=0&&h<24)byHour[h]++;const wd=dayName.indexOf(dayFmt.format(d));if(wd>=0)byDay[wd]++}
await db.collection('busyTimes').doc('current').set({byHour,byDay,periodDays:30,totalVisits:visits.size,generatedAt:FieldValue.serverTimestamp()},{merge:true})
// 90-day activity ranking, written onto member docs so each member's portal can show "you're our Nth most active member".
const since90=Timestamp.fromMillis(Date.now()-90*86400000),visits90=await db.collection('visits').where('checkedInAt','>=',since90).get(),counts90=new Map<string,number>()
for(const item of visits90.docs){const memberId=String(item.get('memberId'));counts90.set(memberId,(counts90.get(memberId)||0)+1)}
const ranked=[...counts90.entries()].sort((a,b)=>b[1]-a[1]),rankOf=new Map<string,number>();ranked.forEach(([memberId],index)=>rankOf.set(memberId,index+1))
const allMembers=await db.collection('members').get()
let batch=db.batch(),writes=0
for(const memberDoc of allMembers.docs){const count=counts90.get(memberDoc.id)||0,rank=rankOf.get(memberDoc.id)??null
  if(Number(memberDoc.get('visitCount90d')||0)===count&&(memberDoc.get('activityRank')??null)===rank&&Number(memberDoc.get('activityRankOutOf')||0)===ranked.length)continue
  batch.update(memberDoc.ref,{visitCount90d:count,activityRank:rank,activityRankOutOf:ranked.length})
  if(++writes===450){await batch.commit();batch=db.batch();writes=0}}
if(writes)await batch.commit()})
import '../config.js'
