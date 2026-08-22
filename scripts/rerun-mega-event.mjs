// Re-runs the MEGA Line Dancing Party on Sat 19 Sep 2026, 18:30-21:30 (BST).
// Creates a NEW session and re-points the existing event at it. The 1 Aug
// session and its bookings are left completely untouched as the historical record.
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) })
const db = getFirestore(), apply = process.argv.includes('apply')
const EVENT_ID = 'HA9YIOldgmvt3Ib22NPZ', OLD = 'mega-line-dancing-party_2026-08-01', NEW = 'mega-line-dancing-party_2026-09-19'
// 18:30-21:30 British Summer Time = 17:30-20:30 UTC.
const startsAt = Timestamp.fromDate(new Date('2026-09-19T17:30:00.000Z'))
const endsAt = Timestamp.fromDate(new Date('2026-09-19T20:30:00.000Z'))

const [event, old, target] = await Promise.all([
  db.collection('events').doc(EVENT_ID).get(), db.collection('classSessions').doc(OLD).get(), db.collection('classSessions').doc(NEW).get(),
])
if (!event.exists) throw new Error('Event not found — aborting.')
if (!old.exists) throw new Error('Original session not found — aborting.')
if (target.exists) throw new Error(`${NEW} already exists — aborting rather than overwriting.`)
if (event.get('sessionId') !== OLD) throw new Error(`Event points at ${event.get('sessionId')}, not ${OLD} — aborting.`)

const session = {
  nameSnapshot: old.get('nameSnapshot'), locationSnapshot: old.get('locationSnapshot'),
  instructorNames: old.get('instructorNames'), templateId: null,
  startsAt, endsAt,
  bookingOpensAt: Timestamp.now(),                                        // on sale immediately
  bookingClosesAt: startsAt,
  cancellationCutoffAt: Timestamp.fromMillis(startsAt.toMillis() - 2 * 3600_000), // same 2h cutoff as before
  capacity: Number(event.get('maxTickets') || old.get('capacity') || 60),
  bookedCount: 0, waitlistCount: 0, status: 'scheduled',
  creditExempt: true, eventId: EVENT_ID,
  eventTicketPriceMinor: Number(event.get('ticketPriceMinor') || 0),
}
const uk = d => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
console.log(`Event      : ${event.get('title')}`)
console.log(`New session: ${NEW}`)
console.log(`  ${uk(startsAt.toDate())} to ${uk(endsAt.toDate())} (UK time)`)
console.log(`  venue ${JSON.stringify(session.locationSnapshot)} | capacity ${session.capacity} | ticket £${session.eventTicketPriceMinor / 100}`)
console.log(`Old session ${OLD} (${old.get('bookedCount')} booked) left untouched.`)
console.log(`Display window unchanged: startsOn=${event.get('startsOn')} endsOn=${event.get('endsOn')}`)
if (!apply) { console.log('\nPreview only. Re-run with `apply` to write.'); process.exit(0) }
await db.collection('classSessions').doc(NEW).create({ ...session, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
await db.collection('events').doc(EVENT_ID).update({ sessionId: NEW, sessionStartsAt: startsAt, updatedAt: FieldValue.serverTimestamp() })
console.log('\nDone — session created and event re-pointed.')
