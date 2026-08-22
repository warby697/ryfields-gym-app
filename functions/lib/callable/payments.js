import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { appBaseUrl, goCardlessAccessToken, goCardlessRequest } from '../services/gocardless.js';
const schema = z.object({ memberId: z.string().min(1) });
export const startPaymentSetup = onCall({ enforceAppCheck: true, secrets: [goCardlessAccessToken] }, async (request) => {
    if (!request.auth)
        throw new HttpsError('unauthenticated', 'Sign-in is required.');
    const parsed = schema.safeParse(request.data);
    if (!parsed.success)
        throw new HttpsError('invalid-argument', 'Member is required.');
    const db = getFirestore(), memberRef = db.collection('members').doc(parsed.data.memberId), memberSnap = await memberRef.get();
    if (!memberSnap.exists)
        throw new HttpsError('not-found', 'Member not found.');
    const member = memberSnap.data();
    const role = request.auth.token.role;
    if (member.authUid !== request.auth.uid && !['staff', 'admin'].includes(String(role)))
        throw new HttpsError('permission-denied', 'You cannot set up payments for this member.');
    if (member.membershipStatus !== 'pending_payment')
        throw new HttpsError('failed-precondition', 'This membership is not awaiting payment setup.');
    const typeSnap = await db.collection('membershipTypes').doc(member.membershipTypeId).get();
    if (!typeSnap.exists)
        throw new HttpsError('failed-precondition', 'Membership type not found.');
    const type = typeSnap.data();
    const idempotencyKey = `member-${memberRef.id}-initial-v1`;
    const billing = await goCardlessRequest('/billing_requests', { method: 'POST', idempotencyKey, body: { billing_requests: { payment_request: { description: `${type.name} first payment`, amount: type.priceMinor, currency: 'GBP', scheme: 'faster_payments' }, mandate_request: { scheme: 'bacs' }, metadata: { member_id: memberRef.id, membership_type_id: member.membershipTypeId } } } });
    const flow = await goCardlessRequest('/billing_request_flows', { method: 'POST', idempotencyKey: `${idempotencyKey}-flow`, body: { billing_request_flows: { redirect_uri: `${appBaseUrl.value()}/payment/return`, exit_uri: `${appBaseUrl.value()}/payments`, links: { billing_request: billing.id } } } });
    await memberRef.update({ gocardlessBillingRequestId: billing.id, paymentSetupStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { authorisationUrl: flow.authorisation_url, billingRequestId: billing.id };
});
import '../config.js';
