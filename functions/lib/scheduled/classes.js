import '../config.js';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
function londonDateTime(dateKey, time) {
    let guess = Date.parse(`${dateKey}T${time}:00Z`);
    for (let i = 0; i < 2; i++) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date(guess));
        const get = (type) => parts.find((part) => part.type === type).value;
        const rendered = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
        guess += Date.parse(`${dateKey}T${time}:00Z`) - rendered;
    }
    return guess;
}
const dateKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
export const generateClassSessions = onSchedule({ schedule: 'every day 01:15', timeZone: 'Europe/London' }, async () => {
    const db = getFirestore();
    const templates = await db.collection('classTemplates').where('active', '==', true).get();
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const candidates = [];
    for (const templateDoc of templates.docs) {
        const template = templateDoc.data();
        for (let offset = 0; offset < 21; offset++) {
            const date = new Date(today);
            date.setUTCDate(today.getUTCDate() + offset);
            if (date.getUTCDay() !== template.dayOfWeek)
                continue;
            const key = dateKey(date);
            const startsMs = londonDateTime(key, template.startTime);
            const startsAt = Timestamp.fromMillis(startsMs);
            candidates.push({
                ref: db.collection('classSessions').doc(`${templateDoc.id}_${key}`),
                data: {
                    templateId: templateDoc.id,
                    nameSnapshot: template.name,
                    descriptionSnapshot: template.description || '',
                    startsAt,
                    endsAt: Timestamp.fromMillis(startsMs + template.durationMinutes * 60_000),
                    locationSnapshot: template.location,
                    instructorNames: template.instructorNames,
                    capacity: template.defaultCapacity,
                    bookedCount: 0,
                    waitlistCount: 0,
                    status: 'scheduled',
                    bookingOpensAt: Timestamp.fromMillis(startsMs - template.bookingOpenDays * 86_400_000),
                    bookingClosesAt: startsAt,
                    cancellationCutoffAt: Timestamp.fromMillis(startsMs - template.cancellationCutoffMinutes * 60_000),
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                },
            });
        }
    }
    if (!candidates.length)
        return;
    const existing = await db.getAll(...candidates.map(({ ref }) => ref));
    const batch = db.batch();
    let writes = 0;
    existing.forEach((snapshot, index) => {
        const candidate = candidates[index];
        if (candidate && !snapshot.exists && writes < 450) {
            batch.create(candidate.ref, candidate.data);
            writes++;
        }
    });
    if (writes)
        await batch.commit();
});
