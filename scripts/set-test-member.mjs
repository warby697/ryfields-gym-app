// Flips the Tessa Tickle test record between check-in scenarios.
// Also clears the things that would otherwise make the NEXT scan fail for the
// wrong reason: the per-member single use of the current QR, and any open visit.
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) })
const db = getFirestore(), ID = '95BuNtjWb1tb7KIa5h1J', scenario = process.argv[2] || 'status'

async function clearBlockers(){
  const uses = await db.collectionGroup('uses').get().catch(()=>({docs:[]}))
  let cleared = 0
  for (const u of uses.docs) if (u.id === ID) { await u.ref.delete(); cleared++ }
  const open = await db.collection('visits').where('memberId','==',ID).get()
  let closed = 0
  for (const v of open.docs) { await v.ref.delete(); closed++ }
  const passes = await db.collection('dayPasses').where('purchasedByMemberId','==',ID).get()
  for (const p of passes.docs) await p.ref.delete()
  return { cleared, closed }
}

const set = data => db.collection('members').doc(ID).update({ ...data, updatedAt: FieldValue.serverTimestamp() })

const scenarios = {
  active:   () => set({ membershipStatus:'active', membershipTypeId:'gym', membershipTypeName:'Gym Membership' }),
  failed:   () => set({ membershipStatus:'payment_failed' }),
  pending:  () => set({ membershipStatus:'pending_payment' }),
  cancelled:() => set({ membershipStatus:'cancelled' }),
  none:     () => set({ membershipStatus:'none', membershipTypeId:'', membershipTypeName:'', classCredits:0 }),
  classpass:() => set({ membershipStatus:'none', membershipTypeId:'', classCredits:3 }),
  daypass:  async () => { await set({ membershipStatus:'none', membershipTypeId:'', classCredits:0 })
    await db.collection('dayPasses').doc(`test-${Date.now()}`).set({ purchasedByMemberId:ID, productId:'day', status:'available', provider:'test', createdAt:FieldValue.serverTimestamp() }) },
  classbooked: async () => { await set({ membershipStatus:'none', membershipTypeId:'', classCredits:0 })
    const startsAt = Timestamp.fromMillis(Date.now() + 20*60_000)
    const ref = db.collection('classSessions').doc('TEST-checkin-session')
    await ref.set({ nameSnapshot:'Test Class', locationSnapshot:'Ryfields Gym', instructorNames:['Becky'], startsAt,
      endsAt: Timestamp.fromMillis(Date.now()+80*60_000), capacity:20, bookedCount:1, waitlistCount:0, status:'scheduled',
      bookingOpensAt: Timestamp.now(), bookingClosesAt: startsAt, cancellationCutoffAt: startsAt,
      createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() })
    await ref.collection('bookings').doc(ID).set({ memberId:ID, memberName:'Tessa Tickle', status:'confirmed', usedCredit:false, bookedAt:FieldValue.serverTimestamp() }) },
  restore:  async () => { await set({ membershipStatus:'cancelled', membershipTypeId:'gym', membershipTypeName:'Gym Membership', classCredits:1 })
    await db.collection('classSessions').doc('TEST-checkin-session').delete().catch(()=>{}) },
}

if (scenario !== 'status') {
  const run = scenarios[scenario]
  if (!run) { console.error(`Unknown scenario. Options: ${Object.keys(scenarios).join(', ')}`); process.exit(1) }
  await run()
}
const { cleared, closed } = await clearBlockers()
if (scenario === 'daypass') await scenarios.daypass()          // re-add, clearBlockers wipes passes
if (scenario === 'classbooked') await scenarios.classbooked()  // re-add booking after visit wipe
const m = await db.collection('members').doc(ID).get()
const passes = await db.collection('dayPasses').where('purchasedByMemberId','==',ID).get()
console.log(`Tessa is now: status=${m.get('membershipStatus')} plan="${m.get('membershipTypeId')}" credits=${m.get('classCredits')} dayPasses=${passes.size}`)
console.log(`cleared: ${cleared} used-code marker(s), ${closed} open visit(s) — she can scan again now`)
