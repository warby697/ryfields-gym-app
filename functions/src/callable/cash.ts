import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { writeAudit } from '../shared/audit.js'
import { requireAdmin, requireStaff } from '../shared/auth.js'

// Advance a date by n months, clamping to month-end (e.g. 31 Jan + 1m = 28/29 Feb).
function addMonths(date: Date, n: number): Date {
  const d = new Date(date); const day = d.getDate()
  d.setMonth(d.getMonth() + n)
  if (d.getDate() < day) d.setDate(0)
  return d
}
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw new HttpsError('invalid-argument', 'The supplied cash-payment details are invalid.')
  return result.data
}
const gbp = (minor: number) => `£${(minor / 100).toFixed(2)}`
const asDate = (v: unknown): Date | null => v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null

// Staff sets up (or edits) a member's cash billing schedule.
const scheduleSchema = z.object({
  memberId: z.string().min(1),
  amountMinor: z.number().int().min(0).max(100000),
  nextDueAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  intervalMonths: z.number().int().min(1).max(12).optional(),
})
export const setCashSchedule = onCall({ enforceAppCheck: true }, async request => {
  requireAdmin(request) // cash memberships are set up by admins only — a very limited few
  const input = parse(scheduleSchema, request.data)
  const ref = getFirestore().collection('members').doc(input.memberId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Member not found.')
  const nextDue = new Date(input.nextDueAt)
  if (Number.isNaN(nextDue.getTime())) throw new HttpsError('invalid-argument', 'The next due date is invalid.')
  const existing = snap.get('cashSchedule') || {}
  const cashSchedule = {
    ...existing,
    amountMinor: input.amountMinor,
    intervalMonths: input.intervalMonths ?? existing.intervalMonths ?? 1,
    nextDueAt: Timestamp.fromDate(nextDue),
    active: true,
  }
  await ref.update({ cashSchedule, paymentProvider: 'cash', updatedAt: FieldValue.serverTimestamp() })
  await writeAudit(request.auth!.uid, 'member.cash.schedule', 'member', ref.id, snap.get('cashSchedule') || null, cashSchedule)
  return { ok: true }
})

// Staff records a cash payment: logs it in `payments` and rolls the due date forward.
const recordSchema = z.object({
  memberId: z.string().min(1),
  amountMinor: z.number().int().min(0).max(100000).optional(),
  paidAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
})
export const recordCashPayment = onCall({ enforceAppCheck: true }, async request => {
  requireStaff(request)
  const input = parse(recordSchema, request.data)
  const db = getFirestore()
  const ref = db.collection('members').doc(input.memberId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Member not found.')
  const schedule = snap.get('cashSchedule') || {}
  const amountMinor = input.amountMinor ?? schedule.amountMinor
  if (typeof amountMinor !== 'number') throw new HttpsError('failed-precondition', 'Set a cash amount for this member first.')
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date()
  if (Number.isNaN(paidAt.getTime())) throw new HttpsError('invalid-argument', 'The payment date is invalid.')
  const interval = schedule.intervalMonths ?? 1
  const base = asDate(schedule.nextDueAt) ?? paidAt
  const nextDueAt = addMonths(base, interval)
  const memberName = `${snap.get('firstName') || ''} ${snap.get('lastName') || ''}`.trim()

  const paymentRef = db.collection('payments').doc()
  const period = `${paidAt.getFullYear()}${String(paidAt.getMonth() + 1).padStart(2, '0')}`
  const payment = {
    memberId: ref.id, memberName,
    amountMinor, currency: 'GBP',
    status: 'confirmed', method: 'cash',
    chargeDate: paidAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    paidAt: Timestamp.fromDate(paidAt),
    providerPaymentId: `CASH-${snap.get('memberNumber') || ref.id}-${period}`,
    recordedBy: request.auth!.uid,
    createdAt: FieldValue.serverTimestamp(),
  }
  await paymentRef.create(payment)
  const cashSchedule = {
    ...schedule,
    amountMinor,
    intervalMonths: interval,
    nextDueAt: Timestamp.fromDate(nextDueAt),
    lastPaidAt: Timestamp.fromDate(paidAt),
    lastAmountMinor: amountMinor,
    active: true,
  }
  await ref.update({ cashSchedule, paymentProvider: 'cash', updatedAt: FieldValue.serverTimestamp() })
  await writeAudit(request.auth!.uid, 'member.cash.payment', 'member', ref.id, null, { paymentId: paymentRef.id, amountMinor, paidAt: payment.chargeDate, nextDue: nextDueAt.toISOString() })
  return { ok: true, amount: gbp(amountMinor), nextDueAt: nextDueAt.toISOString() }
})
import '../config.js'
