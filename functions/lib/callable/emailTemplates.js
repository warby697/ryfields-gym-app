import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { requireStaff } from '../shared/auth.js';
import { writeAudit } from '../shared/audit.js';
import { emailHtml, fillTemplate, ryfieldsResetLink, sendEmail } from '../shared/email.js';
import { queueEmail } from '../shared/emailOutbox.js';
const saveSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/).max(80), name: z.string().trim().min(2).max(100), category: z.enum(['password_reset', 'general']), subject: z.string().trim().min(2).max(180), body: z.string().trim().min(10).max(8000) });
export const saveEmailTemplate = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const parsed = saveSchema.safeParse(request.data); if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Email template details are invalid.'); const ref = getFirestore().collection('emailTemplates').doc(parsed.data.id), before = await ref.get(); await ref.set({ ...parsed.data, updatedAt: FieldValue.serverTimestamp(), updatedByUid: request.auth.uid, ...(before.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true }); await writeAudit(request.auth.uid, 'email_template.save', 'emailTemplate', ref.id, before.data() || null, { name: parsed.data.name, category: parsed.data.category }); return { ok: true }; });
const sendSchema = z.object({ templateId: z.string().min(1).max(80), email: z.string().trim().email().max(200), firstName: z.string().trim().max(80).optional() });
export const sendTemplateEmail = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const parsed = sendSchema.safeParse(request.data); if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Recipient details are invalid.'); const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM; if (!apiKey || !from)
    throw new HttpsError('failed-precondition', 'Email sending is not configured.'); const db = getFirestore(), snapshot = await db.collection('emailTemplates').doc(parsed.data.templateId).get(); if (!snapshot.exists)
    throw new HttpsError('not-found', 'Email template not found.'); const template = snapshot.data(), email = parsed.data.email.toLowerCase(), member = await db.collection('members').where('email', '==', email).limit(1).get(), firstName = parsed.data.firstName || String(member.docs[0]?.get('firstName') || 'there'), baseUrl = process.env.APP_BASE_URL || 'https://ryfields-gym.netlify.app', variables = { firstName, resetLink: '' }; if (template.category === 'password_reset') {
    try {
        await getAuth().getUserByEmail(email);
        const firebaseLink = await getAuth().generatePasswordResetLink(email, { url: `${baseUrl}/login` });
        variables.resetLink = ryfieldsResetLink(firebaseLink, baseUrl);
    }
    catch {
        throw new HttpsError('not-found', 'No login account exists for that email address.');
    }
} const subject = fillTemplate(template.subject, variables), text = fillTemplate(template.body, variables), result = await sendEmail({ to: email, from, apiKey, subject, text, html: emailHtml(template.body, variables) }); await writeAudit(request.auth.uid, 'email_template.send', 'emailTemplate', snapshot.id, null, { recipient: email, providerMessageId: result.id }); return { ok: true }; });
const broadcastSchema = z.object({ subject: z.string().trim().min(3).max(180), message: z.string().trim().min(10).max(4000), audience: z.enum(['active_members', 'all_accounts']).default('active_members') });
export const queueUrgentBroadcast = onCall({ enforceAppCheck: true }, async (request) => { requireStaff(request); const parsed = broadcastSchema.safeParse(request.data); if (!parsed.success)
    throw new HttpsError('invalid-argument', 'Broadcast details are invalid.'); const db = getFirestore(), snapshot = await db.collection('members').get(), members = snapshot.docs.filter(member => String(member.get('email') || '') && (parsed.data.audience === 'all_accounts' || ['active', 'payment_failed'].includes(String(member.get('membershipStatus'))))); if (members.length > 1000)
    throw new HttpsError('resource-exhausted', 'This broadcast is too large to queue in one go.'); const broadcastId = db.collection('emailBroadcasts').doc().id; await Promise.all(members.map(member => queueEmail(db, `broadcast-${broadcastId}-${member.id}`, { kind: 'urgent_notice', to: String(member.get('email')), firstName: String(member.get('firstName') || ''), variables: { subject: parsed.data.subject, message: parsed.data.message }, signoff: 'Paul & Becky' }))); await db.collection('emailBroadcasts').doc(broadcastId).set({ ...parsed.data, recipientCount: members.length, status: 'queued', createdByUid: request.auth.uid, createdAt: FieldValue.serverTimestamp() }); await writeAudit(request.auth.uid, 'email.broadcast.queue', 'emailBroadcast', broadcastId, null, { recipientCount: members.length, audience: parsed.data.audience }); return { queued: members.length, broadcastId }; });
import '../config.js';
