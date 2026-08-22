import { collection,onSnapshot,orderBy,query,type Unsubscribe } from 'firebase/firestore'
import { httpsCallable } from '../../lib/netlifyFunctions'
import { db,firebaseConfigured,functions } from '../../lib/firebase'
import type { MembershipType } from './types'
import type { MembershipStatus } from '../members/types'

export function subscribeToMembershipTypes(change:(items:MembershipType[])=>void,error:(error:Error)=>void):Unsubscribe{if(!firebaseConfigured){change([]);return()=>undefined}return onSnapshot(query(collection(db,'membershipTypes'),orderBy('name')),snapshot=>change(snapshot.docs.map(doc=>({id:doc.id,...doc.data()}) as MembershipType)),error)}
export async function saveMembershipType(item:Omit<MembershipType,'id'> & {id?:string}){if(!firebaseConfigured)return{id:item.id||`demo-${Date.now()}`};return(await httpsCallable<typeof item,{id:string}>(functions,'saveMembershipType')(item)).data}
export async function changeMembershipStatus(memberId:string,to:MembershipStatus,reason:string){if(!firebaseConfigured)return;await httpsCallable(functions,'changeMembershipStatus')({memberId,to,reason})}
