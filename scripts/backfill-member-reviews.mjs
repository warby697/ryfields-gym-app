import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

const apply = process.argv.includes('--apply')
const summary = process.argv.includes('--summary')
const daysArg = process.argv.find(arg => arg.startsWith('--days='))
const days = Number(daysArg?.split('=')[1] || 30)
if (!Number.isInteger(days) || days < 1 || days > 180) throw new Error('Days must be between 1 and 180.')

initializeApp({ credential: applicationDefault(), projectId: 'ryfields-gym' })
const db = getFirestore()
const cutoff = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000)

const [createdSnapshot, auditSnapshot] = await Promise.all([
  db.collection('members').where('createdAt', '>=', cutoff).get(),
  db.collection('auditLogs').where('occurredAt', '>=', cutoff).get(),
])

const candidates = new Map()
for (const doc of createdSnapshot.docs) {
  const source = String(doc.get('source') || '')
  if (!['self_registration', 'free_account'].includes(source)) continue
  candidates.set(doc.id, { member: doc, reasons: new Set([source === 'free_account' ? 'New account created' : 'New membership registration']) })
}
for (const audit of auditSnapshot.docs) {
  const data = audit.data()
  if (data.entityType !== 'member') continue
  const reasonByAction = {
    'member.claim': 'Existing membership claimed',
    'member.self_register': 'New membership registration',
    'member.free_account.create': 'New account created',
    'member.create': 'New member added',
  }
  const reason = reasonByAction[data.action]
  if (!reason) continue
  const member = await db.collection('members').doc(String(data.entityId)).get()
  if (!member.exists) continue
  const existing = candidates.get(member.id) || { member, reasons: new Set() }
  existing.reasons.add(reason)
  candidates.set(member.id, existing)
}

const rows = [...candidates.values()]
  .map(({ member, reasons }) => {
    const data = member.data()
    return {
      id: member.id,
      memberNumber: data.memberNumber || '',
      name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      email: data.email || '',
      createdAt: data.createdAt?.toDate?.().toISOString() || null,
      claimed: Boolean(data.authUid),
      alreadyNeedsReview: data.needsReview === true,
      reason: [...reasons].join(' / '),
    }
  })
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))

console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', days, cutoff: cutoff.toDate().toISOString(), count: rows.length, members: summary ? rows.map(({ memberNumber, name, claimed, alreadyNeedsReview, reason }) => ({ memberNumber, name, claimed, alreadyNeedsReview, reason })) : rows }, null, 2))

if (apply && rows.length) {
  const batch = db.batch()
  for (const row of rows) {
    batch.update(db.collection('members').doc(row.id), {
      staffChecked: false,
      staffCheckedAt: null,
      staffCheckedBy: null,
      needsReview: true,
      reviewReason: row.reason,
      reviewRequestedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()
  console.log(`Marked ${rows.length} members as needing review.`)
}
