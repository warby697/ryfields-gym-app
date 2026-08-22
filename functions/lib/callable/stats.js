import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
// Live gym occupancy for the member portal (members can't read others' visits directly).
export const gymOccupancy = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth)
        throw new HttpsError('unauthenticated', 'Sign-in is required.');
    const db = getFirestore(), now = Date.now(), start = new Date();
    start.setHours(0, 0, 0, 0);
    const [open, today] = await Promise.all([
        db.collection('visits').where('checkedOutAt', '==', null).get(),
        db.collection('visits').where('checkedInAt', '>=', Timestamp.fromDate(start)).get(),
    ]);
    // Members who came only for a class aren't on the gym floor, so they don't
    // count here. Visits recorded before this field existed still count.
    const onFloor = (d) => d.get('countsTowardOccupancy') !== false;
    const inNow = open.docs.filter(d => { const due = d.get('scheduledCheckoutAt'); return onFloor(d) && due && due.toMillis() > now; }).length;
    return { now: inNow, today: today.docs.filter(onFloor).length };
});
import '../config.js';
