import { FieldValue } from 'firebase-admin/firestore';
export async function queueEmail(db, id, input) {
    if (!input.to)
        return;
    await db.collection('emailOutbox').doc(id.replace(/[^a-zA-Z0-9_-]/g, '_')).create({ ...input, to: input.to.toLowerCase(), status: 'queued', attempts: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }).catch(error => { const code = String(error.code || ''); if (code !== '6' && !code.includes('already-exists'))
        throw error; });
}
