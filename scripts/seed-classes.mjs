// Seeds the Bookwhen class timetable + starting class credits.
// RUN THIS ONLY once the credits-aware backend is deployed (bookClass must deduct credits).
// Usage: node scripts/seed-classes.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { CLASS_DESCRIPTIONS } from './class-descriptions.mjs';

const key = JSON.parse(readFileSync('C:/Users/pwpt/Documents/Apps/ryfields-gym-app/.secrets/ryfields-gym-firebase-adminsdk-fbsvc-7671db904e.json', 'utf8'));
initializeApp({ credential: cert(key) });
const db = getFirestore();

// Recurring classes from bookwhen.com/ryfieldsgym (day: 0=Sun..6=Sat)
const TEMPLATES = [
  { id: 'fit-club-mon',      name: 'Fit Club (Group PT Style)',     dayOfWeek: 1, startTime: '18:00' },
  { id: 'dance-mania',       name: 'Dance Mania – Over 50s (ish)',  dayOfWeek: 2, startTime: '10:00' },
  { id: 'indoor-bootcamp',   name: 'Indoor Bootcamp',               dayOfWeek: 2, startTime: '18:00' },
  { id: 'line-dancing',      name: 'Line Dancing Weekly',           dayOfWeek: 2, startTime: '19:00' },
  { id: 'fit-club-wed',      name: 'Fit Club (Group PT Style)',     dayOfWeek: 3, startTime: '18:00' },
  { id: 'rhythm-resistance', name: 'Rhythm Resistance',             dayOfWeek: 3, startTime: '19:00' },
  { id: 'step',              name: 'Step',                          dayOfWeek: 4, startTime: '18:00' },
  { id: 'lbt',               name: 'LBT – Legs, Bums & Tums',       dayOfWeek: 4, startTime: '19:00' },
  { id: 'tabata',            name: 'Tabata',                        dayOfWeek: 6, startTime: '09:00' },
];
const DEFAULTS = { durationMinutes: 60, location: 'Ryfields Gym', instructorNames: ['Ryfields team'], defaultCapacity: 20, bookingOpenDays: 14, cancellationCutoffMinutes: 120, active: true };

// London-time helper (same logic as functions/src/scheduled/classes.ts)
function londonDateTime(dateKey, time) {
  let guess = Date.parse(`${dateKey}T${time}:00Z`);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const get = t => parts.find(p => p.type === t).value;
    guess += Date.parse(`${dateKey}T${time}:00Z`) - Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
  }
  return guess;
}
const dateKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// 1. Templates
for (const t of TEMPLATES) {
  const ref = db.collection('classTemplates').doc(t.id);
  if ((await ref.get()).exists) { console.log('template exists, skipping', t.id); continue }
  await ref.create({ ...DEFAULTS, name: t.name, description: CLASS_DESCRIPTIONS[t.name] || '', dayOfWeek: t.dayOfWeek, startTime: t.startTime, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  console.log('template created', t.id);
}

// 2. Sessions for the next 56 days (idempotent ids templateId_date)
const today = new Date(); today.setUTCHours(12, 0, 0, 0);
let created = 0;
for (const t of TEMPLATES) {
  for (let offset = 0; offset < 56; offset++) {
    const date = new Date(today); date.setUTCDate(today.getUTCDate() + offset);
    if (date.getUTCDay() !== t.dayOfWeek) continue;
    const k = dateKey(date), startsMs = londonDateTime(k, t.startTime);
    if (startsMs < Date.now()) continue;
    const ref = db.collection('classSessions').doc(`${t.id}_${k}`);
    if ((await ref.get()).exists) continue;
    await ref.create({
      templateId: t.id, nameSnapshot: t.name, descriptionSnapshot: CLASS_DESCRIPTIONS[t.name] || '', startsAt: Timestamp.fromMillis(startsMs),
      endsAt: Timestamp.fromMillis(startsMs + DEFAULTS.durationMinutes * 60000),
      locationSnapshot: DEFAULTS.location, instructorNames: DEFAULTS.instructorNames,
      capacity: DEFAULTS.defaultCapacity, bookedCount: 0, waitlistCount: 0, status: 'scheduled',
      bookingOpensAt: Timestamp.fromMillis(startsMs - DEFAULTS.bookingOpenDays * 86400000),
      bookingClosesAt: Timestamp.fromMillis(startsMs),
      cancellationCutoffAt: Timestamp.fromMillis(startsMs - DEFAULTS.cancellationCutoffMinutes * 60000),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    created++;
  }
}
console.log('sessions created:', created);

// 3. One-off: MEGA Line Dancing Party, Sat 1 Aug 2026 6:30pm @ Ryfields Village Hall
const partyRef = db.collection('classSessions').doc('mega-line-dancing-party_2026-08-01');
if (!(await partyRef.get()).exists) {
  const startsMs = londonDateTime('2026-08-01', '18:30');
  await partyRef.create({
    templateId: null, nameSnapshot: 'MEGA Line Dancing Party', startsAt: Timestamp.fromMillis(startsMs),
    endsAt: Timestamp.fromMillis(startsMs + 150 * 60000),
    locationSnapshot: 'Ryfields Village Hall', instructorNames: ['Ryfields team'],
    capacity: 60, bookedCount: 0, waitlistCount: 0, status: 'scheduled',
    bookingOpensAt: Timestamp.fromMillis(Date.now() - 60000),
    bookingClosesAt: Timestamp.fromMillis(startsMs),
    cancellationCutoffAt: Timestamp.fromMillis(startsMs - 120 * 60000),
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  console.log('party session created');
} else console.log('party already exists');

// 4. Starting credit: 1 for weekly_class members who are active/payment_failed and have no credits yet
const types = await db.collection('membershipTypes').where('classAccessPolicy', '==', 'weekly_class').get();
const weeklyIds = new Set(types.docs.map(d => d.id));
const members = await db.collection('members').where('membershipStatus', 'in', ['active', 'payment_failed']).get();
let batch = db.batch(), credited = 0;
for (const doc of members.docs) {
  if (!weeklyIds.has(String(doc.get('membershipTypeId') || ''))) continue;
  if (doc.get('classCredits') != null) continue;
  batch.update(doc.ref, { classCredits: 1, updatedAt: FieldValue.serverTimestamp() });
  credited++;
}
if (credited) await batch.commit();
console.log('members given starting credit:', credited);
