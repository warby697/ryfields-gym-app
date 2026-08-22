import { FieldValue,getFirestore } from 'firebase-admin/firestore'
import { HttpsError,onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { writeAudit } from '../shared/audit.js'
import { requireAdmin } from '../shared/auth.js'
import { canTransitionMembership,membershipStatuses,type MembershipStatus } from '../domain/membership.js'

const productSchema=z.object({id:z.string().min(1).optional(),name:z.string().trim().min(1).max(100),description:z.string().trim().max(500),priceMinor:z.number().int().nonnegative(),currency:z.literal('GBP'),billingInterval:z.enum(['monthly','annual']),active:z.boolean(),classAccessPolicy:z.enum(['all','gym_only','classes_only','weekly_class'])})
const transitionSchema=z.object({memberId:z.string().min(1),to:z.enum(membershipStatuses),reason:z.string().trim().min(3).max(500)})

export const saveMembershipType=onCall({enforceAppCheck:true},async request=>{requireAdmin(request);const parsed=productSchema.safeParse(request.data);if(!parsed.success)throw new HttpsError('invalid-argument','Membership type is invalid.');const{ id,...data}=parsed.data;const ref=id?getFirestore().collection('membershipTypes').doc(id):getFirestore().collection('membershipTypes').doc();const before=(await ref.get()).data()??null;await ref.set({...data,updatedAt:FieldValue.serverTimestamp(),...(before?{}:{createdAt:FieldValue.serverTimestamp()})},{merge:true});await writeAudit(request.auth!.uid,before?'membershipType.update':'membershipType.create','membershipType',ref.id,before,data);return{id:ref.id}})

export const changeMembershipStatus=onCall({enforceAppCheck:true},async request=>{requireAdmin(request);const parsed=transitionSchema.safeParse(request.data);if(!parsed.success)throw new HttpsError('invalid-argument','Status change is invalid.');const db=getFirestore(),ref=db.collection('members').doc(parsed.data.memberId);await db.runTransaction(async transaction=>{const snapshot=await transaction.get(ref);if(!snapshot.exists)throw new HttpsError('not-found','Member not found.');const from=snapshot.get('membershipStatus') as MembershipStatus;if(!canTransitionMembership(from,parsed.data.to))throw new HttpsError('failed-precondition',`Cannot change membership from ${from} to ${parsed.data.to}.`);transaction.update(ref,{membershipStatus:parsed.data.to,updatedAt:FieldValue.serverTimestamp()});transaction.set(ref.collection('statusHistory').doc(),{from,to:parsed.data.to,reason:parsed.data.reason,source:'admin',actorUid:request.auth!.uid,effectiveAt:FieldValue.serverTimestamp()})});await writeAudit(request.auth!.uid,'membership.status.change','member',parsed.data.memberId,null,{to:parsed.data.to,reason:parsed.data.reason});return{ok:true}})
import '../config.js'
