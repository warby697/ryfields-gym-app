import { collection, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore'
import { httpsCallable } from '../../lib/netlifyFunctions'
import { db, firebaseConfigured, functions } from '../../lib/firebase'
import type { Member, NewMember } from './types'

export function subscribeToMembers(onChange: (members: Member[]) => void, onError: (error: Error) => void): Unsubscribe {
  if (!firebaseConfigured) { onChange([]); return () => undefined }
  return onSnapshot(query(collection(db, 'members'), orderBy('lastName')), snapshot => {
    onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as Member))
  }, onError)
}

export async function createMember(input: NewMember) {
  if (!firebaseConfigured) return { id: `demo-${Date.now()}`, memberNumber: 'RYF-DEMO' }
  return (await httpsCallable<NewMember, { id: string; memberNumber: string }>(functions, 'createMember')(input)).data
}

export async function updateMember(memberId: string, changes: Partial<Pick<Member, 'firstName'|'lastName'|'email'|'phone'>>) {
  if (!firebaseConfigured) return
  await httpsCallable(functions, 'updateMember')({ memberId, changes })
}

export async function setMemberChecked(memberId: string, checked: boolean) {
  if (!firebaseConfigured) return
  await httpsCallable(functions, 'setMemberChecked')({ memberId, checked })
}

export async function linkMemberAccount(memberId: string, email: string) {
  if (!firebaseConfigured) return
  await httpsCallable(functions, 'linkMemberAccount')({ memberId, email })
}

export async function acknowledgeCancellation(memberId: string) {
  if (!firebaseConfigured) return
  await httpsCallable(functions, 'acknowledgeCancellation')({ memberId })
}

export async function grantClassCredits(memberId: string, delta: number): Promise<number> {
  if (!firebaseConfigured) return 0
  const { data } = await httpsCallable<{ memberId: string; delta: number }, { classCredits: number }>(functions, 'grantClassCredits')({ memberId, delta })
  return data.classCredits
}

export async function setCashSchedule(memberId: string, amountMinor: number, nextDueAt: string, intervalMonths = 1) {
  if (!firebaseConfigured) return { ok: true }
  return (await httpsCallable<{memberId:string;amountMinor:number;nextDueAt:string;intervalMonths:number}, {ok:boolean}>(functions, 'setCashSchedule')({ memberId, amountMinor, nextDueAt, intervalMonths })).data
}

export async function recordCashPayment(memberId: string, amountMinor?: number, paidAt?: string) {
  if (!firebaseConfigured) return { ok: true, nextDueAt: '' }
  return (await httpsCallable<{memberId:string;amountMinor?:number;paidAt?:string}, {ok:boolean;amount:string;nextDueAt:string}>(functions, 'recordCashPayment')({ memberId, amountMinor, paidAt })).data
}

export const toDate = (v?: { toDate(): Date } | Date): Date | null =>
  !v ? null : v instanceof Date ? v : v.toDate()

export async function addMemberNote(memberId: string, body: string) {
  if (!firebaseConfigured) return { id: `demo-note-${Date.now()}` }
  return (await httpsCallable<{memberId:string;body:string},{id:string}>(functions, 'addMemberNote')({ memberId, body })).data
}

export type MemberNote = { id: string; body: string; authorUid?: string; createdAt?: { toDate(): Date } }
export type StatusHistory = { id: string; from?: string; to: string; reason?: string; effectiveAt?: { toDate(): Date } }

export function subscribeToMemberNotes(memberId:string, change:(items:MemberNote[])=>void, error:(error:Error)=>void):Unsubscribe {
  if(!firebaseConfigured){change([]);return()=>undefined}
  return onSnapshot(query(collection(db,'members',memberId,'notes'),orderBy('createdAt','desc')),snapshot=>change(snapshot.docs.map(item=>({id:item.id,...item.data()}) as MemberNote)),error)
}

export function subscribeToStatusHistory(memberId:string, change:(items:StatusHistory[])=>void, error:(error:Error)=>void):Unsubscribe {
  if(!firebaseConfigured){change([]);return()=>undefined}
  return onSnapshot(query(collection(db,'members',memberId,'statusHistory'),orderBy('effectiveAt','desc')),snapshot=>change(snapshot.docs.map(item=>({id:item.id,...item.data()}) as StatusHistory)),error)
}

export type FeedbackEntry = { id: string; rating: number; comment?: string; prompt?: string; updatedAt?: { toDate(): Date }; visitAt?: { toDate(): Date }|null }
export function subscribeToMemberFeedback(memberId:string, change:(items:FeedbackEntry[])=>void, error:(error:Error)=>void):Unsubscribe {
  if(!firebaseConfigured){change([]);return()=>undefined}
  // No orderBy (avoids a composite index) — sort client-side by most recent.
  return onSnapshot(query(collection(db,'sessionFeedback'),where('memberId','==',memberId)),snapshot=>change(snapshot.docs.map(item=>({id:item.id,...item.data()}) as FeedbackEntry).sort((a,b)=>((b.updatedAt?.toDate?.()?.getTime()||0)-(a.updatedAt?.toDate?.()?.getTime()||0)))),error)
}
