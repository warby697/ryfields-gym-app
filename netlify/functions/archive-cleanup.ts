import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// Self-contained admin init (same pattern as the other scheduled functions).
if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  initializeApp(projectId && clientEmail && privateKey ? { credential: cert({ projectId, clientEmail, privateKey }) } : undefined)
}

// Daily 03:30: keep 90 days of past classes + events as an audit trail (who came when),
// then delete anything older — including each class's bookings/attendance subcollections.
export const config = { schedule: '30 3 * * *' }
export default async () => {
  const db = getFirestore()
  const cutoff = Timestamp.fromMillis(Date.now() - 90 * 86_400_000)

  const oldSessions = await db.collection('classSessions').where('startsAt', '<', cutoff).limit(300).get()
  for (const doc of oldSessions.docs) await db.recursiveDelete(doc.ref)

  const oldEvents = await db.collection('events').where('sessionStartsAt', '<', cutoff).limit(300).get()
  let batch = db.batch(), n = 0
  for (const doc of oldEvents.docs) { batch.delete(doc.ref); if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0 } }
  if (n) await batch.commit()

  // Challenge documents are short-lived and are safe to remove after expiry.
  const expiredChallenges = await db.collection('checkInChallenges').where('expiresAt', '<', Timestamp.now()).limit(300).get()
  for (const doc of expiredChallenges.docs) await db.recursiveDelete(doc.ref)

  return new Response(null, { status: 204 })
}
