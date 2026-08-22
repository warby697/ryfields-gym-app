import { FieldValue,getFirestore } from 'firebase-admin/firestore'
import { HttpsError,onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { requireStaff } from '../shared/auth.js'

// Big events shown as a carousel at the top of the member portal.
// Image is a data URL (client downsizes before upload) kept inside the doc — no storage bucket needed.
const safeLink=z.string().trim().max(300).refine(value=>!value||value.startsWith('/')||value.startsWith('https://'),'Use a secure external link or an app path.')
const schema=z.object({id:z.string().max(200).optional(),type:z.enum(['event','notice','shop']).default('event'),title:z.string().trim().min(2).max(120),body:z.string().trim().max(2000).optional(),location:z.string().trim().min(2).max(160).nullable().optional(),linkLabel:z.string().trim().max(40).optional(),linkUrl:safeLink.optional(),imageDataUrl:z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(950_000).nullable().optional(),sessionId:z.string().max(200).nullable().optional(),maxTickets:z.number().int().min(1).max(1000).default(30),ticketPriceMinor:z.number().int().min(0).max(100000).default(0),active:z.boolean(),startsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),endsOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()})
export const saveEvent=onCall({enforceAppCheck:true},async request=>{requireStaff(request);const parsed=schema.safeParse(request.data);if(!parsed.success)throw new HttpsError('invalid-argument','Event details are invalid (images must be under ~700KB once compressed).');const db=getFirestore(),ref=parsed.data.id?db.collection('events').doc(parsed.data.id):db.collection('events').doc();let sessionStartsAt:unknown=null
  // Linking a session makes it a ticketed event — booking it must NOT spend a class credit.
  if(parsed.data.sessionId){const s=await db.collection('classSessions').doc(parsed.data.sessionId).get();if(!s.exists)throw new HttpsError('not-found','That class or event session no longer exists.');if(Number(s.get('bookedCount')||0)>parsed.data.maxTickets)throw new HttpsError('failed-precondition','Maximum tickets cannot be lower than the number already booked.');await s.ref.update({creditExempt:true,eventId:ref.id,eventTicketPriceMinor:parsed.data.ticketPriceMinor,capacity:parsed.data.maxTickets,updatedAt:FieldValue.serverTimestamp()});sessionStartsAt=s.get('startsAt')||null}
  const changes:Record<string,unknown>={type:parsed.data.type,title:parsed.data.title,body:parsed.data.body||'',location:parsed.data.type==='event'?(parsed.data.location||'Ryfields Gym'):null,linkLabel:parsed.data.linkLabel||'',linkUrl:parsed.data.linkUrl||'',sessionId:parsed.data.sessionId||null,sessionStartsAt,maxTickets:parsed.data.type==='event'?parsed.data.maxTickets:null,ticketPriceMinor:parsed.data.type==='event'?parsed.data.ticketPriceMinor:0,active:parsed.data.active,startsOn:parsed.data.startsOn||null,endsOn:parsed.data.endsOn||null,updatedAt:FieldValue.serverTimestamp(),updatedByUid:request.auth!.uid}
  if(parsed.data.imageDataUrl!==undefined)changes.imageDataUrl=parsed.data.imageDataUrl
  if(!parsed.data.id){changes.createdAt=FieldValue.serverTimestamp();changes.order=Date.now()}
  await ref.set(changes,{merge:true});return{id:ref.id}})

const delSchema=z.object({id:z.string().min(1)})
export const deleteEvent=onCall({enforceAppCheck:true},async request=>{requireStaff(request);const p=delSchema.safeParse(request.data);if(!p.success)throw new HttpsError('invalid-argument','Invalid request.');await getFirestore().collection('events').doc(p.data.id).delete();return{ok:true}})

import '../config.js'
