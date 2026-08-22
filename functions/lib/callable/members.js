import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { writeAudit } from '../shared/audit.js';
import { requireAdmin, requireStaff } from '../shared/auth.js';
import { getAuth } from 'firebase-admin/auth';
import { titleCaseName } from '../shared/text.js';
import { requiresGuardian, normaliseGuardianEmail, selectGuardian } from '../domain/teen.js';
const createSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().trim().email().max(200), phone: z.string().trim().max(40).optional(), membershipTypeId: z.string().trim().min(1).max(80) });
const updateSchema = z.object({ memberId: z.string().min(1), changes: z.object({ firstName: z.string().trim().min(1).max(80).optional(), lastName: z.string().trim().min(1).max(80).optional(), email: z.string().trim().email().max(200).optional(), phone: z.string().trim().max(40).optional() }).strict() });
const noteSchema = z.object({ memberId: z.string().min(1), body: z.string().trim().min(1).max(2000) });
function parse(schema, data) { const result = schema.safeParse(data); if (!result.success)
    throw new HttpsError('invalid-argument', 'The supplied member details are invalid.'); return result.data; }
const reviewLabels = { firstName: 'first name', lastName: 'last name', email: 'email', phone: 'phone', addressLine: 'address', postcode: 'postcode', dob: 'date of birth', nextOfKin: 'next of kin', parq: 'health questionnaire', medicalDetails: 'medical details' };
function reviewUpdate(reason) { return { staffChecked: false, staffCheckedAt: null, staffCheckedBy: null, needsReview: true, reviewReason: reason, reviewRequestedAt: FieldValue.serverTimestamp() }; }
export const createMember = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const input = parse(createSchema, request.data); const db = getFirestore(); const ref = db.collection('members').doc(); const memberNumber = `RYF-${Date.now().toString().slice(-6)}`; const firstName = titleCaseName(input.firstName), lastName = titleCaseName(input.lastName); const record = { ...input, firstName, lastName, email: input.email.toLowerCase(), memberNumber, membershipStatus: 'pending_payment', searchTokens: [firstName.toLowerCase(), lastName.toLowerCase(), input.email.toLowerCase(), memberNumber.toLowerCase()], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }; await ref.create(record); await writeAudit(request.auth.uid, 'member.create', 'member', ref.id, null, record); return { id: ref.id, memberNumber }; });
export const updateMember = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const input = parse(updateSchema, request.data); const ref = getFirestore().collection('members').doc(input.memberId); const snapshot = await ref.get(); if (!snapshot.exists)
    throw new HttpsError('not-found', 'Member not found.'); const changes = { ...input.changes, updatedAt: FieldValue.serverTimestamp() }; await ref.update(changes); await writeAudit(request.auth.uid, 'member.update', 'member', ref.id, snapshot.data(), changes); return { ok: true }; });
export const addMemberNote = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const input = parse(noteSchema, request.data); const memberRef = getFirestore().collection('members').doc(input.memberId); if (!(await memberRef.get()).exists)
    throw new HttpsError('not-found', 'Member not found.'); const ref = memberRef.collection('notes').doc(); await ref.create({ body: input.body, category: 'general', authorUid: request.auth.uid, createdAt: FieldValue.serverTimestamp() }); await writeAudit(request.auth.uid, 'member.note.create', 'member', input.memberId, null, { noteId: ref.id }); return { id: ref.id }; });
// Members can self-manage their own contact, address, next-of-kin and health (PAR-Q) details.
const selfProfileSchema = z.object({ memberId: z.string().min(1), changes: z.object({
        firstName: z.string().trim().min(1).max(80).optional(),
        lastName: z.string().trim().min(1).max(80).optional(),
        email: z.string().trim().email().max(200).optional(),
        phone: z.string().trim().max(40).optional(),
        addressLine: z.string().trim().max(200).optional(),
        postcode: z.string().trim().max(12).optional(),
        dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        nextOfKin: z.object({ name: z.string().trim().max(120), relationship: z.string().trim().max(60), phone: z.string().trim().max(40) }).optional(),
        parq: z.object({ q1: z.boolean(), q2: z.boolean(), q3: z.boolean(), q4: z.boolean(), q5: z.boolean(), q6: z.boolean(), q7: z.boolean() }).optional(),
        medicalDetails: z.string().trim().max(1000).optional(),
    }).strict() });
export const updateOwnProfile = onCall({ enforceAppCheck: true }, async (request) => { if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign-in is required.'); const input = parse(selfProfileSchema, request.data), ref = getFirestore().collection('members').doc(input.memberId), snapshot = await ref.get(); if (!snapshot.exists || snapshot.get('authUid') !== request.auth.uid)
    throw new HttpsError('permission-denied', 'You cannot edit this profile.'); const changes = Object.fromEntries(Object.entries(input.changes).filter(([, value]) => value !== undefined)); if (input.changes.firstName)
    changes.firstName = titleCaseName(input.changes.firstName); if (input.changes.lastName)
    changes.lastName = titleCaseName(input.changes.lastName); if (input.changes.firstName || input.changes.lastName) {
    const firstName = String(changes.firstName || snapshot.get('firstName') || ''), lastName = String(changes.lastName || snapshot.get('lastName') || ''), email = String(changes.email || snapshot.get('email') || '').toLowerCase(), memberNumber = String(snapshot.get('memberNumber') || '').toLowerCase();
    changes.searchTokens = [firstName.toLowerCase(), lastName.toLowerCase(), email, memberNumber];
    await getAuth().updateUser(request.auth.uid, { displayName: `${firstName} ${lastName}`.trim() });
} if (input.changes.parq)
    changes.medicalFlag = Object.values(input.changes.parq).some(Boolean); const changedFields = Object.keys(input.changes).map(key => reviewLabels[key] || key); const reason = `Profile updated: ${changedFields.join(', ')}`; await ref.update({ ...changes, ...reviewUpdate(reason), updatedAt: FieldValue.serverTimestamp() }); await writeAudit(request.auth.uid, 'member.profile.self_update', 'member', ref.id, null, changes); return { ok: true }; });
const dismissWelcomeSchema = z.object({ memberId: z.string().min(1) });
export const dismissAppWelcome = onCall({ enforceAppCheck: true }, async (request) => { if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign-in is required.'); const input = parse(dismissWelcomeSchema, request.data), ref = getFirestore().collection('members').doc(input.memberId), snapshot = await ref.get(); if (!snapshot.exists || snapshot.get('authUid') !== request.auth.uid)
    throw new HttpsError('permission-denied', 'You cannot update this account.'); await ref.update({ appWelcomeSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); return { ok: true }; });
const nokSchema = z.object({ name: z.string().trim().min(1).max(120), relationship: z.string().trim().min(1).max(60), phone: z.string().trim().min(1).max(40) });
const parqSchema = z.object({ q1: z.boolean(), q2: z.boolean(), q3: z.boolean(), q4: z.boolean(), q5: z.boolean(), q6: z.boolean(), q7: z.boolean() });
const registrationSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), phone: z.string().trim().min(1).max(40), dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), addressLine: z.string().trim().min(1).max(200), postcode: z.string().trim().min(1).max(12), membershipTypeId: z.string().min(1), nextOfKin: nokSchema, parq: parqSchema, medicalDetails: z.string().trim().max(1000).optional(), adultEmail: z.union([z.string().trim().email().max(200), z.literal('')]).optional(), termsAccepted: z.literal(true), marketingConsent: z.boolean() });
export const completeRegistration = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth)
        throw new HttpsError('unauthenticated', 'Sign-in is required.');
    const p = registrationSchema.safeParse(request.data);
    if (!p.success)
        throw new HttpsError('invalid-argument', 'Please complete all the required registration details.');
    const d = p.data, db = getFirestore();
    if (!(await db.collection('members').where('authUid', '==', request.auth.uid).limit(1).get()).empty)
        throw new HttpsError('already-exists', 'This account is already registered.');
    const typeSnap = await db.collection('membershipTypes').doc(d.membershipTypeId).get();
    if (!typeSnap.exists)
        throw new HttpsError('failed-precondition', 'Membership type is unavailable.');
    // Teen memberships must be linked to an active adult (gym/annual) member.
    let linkedAdultMemberId = null, guardianEmail = null;
    if (requiresGuardian(d.membershipTypeId, typeSnap.get('requiresAdult') === true)) {
        const adultEmail = normaliseGuardianEmail(d.adultEmail);
        if (!adultEmail)
            throw new HttpsError('failed-precondition', 'A teen membership must be linked to a parent or guardian who is already a member — please enter their email.');
        const candidates = await db.collection('members').where('email', '==', adultEmail).limit(10).get();
        const adult = selectGuardian(candidates.docs.map(doc => ({ id: doc.id, membershipTypeId: doc.get('membershipTypeId'), membershipStatus: doc.get('membershipStatus') })));
        if (!adult)
            throw new HttpsError('failed-precondition', 'We could not find an active adult gym membership with that email. A teen membership must be linked to a parent or guardian member.');
        linkedAdultMemberId = adult.id;
        guardianEmail = adultEmail;
    }
    const medicalFlag = Object.values(d.parq).some(Boolean);
    const firstName = titleCaseName(d.firstName), lastName = titleCaseName(d.lastName);
    const email = String(request.auth.token.email || '').toLowerCase();
    const memberRef = db.collection('members').doc(), counterRef = db.collection('counters').doc('members');
    let memberNumber = '';
    await db.runTransaction(async (transaction) => {
        const counter = await transaction.get(counterRef), next = Number(counter.get('next') || 1000) + 1;
        memberNumber = `RYF-${next}`;
        transaction.set(counterRef, { next }, { merge: true });
        transaction.create(memberRef, { authUid: request.auth.uid, memberNumber, firstName, lastName, email, phone: d.phone, dob: d.dob, addressLine: d.addressLine, postcode: d.postcode, membershipTypeId: d.membershipTypeId, membershipTypeName: typeSnap.get('name') || d.membershipTypeId, membershipStatus: 'pending_payment', nextOfKin: d.nextOfKin, parq: d.parq, medicalFlag, medicalDetails: medicalFlag ? (d.medicalDetails || '') : '', marketingConsent: d.marketingConsent, termsAcceptedAt: FieldValue.serverTimestamp(), ...reviewUpdate('New membership registration'), source: 'self_registration', ...(linkedAdultMemberId ? { linkedAdultMemberId, guardianEmail } : {}), searchTokens: [firstName.toLowerCase(), lastName.toLowerCase(), email, memberNumber.toLowerCase()], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    await getAuth().setCustomUserClaims(request.auth.uid, { role: 'member', memberId: memberRef.id });
    await writeAudit(request.auth.uid, 'member.self_register', 'member', memberRef.id, null, { memberNumber, membershipTypeId: d.membershipTypeId, medicalFlag, teen: !!linkedAdultMemberId });
    return { memberId: memberRef.id, memberNumber };
});
const claimSchema = z.object({ email: z.string().trim().email().max(200), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80) });
const freeAccountSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80) });
export const createFreeAccount = onCall({ enforceAppCheck: true }, async (request) => { if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign-in is required.'); const p = freeAccountSchema.safeParse(request.data); if (!p.success)
    throw new HttpsError('invalid-argument', 'Your first and last name are required.'); const db = getFirestore(); if (!(await db.collection('members').where('authUid', '==', request.auth.uid).limit(1).get()).empty)
    throw new HttpsError('already-exists', 'This account is already set up.'); const firstName = titleCaseName(p.data.firstName), lastName = titleCaseName(p.data.lastName), email = String(request.auth.token.email || '').toLowerCase(), memberRef = db.collection('members').doc(), counterRef = db.collection('counters').doc('members'); let memberNumber = ''; await db.runTransaction(async (transaction) => { const counter = await transaction.get(counterRef), next = Number(counter.get('next') || 1000) + 1; memberNumber = `RYF-${next}`; transaction.set(counterRef, { next }, { merge: true }); transaction.create(memberRef, { authUid: request.auth.uid, memberNumber, firstName, lastName, email, membershipTypeId: '', membershipTypeName: '', membershipStatus: 'none', classCredits: 0, ...reviewUpdate('New account created'), source: 'free_account', termsAcceptedAt: FieldValue.serverTimestamp(), searchTokens: [firstName.toLowerCase(), lastName.toLowerCase(), email, memberNumber.toLowerCase()], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); }); await getAuth().setCustomUserClaims(request.auth.uid, { role: 'member', memberId: memberRef.id }); await writeAudit(request.auth.uid, 'member.free_account.create', 'member', memberRef.id, null, { memberNumber }); return { memberId: memberRef.id, memberNumber }; });
const selectPlanSchema = z.object({ memberId: z.string().min(1), membershipTypeId: z.enum(['gym', 'gym_plus']) });
export const selectMembershipPlan = onCall({ enforceAppCheck: true }, async (request) => { if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign-in is required.'); const p = selectPlanSchema.safeParse(request.data); if (!p.success)
    throw new HttpsError('invalid-argument', 'Choose a valid membership.'); const db = getFirestore(), ref = db.collection('members').doc(p.data.memberId), [member, type] = await Promise.all([ref.get(), db.collection('membershipTypes').doc(p.data.membershipTypeId).get()]); if (!member.exists || member.get('authUid') !== request.auth.uid)
    throw new HttpsError('permission-denied', 'You cannot change this account.'); if (!['none', 'cancelled'].includes(String(member.get('membershipStatus') || 'none')))
    throw new HttpsError('failed-precondition', 'This account already has a membership.'); if (!type.exists || type.get('active') === false)
    throw new HttpsError('failed-precondition', 'That membership is unavailable.'); await ref.update({ membershipTypeId: p.data.membershipTypeId, membershipTypeName: type.get('name') || p.data.membershipTypeId, membershipStatus: 'pending_payment', ...reviewUpdate(`Membership selected: ${String(type.get('name') || p.data.membershipTypeId)}`), updatedAt: FieldValue.serverTimestamp() }); return { ok: true }; });
export const claimMembership = onCall({ enforceAppCheck: true }, async (request) => { if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign-in is required.'); const parsed = claimSchema.safeParse(request.data); if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Please provide the email and name we hold for you.'); const db = getFirestore(); if (!(await db.collection('members').where('authUid', '==', request.auth.uid).limit(1).get()).empty)
    throw new HttpsError('already-exists', 'Your account is already linked to a membership.'); const email = parsed.data.email.toLowerCase(), fn = parsed.data.firstName.trim().toLowerCase(), ln = parsed.data.lastName.trim().toLowerCase(); const candidates = await db.collection('members').where('email', '==', email).get(); const match = candidates.docs.find(d => !d.get('authUid') && String(d.get('firstName') || '').trim().toLowerCase() === fn && String(d.get('lastName') || '').trim().toLowerCase() === ln); if (!match)
    throw new HttpsError('not-found', 'We could not find an unclaimed membership matching those details. Please double-check, or contact the gym.'); await match.ref.update({ authUid: request.auth.uid, ...reviewUpdate('Existing membership claimed'), updatedAt: FieldValue.serverTimestamp() }); await getAuth().setCustomUserClaims(request.auth.uid, { role: 'member', memberId: match.id }); await writeAudit(request.auth.uid, 'member.claim', 'member', match.id, null, { email, memberNumber: match.get('memberNumber') }); return { memberId: match.id, memberNumber: match.get('memberNumber'), firstName: match.get('firstName'), lastName: match.get('lastName') }; });
const checkedSchema = z.object({ memberId: z.string().min(1), checked: z.boolean() });
export const setMemberChecked = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const p = checkedSchema.safeParse(request.data); if (!p.success)
    throw new HttpsError('invalid-argument', 'Invalid request.'); const ref = getFirestore().collection('members').doc(p.data.memberId); if (!(await ref.get()).exists)
    throw new HttpsError('not-found', 'Member not found.'); await ref.update({ staffChecked: p.data.checked, staffCheckedAt: p.data.checked ? FieldValue.serverTimestamp() : null, staffCheckedBy: p.data.checked ? request.auth.uid : null, needsReview: !p.data.checked, reviewReason: p.data.checked ? null : 'Manually marked for review', reviewRequestedAt: p.data.checked ? null : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); await writeAudit(request.auth.uid, 'member.staff_checked', 'member', ref.id, null, { checked: p.data.checked }); return { ok: true }; });
const linkSchema = z.object({ memberId: z.string().min(1), email: z.string().trim().email().max(200) });
export const linkMemberAccount = onCall({ enforceAppCheck: true }, async (request) => { requireAdmin(request); const p = linkSchema.safeParse(request.data); if (!p.success)
    throw new HttpsError('invalid-argument', 'Provide the member and the account email.'); const db = getFirestore(), ref = db.collection('members').doc(p.data.memberId); if (!(await ref.get()).exists)
    throw new HttpsError('not-found', 'Member not found.'); let user; try {
    user = await getAuth().getUserByEmail(p.data.email.toLowerCase());
}
catch {
    throw new HttpsError('not-found', 'No account exists with that email. Ask them to create an account first.');
} await ref.update({ authUid: user.uid, updatedAt: FieldValue.serverTimestamp() }); await getAuth().setCustomUserClaims(user.uid, { role: 'member', memberId: ref.id }); await writeAudit(request.auth.uid, 'member.link_account', 'member', ref.id, null, { email: p.data.email, linkedUid: user.uid }); return { ok: true }; });
// Staff confirm they've seen a cancellation — it stops being flagged and becomes a normal no-membership account.
const ackSchema = z.object({ memberId: z.string().min(1) });
export const acknowledgeCancellation = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const p = ackSchema.safeParse(request.data); if (!p.success)
    throw new HttpsError('invalid-argument', 'Invalid request.'); const ref = getFirestore().collection('members').doc(p.data.memberId); if (!(await ref.get()).exists)
    throw new HttpsError('not-found', 'Member not found.'); await ref.update({ cancellationAcknowledged: true, cancellationAcknowledgedAt: FieldValue.serverTimestamp(), cancellationAcknowledgedBy: request.auth.uid, needsReview: false, updatedAt: FieldValue.serverTimestamp() }); await writeAudit(request.auth.uid, 'member.cancellation.acknowledged', 'member', ref.id, null, {}); return { ok: true }; });
// Member (or staff on their behalf) records what they're here for and/or plans their first gym visit.
const journeySchema = z.object({ memberId: z.string().min(1), goal: z.enum(['weight_loss', 'muscle', 'fun', 'wellness']).optional(), firstVisitAt: z.string().datetime({ offset: true }).optional() }).refine(v => v.goal || v.firstVisitAt, { message: 'Nothing to save.' });
export const setMemberJourney = onCall({ enforceAppCheck: true }, async (request) => { if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign-in is required.'); const p = journeySchema.safeParse(request.data); if (!p.success)
    throw new HttpsError('invalid-argument', 'Invalid request.'); const ref = getFirestore().collection('members').doc(p.data.memberId), snapshot = await ref.get(); if (!snapshot.exists)
    throw new HttpsError('not-found', 'Member not found.'); const staff = ['staff', 'admin'].includes(String(request.auth.token.role)); if (snapshot.get('authUid') !== request.auth.uid && !staff)
    throw new HttpsError('permission-denied', 'You cannot edit this profile.'); const changes = { updatedAt: FieldValue.serverTimestamp() }; if (p.data.goal) {
    const previous = String(snapshot.get('goal') || ''), progress = snapshot.get('goalProgress');
    if (previous && previous !== p.data.goal && progress) {
        changes.goalHistory = FieldValue.arrayUnion({ goal: previous, progress, archivedAt: new Date().toISOString() });
        changes.goalProgress = FieldValue.delete();
    }
    changes.goal = p.data.goal;
    changes.goalSetAt = FieldValue.serverTimestamp();
} if (p.data.firstVisitAt)
    changes.firstVisitAt = Timestamp.fromDate(new Date(p.data.firstVisitAt)); await ref.update(changes); await writeAudit(request.auth.uid, 'member.journey.update', 'member', ref.id, null, { goal: p.data.goal || null, firstVisitAt: p.data.firstVisitAt || null }); return { ok: true }; });
const goalProgressSchema = z.object({ memberId: z.string().min(1), setup: z.object({ startValue: z.number().positive().max(1000).optional(), targetValue: z.number().positive().max(1000).optional(), unit: z.enum(['kg', 'reps', 'sessions', 'score']).optional(), focus: z.string().trim().max(120).optional(), weeklyTarget: z.number().int().min(1).max(14).optional() }).optional(), entry: z.object({ kind: z.enum(['weight', 'strength', 'activity', 'wellness']), value: z.number().min(0).max(1000).optional(), reps: z.number().int().min(1).max(1000).optional(), label: z.string().trim().min(1).max(120).optional(), rating: z.number().int().min(1).max(5).optional() }).optional() }).refine(v => v.setup || v.entry, { message: 'Nothing to save.' });
export const updateGoalProgress = onCall({ enforceAppCheck: true }, async (request) => { if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign-in is required.'); const p = goalProgressSchema.safeParse(request.data); if (!p.success)
    throw new HttpsError('invalid-argument', 'Goal progress details are invalid.'); const db = getFirestore(), ref = db.collection('members').doc(p.data.memberId); await db.runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists)
    throw new HttpsError('not-found', 'Member not found.'); const staff = ['staff', 'admin'].includes(String(request.auth.token.role)); if (snapshot.get('authUid') !== request.auth.uid && !staff)
    throw new HttpsError('permission-denied', 'You cannot update this goal.'); if (p.data.setup?.startValue && p.data.setup.targetValue) {
    const goal = String(snapshot.get('goal') || '');
    if (goal === 'weight_loss' && p.data.setup.targetValue >= p.data.setup.startValue)
        throw new HttpsError('invalid-argument', 'For weight loss, choose a target below your starting weight.');
    if (goal === 'muscle' && p.data.setup.targetValue <= p.data.setup.startValue)
        throw new HttpsError('invalid-argument', 'Choose a strength target above your starting weight.');
} const current = (snapshot.get('goalProgress') || {}), entries = Array.isArray(current.entries) ? current.entries.slice(-51) : [], now = Timestamp.now(), next = { ...current, ...(p.data.setup || {}), entries, updatedAt: now }; if (p.data.entry) {
    const entry = { ...p.data.entry, loggedAt: now };
    entries.push(entry);
    next.entries = entries;
    if (!current.startedAt)
        next.startedAt = now;
    next.lastEntryAt = now;
} transaction.update(ref, { goalProgress: next, updatedAt: FieldValue.serverTimestamp() }); }); await writeAudit(request.auth.uid, 'member.goal_progress.update', 'member', ref.id, null, { setup: !!p.data.setup, entryKind: p.data.entry?.kind || null }); return { ok: true }; });
// Staff gift (or dock) class credits — instantly reflected in the member's portal.
const creditSchema = z.object({ memberId: z.string().min(1), delta: z.number().int().min(-50).max(50) });
export const grantClassCredits = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const p = creditSchema.safeParse(request.data); if (!p.success || p.data.delta === 0)
    throw new HttpsError('invalid-argument', 'Choose how many credits to add.'); const db = getFirestore(), ref = db.collection('members').doc(p.data.memberId); const result = await db.runTransaction(async (transaction) => { const snap = await transaction.get(ref); if (!snap.exists)
    throw new HttpsError('not-found', 'Member not found.'); const current = Number(snap.get('classCredits') || 0), next = Math.max(0, Math.min(50, current + p.data.delta)); transaction.update(ref, { classCredits: next, updatedAt: FieldValue.serverTimestamp() }); return next; }); await writeAudit(request.auth.uid, 'member.credits.grant', 'member', ref.id, null, { delta: p.data.delta, classCredits: result }); return { classCredits: result }; });
import '../config.js';
