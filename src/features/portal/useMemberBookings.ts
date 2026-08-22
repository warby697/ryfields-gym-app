import { collectionGroup,doc,getDoc,onSnapshot,query,where } from 'firebase/firestore'
import { useEffect,useState } from 'react'
import { db,firebaseConfigured } from '../../lib/firebase'
import { reportDataError } from '../../lib/appStatus'

export type MemberBookingSession={id:string;nameSnapshot:string;descriptionSnapshot?:string;startsAt:Date;locationSnapshot:string;capacity:number;bookedCount:number;waitlistCount:number;status?:string;cancelReason?:string;creditExempt?:boolean}
export type MemberBooking={session:MemberBookingSession;status:string}

/** Reads only this member's bookings and their booked sessions. Existing nested booking records need no migration. */
export function useMemberBookings(memberId:string|null){
  const[items,setItems]=useState<MemberBooking[]>([])
  useEffect(()=>{
    if(!firebaseConfigured||!memberId){setItems([]);return}
    let current=true
    const unsubscribe=onSnapshot(query(collectionGroup(db,'bookings'),where('memberId','==',memberId),where('status','in',['confirmed','waitlisted'])),async snapshot=>{
      const resolved=await Promise.all(snapshot.docs.map(async(booking):Promise<MemberBooking|null>=>{
        const sessionId=booking.ref.parent.parent?.id
        if(!sessionId)return null
        const session=await getDoc(doc(db,'classSessions',sessionId))
        if(!session.exists()||!session.get('startsAt'))return null
        const data=session.data(),startsAt=data.startsAt.toDate() as Date
        if(startsAt.getTime()<Date.now()||String(data.status||'scheduled')==='cancelled')return null
        return{status:String(booking.get('status')),session:{id:session.id,nameSnapshot:String(data.nameSnapshot||'Booking'),descriptionSnapshot:data.descriptionSnapshot?String(data.descriptionSnapshot):undefined,startsAt,locationSnapshot:String(data.locationSnapshot||''),capacity:Number(data.capacity||0),bookedCount:Number(data.bookedCount||0),waitlistCount:Number(data.waitlistCount||0),status:String(data.status||'scheduled'),cancelReason:data.cancelReason?String(data.cancelReason):undefined,creditExempt:data.creditExempt===true}}
      }))
      if(current)setItems(resolved.filter((item):item is MemberBooking=>item!==null).sort((a,b)=>a.session.startsAt.getTime()-b.session.startsAt.getTime()))
    },error=>reportDataError('your bookings',error))
    return()=>{current=false;unsubscribe()}
  },[memberId])
  return items
}
