import { getFirestore, FieldValue } from 'firebase-admin/firestore';
export async function writeAudit(actorUid, action, entityType, entityId, before, after) {
    await getFirestore().collection('auditLogs').add({ actorUid, action, entityType, entityId, before: before ?? null, after: after ?? null, occurredAt: FieldValue.serverTimestamp() });
}
