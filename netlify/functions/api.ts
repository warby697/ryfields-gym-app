import { getAuth } from 'firebase-admin/auth'
import { getFirestore,FieldValue } from 'firebase-admin/firestore'
import * as backend from '../../functions/lib/index.js'

const allowed=new Set([
  'bootstrapAdmin',
  'addMemberNote','claimMembership','completeRegistration','createFreeAccount','createMember','dismissAppWelcome','selectMembershipPlan','updateMember','updateOwnProfile',
  'setMemberChecked','linkMemberAccount','acknowledgeCancellation','setMemberJourney','updateGoalProgress','saveEvent','deleteEvent','submitSessionFeedback','grantClassCredits','gymOccupancy',
  'recordCashPayment','setCashSchedule','startDirectDebit',
  'changeMembershipStatus','saveMembershipType','bookClass','cancelClassBooking',
  'markClassAttendance','saveClassSession','cancelClassSession','staffCancelClassBooking','createCheckInChallenge','memberCheckIn',
  'staffCheckIn','searchCheckInMembers','saveClassTemplate','editClassTemplate',
  'saveEmailTemplate','sendTemplateEmail','queueUrgentBroadcast',
  'createStripeShopCheckout','getStripeShopOrderStatus',
  'saveShopProduct','deleteShopProduct','listShopOrders','updateShopOrderStatus',
  'previewGymPlusUpgrade','createStripeEventCheckout','confirmStripeEventCheckout',
])

type Runnable={run(request:unknown):Promise<unknown>}

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}

export default async(req:Request)=>{
  if(req.method!=='POST')return json({error:'Method not allowed.'},405)
  const bearer=req.headers.get('authorization')||''
  if(!bearer.startsWith('Bearer '))return json({error:'Sign-in is required.'},401)
  try{
    const token=await getAuth().verifyIdToken(bearer.slice(7),true)
    const payload=await req.json() as{name?:string;data?:unknown}
    const name=payload.name||''
    if(!allowed.has(name))return json({error:'Unknown operation.'},404)
    if(name==='bookClass'){
      const sessionId=String((payload.data as{sessionId?:string}|undefined)?.sessionId||'')
      const[session,linked]=await Promise.all([getFirestore().collection('classSessions').doc(sessionId).get(),getFirestore().collection('events').where('sessionId','==',sessionId).limit(5).get()])
      if(Number(session.get('eventTicketPriceMinor')||0)>0||linked.docs.some(event=>Number(event.get('ticketPriceMinor')||0)>0))return json({error:'This is a paid event. Please buy your ticket through the event page.'},409)
    }
    if(name==='bootstrapAdmin'){
      const allowedEmail=process.env.ADMIN_EMAIL?.trim().toLowerCase()
      if(!allowedEmail||token.email?.toLowerCase()!==allowedEmail)return json({error:'This account is not the configured administrator.'},403)
      const marker=getFirestore().collection('systemConfig').doc('adminBootstrap')
      await getFirestore().runTransaction(async transaction=>{
        const existing=await transaction.get(marker)
        if(existing.exists&&existing.get('uid')!==token.uid)throw new Error('The initial administrator has already been created.')
        transaction.set(marker,{uid:token.uid,email:allowedEmail,completedAt:FieldValue.serverTimestamp()},{merge:true})
        transaction.set(getFirestore().collection('userProfiles').doc(token.uid),{email:allowedEmail,role:'admin',updatedAt:FieldValue.serverTimestamp()},{merge:true})
        transaction.set(getFirestore().collection('membershipTypes').doc('full'),{name:'Full Gym',description:'Gym floor and all group classes',priceMinor:4500,currency:'GBP',billingInterval:'monthly',active:true,classAccessPolicy:'all',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true})
        transaction.set(getFirestore().collection('membershipTypes').doc('classes'),{name:'Classes',description:'Group classes membership',priceMinor:3500,currency:'GBP',billingInterval:'monthly',active:true,classAccessPolicy:'classes_only',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true})
        transaction.set(getFirestore().collection('counters').doc('members'),{next:1000},{merge:true})
      })
      await getAuth().setCustomUserClaims(token.uid,{role:'admin'})
      return json({data:{ok:true}})
    }
    const operation=(backend as unknown as Record<string,Runnable>)[name]
    const data=await operation.run({data:payload.data,auth:{uid:token.uid,token},rawRequest:req})
    return json({data})
  }catch(error){
    const detail=error as{message?:string;code?:string}
    const status=detail.code?.includes('unauthenticated')?401:detail.code?.includes('permission-denied')?403:detail.code?.includes('not-found')?404:detail.code?.includes('invalid-argument')?400:409
    return json({error:detail.message||'The operation could not be completed.'},status)
  }
}

export const config={method:'POST' as const,rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip']}}
