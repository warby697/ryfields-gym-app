// App-launch email: queues into emailOutbox, which the email-dispatch cron sends
// via Resend within a minute. Same pipeline as ticket confirmations.
//
//   node scripts/send-app-launch.mjs --to=someone@example.com --name=Paul        (preview)
//   node scripts/send-app-launch.mjs --to=someone@example.com --name=Paul apply  (send)
//   node scripts/send-app-launch.mjs --plan=gym_plus --limit=25                  (preview a wave)
//   node scripts/send-app-launch.mjs --plan=gym --limit=25 apply                 (send a wave)
//
// A wave only ever includes live members who have an email and have NOT yet
// claimed an app account, and never anyone already emailed on a previous wave.
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const SUBJECT = 'Ryfields Gym - now in your pocket! 💪'

// Blank lines separate paragraphs. Single line breaks are ignored by the email
// builder, so every line that must stand alone gets its own blank line.
const MESSAGE = `Not sure if you've seen, but we've got a new app - and it's built to help you get more out of your membership.

No app store, no download. It opens in your browser and sits on your home screen in about a minute.

Book a class in two taps.
See what's on this week.
Check your membership and payments.
Grab tickets for whatever's coming up.

First up: the MEGA Line Dancing Party, Saturday 19 September at Ryfields Village Hall.

It's also your way in now. Scan the code on the screen at the entrance and you're checked in. No fob, no waiting about.

And it quietly keeps score for you. Every check-in goes on your record, so you can see how your month is shaping up - and if you drift off the wagon a bit, we will give you a friendly nudge to get you back at it. No judgement, we have all been there.

To get set up: go to app.ryfieldsgym.com, create your account, then choose "I'm already a member" and it'll find your membership.

That's it. If it plays up, collar one of us and we'll sort it out with you.`

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || ''
const apply = process.argv.includes('apply')
const CAMPAIGN = 'app-launch-2026-08'

initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) })
const db = getFirestore()

const queue = async (to, firstName, key) => {
  const id = `${CAMPAIGN}-${key}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  await db.collection('emailOutbox').doc(id).create({
    kind: 'urgent_notice', to: to.toLowerCase(), firstName,
    variables: { subject: SUBJECT, message: MESSAGE }, signoff: 'Paul & Becky',
    campaign: CAMPAIGN, status: 'queued', attempts: 0,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }).catch(error => {
    if (String(error.code) === '6') { console.log(`  SKIP ${to} — already queued on an earlier wave`); return }
    throw error
  })
}

const to = arg('to')
if (to) {
  const name = arg('name') || 'there'
  console.log(`TEST -> ${to} (as "${name}")\n`)
  console.log(`Subject: ${SUBJECT}\n`)
  console.log(`Hi ${name},\n\n${MESSAGE}\n\nPaul & Becky\n`)
  if (!apply) { console.log('Preview only. Add `apply` to actually send.'); process.exit(0) }
  await queue(to, name, `test-${Date.now()}`)
  console.log('Queued. The dispatch cron sends within about a minute.')
  process.exit(0)
}

const plan = arg('plan'), limit = Number(arg('limit') || 25)
if (!plan) { console.error('Give me --to=<email> for a test, or --plan=<gym|gym_plus|annual|teen> for a wave.'); process.exit(1) }
const live = (await db.collection('members').get()).docs.filter(m =>
  ['active', 'payment_failed', 'pending_payment'].includes(String(m.get('membershipStatus') || '')) &&
  String(m.get('membershipTypeId') || '') === plan &&
  String(m.get('email') || '').trim() && !m.get('authUid'))
// One email per address across the WHOLE campaign, not just this wave: several
// households share an inbox, and their members often sit on different plans, so
// a per-wave check alone would still mail the same inbox twice.
const alreadySent = await db.collection('emailOutbox').where('campaign', '==', CAMPAIGN).get()
const seen = new Set(alreadySent.docs.map(d => String(d.get('to') || '').toLowerCase()))
const wave = []
for (const m of live) {
  const email = String(m.get('email')).toLowerCase()
  if (seen.has(email)) { console.log(`  (skipping ${m.get('firstName')} ${m.get('lastName')} — ${email} already in this wave)`); continue }
  seen.add(email); wave.push(m)
  if (wave.length >= limit) break
}
console.log(`\nplan=${plan}  eligible=${live.length}  this wave=${wave.length}\n`)
for (const m of wave) console.log(`  ${String(m.get('firstName') + ' ' + m.get('lastName')).padEnd(24)} ${m.get('email')}`)
if (!apply) { console.log('\nPreview only. Add `apply` to send this wave.'); process.exit(0) }
for (const m of wave) await queue(String(m.get('email')), String(m.get('firstName') || 'there'), m.id)
console.log(`\nQueued ${wave.length}. Re-running later skips anyone already sent.`)
