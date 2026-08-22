import { AlertTriangle, Banknote, CheckCircle2, Clock3, Search } from 'lucide-react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db, firebaseConfigured } from '../../lib/firebase'
import { recordCashPayment, subscribeToMembers, toDate } from '../members/memberService'
import type { Member } from '../members/types'

function CashDueList() {
  const [members, setMembers] = useState<Member[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => subscribeToMembers(setMembers, () => {}), [])
  const soon = Date.now() + 3 * 864e5
  const due = members
    .map(m => ({ m, due: toDate(m.cashSchedule?.nextDueAt) }))
    .filter((x): x is { m: Member; due: Date } => !!x.due && x.due.getTime() <= soon)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
  if (!due.length) return null
  async function record(m: Member) {
    setBusy(m.id); setMsg('')
    try { await recordCashPayment(m.id); setMsg(`Recorded ${m.firstName} ${m.lastName}.`) }
    catch { setMsg('Could not record that payment.') } finally { setBusy(null) }
  }
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d)
  return <article className="panel cash-due">
    <p className="eyebrow"><Banknote size={14} /> Cash due</p>
    <h2>Cash payments to collect</h2>
    {msg && <div className="notice" role="status">{msg}</div>}
    <div className="cash-due-list">
      {due.map(({ m, due }) => {
        const overdue = due.getTime() < Date.now()
        return <div className={`cash-due-row${overdue ? ' overdue' : ''}`} key={m.id}>
          <span><strong>{m.firstName} {m.lastName}</strong><small>£{((m.cashSchedule!.amountMinor) / 100).toFixed(2)} · {overdue ? 'overdue' : 'due'} {fmt(due)}</small></span>
          <button className="primary" disabled={busy === m.id} onClick={() => record(m)}>{busy === m.id ? 'Saving…' : 'Mark paid'}</button>
        </div>
      })}
    </div>
  </article>
}

type Payment = {
  id: string
  memberName: string
  memberId: string
  amountMinor: number
  currency: string
  status: string
  method?: string
  chargeDate?: string
  providerCreatedAt?: string
  updatedAt?: { toDate(): Date } | Date
  providerPaymentId: string
}

const demo: Payment[] = [
  { id: '1', memberName: 'Alex Morgan', memberId: '1', amountMinor: 4500, currency: 'GBP', status: 'confirmed', chargeDate: '14 Jul 2026', providerPaymentId: 'PM-DEMO-001' },
  { id: '2', memberName: 'Jordan Lee', memberId: '3', amountMinor: 4500, currency: 'GBP', status: 'failed', chargeDate: '13 Jul 2026', providerPaymentId: 'PM-DEMO-002' },
  { id: '3', memberName: 'Sam Taylor', memberId: '2', amountMinor: 3500, currency: 'GBP', status: 'submitted', chargeDate: '15 Jul 2026', providerPaymentId: 'PM-DEMO-003' },
]
const knownLabels: Record<string, string> = {
  pending_submission: 'Pending', pending_customer_approval: 'Awaiting approval',
  submitted: 'Submitted', confirmed: 'Confirmed', paid_out: 'Paid out',
  failed: 'Failed', cancelled: 'Cancelled', charged_back: 'Charged back',
  surcharge_fee_debited: 'Failed (fee charged)',
}
const label = (status: string) => knownLabels[status] || status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
const failedStatuses = ['failed', 'charged_back', 'surcharge_fee_debited']
const paymentDate = (p: Payment) => {
  if (p.chargeDate) return p.chargeDate
  const iso = p.providerCreatedAt ? new Date(p.providerCreatedAt) : null
  const ts = !iso && p.updatedAt ? (p.updatedAt instanceof Date ? p.updatedAt : p.updatedAt.toDate()) : null
  const d = iso || ts
  return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '—'
}

export function PaymentsPage() {
  const [payments, setPayments] = useState(demo)
  const [live, setLive] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | string>('all')

  useEffect(() => {
    if (!firebaseConfigured) return
    return onSnapshot(query(collection(db, 'payments'), orderBy('updatedAt', 'desc')), (snapshot) => {
      setLive(true)
      setPayments(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Payment))
    }, () => setLive(false))
  }, [])

  const statuses = useMemo(() => [...new Set(payments.map((p) => p.status))], [payments])
  const shown = useMemo(() => payments.filter((payment) =>
    (filter === 'all' || payment.status === filter)
    && `${payment.memberName} ${payment.providerPaymentId}`.toLowerCase().includes(search.toLowerCase()),
  ), [payments, search, filter])
  const confirmed = payments.filter((payment) => ['confirmed', 'paid_out'].includes(payment.status))
    .reduce((sum, payment) => sum + payment.amountMinor, 0)
  const failed = payments.filter((payment) => failedStatuses.includes(payment.status)).length

  return <>
    <header className="page-head">
      <div>
        <p className="eyebrow">Payments</p>
        <h1>Payments</h1>
        <p>{live ? 'Live webhook-driven payment and mandate activity.' : 'Payment integration is ready to connect when your GoCardless access is available.'}</p>
      </div>
      <span className="provider-badge">{live ? 'GoCardless connected' : 'GoCardless awaiting setup'}</span>
    </header>
    <section className="payment-metrics">
      <article className="panel"><CheckCircle2 /><span>Confirmed this view</span><strong>£{(confirmed / 100).toFixed(2)}</strong></article>
      <article className="panel"><AlertTriangle /><span>Failed payments</span><strong>{failed}</strong></article>
      <article className="panel"><Clock3 /><span>Processing</span><strong>{payments.filter((payment) => ['pending_submission', 'submitted'].includes(payment.status)).length}</strong></article>
    </section>
    <CashDueList />
    <article className="panel members-panel">
      <div className="member-tools">
        <label className="search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Member or payment reference…" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All payments</option>
          {statuses.map((value) => <option value={value} key={value}>{label(value)}</option>)}
        </select>
      </div>
      <div className="payment-table">
        <div className="payment-head"><span>Member</span><span>Date</span><span>Amount</span><span>Status</span></div>
        {shown.map((payment) => <button className="payment-row" key={payment.id}>
          <span><strong>{payment.memberName}</strong><small>{payment.providerPaymentId}</small></span>
          <span>{paymentDate(payment)}</span>
          <strong>£{(payment.amountMinor / 100).toFixed(2)}</strong>
          <em className={`payment-${payment.status}`}>{label(payment.status)}</em>
        </button>)}
        {!shown.length && <p className="no-results">No payments match this view.</p>}
      </div>
    </article>
  </>
}
