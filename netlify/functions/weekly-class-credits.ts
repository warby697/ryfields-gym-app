import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

// Self-contained admin init (same pattern as the webhooks).
if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  initializeApp(projectId && clientEmail && privateKey ? { credential: cert({ projectId, clientEmail, privateKey }) } : undefined)
}

// Run at both possible UTC equivalents; the London guard selects exactly 6pm across GMT/BST.
export const config = { schedule: '0 17,18 * * 0' }
export default async () => {
  const now=new Date(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]))
  if(parts.weekday!=='Sun'||parts.hour!=='18')return new Response(null,{status:204})
  const creditKey=`${parts.year}-${parts.month}-${parts.day}`,db = getFirestore()
  const types = await db.collection('membershipTypes').where('classAccessPolicy', '==', 'weekly_class').get()
  const weeklyIds = new Set(types.docs.map(d => d.id))
  if (!weeklyIds.size) return new Response(null, { status: 204 })
  const members = await db.collection('members').where('membershipStatus', 'in', ['active', 'payment_failed']).get()
  let batch = db.batch(), writes = 0
  for (const doc of members.docs) {
    if (!weeklyIds.has(String(doc.get('membershipTypeId') || ''))) continue
    if(doc.get('lastWeeklyCreditKey')===creditKey)continue
    const next = Math.min(3, Number(doc.get('classCredits') || 0) + 1)
    if (next === Number(doc.get('classCredits') || 0)) continue
    batch.update(doc.ref, { classCredits: next, lastWeeklyCreditKey:creditKey, updatedAt: FieldValue.serverTimestamp() })
    if (++writes === 450) { await batch.commit(); batch = db.batch(); writes = 0 }
  }
  if (writes) await batch.commit()
  return new Response(null, { status: 204 })
}
