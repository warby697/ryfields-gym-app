// Sets the long-standing £32.50 Gym Plus rate on the five members confirmed by
// the owner (2026-08-17). Guarded: refuses unless the member is still gym_plus
// with no numeric priceMinor already set. Run with `apply` to write.
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) })
const db = getFirestore(), apply = process.argv.includes('apply'), RATE = 3250
const ids = ['BD5a6NTCq2iZFMP0KqBt','CzPt2rSZceUZMuGq9paA','DCCCWz6t3RZjt3F7E1JB','pCImKdVRk1bqXHMiadw1','qedLDErbPy7FvvCqdsIa']
for (const id of ids) {
  const ref = db.collection('members').doc(id), snap = await ref.get()
  const name = `${snap.get('firstName')} ${snap.get('lastName')}`, type = String(snap.get('membershipTypeId') || ''), own = snap.get('priceMinor')
  if (type !== 'gym_plus') { console.log(`SKIP ${name}: plan is "${type}", not gym_plus`); continue }
  if (typeof own === 'number') { console.log(`SKIP ${name}: already has an override of £${own / 100}`); continue }
  if (!apply) { console.log(`WOULD SET ${name.padEnd(22)} ${JSON.stringify(own)} -> £${RATE / 100}`); continue }
  await ref.update({ priceMinor: RATE, updatedAt: FieldValue.serverTimestamp() })
  console.log(`SET ${name.padEnd(22)} ${JSON.stringify(own)} -> £${RATE / 100}`)
}
console.log(apply ? '\nDone.' : '\nPreview only. Re-run with `apply` to write.')
