import { getFirestore, FieldValue } from 'firebase-admin/firestore'

export async function writeAudit(actorUid:string,action:string,entityType:string,entityId:string,before:unknown,after:unknown){
  await getFirestore().collection('auditLogs').add({actorUid,action,entityType,entityId,before:before??null,after:after??null,occurredAt:FieldValue.serverTimestamp()})
}
