import { ArrowLeft, Phone, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { acknowledgeCancellation, addMemberNote, grantClassCredits, linkMemberAccount, recordCashPayment, setCashSchedule, setMemberChecked, subscribeToMemberFeedback, subscribeToMemberNotes, subscribeToStatusHistory, toDate, updateMember, type FeedbackEntry, type MemberNote, type StatusHistory } from './memberService'
import { goalLabel, statusLabel, type Member } from './types'

const PARQ_LABELS: [string, string][] = [
  ['q1', 'Heart condition — doctor advised limited activity'],
  ['q2', 'Chest pain during physical activity'],
  ['q3', 'Chest pain at rest in the past month'],
  ['q4', 'Dizziness or loss of consciousness'],
  ['q5', 'Bone or joint problem worsened by activity'],
  ['q6', 'Prescribed drugs for blood pressure / heart'],
  ['q7', 'Other reason not to do physical activity'],
]

function CashPanel({ member, onUpdate }: { member: Member; onUpdate(m: Member): void }) {
  const s = member.cashSchedule
  const [amount, setAmount] = useState((((s?.amountMinor ?? 0) / 100) || '').toString())
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fmt = (v?: { toDate(): Date } | Date) => { const d = toDate(v); return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : '—' }
  const minor = () => Math.round(parseFloat(amount || '0') * 100)
  async function record() {
    if (!minor()) { setMsg('Enter an amount.'); return }
    setBusy(true); setMsg('')
    try {
      const r = await recordCashPayment(member.id, minor(), paidAt)
      const next = r?.nextDueAt ? new Date(r.nextDueAt) : s?.nextDueAt
      onUpdate({ ...member, paymentProvider: 'cash', cashSchedule: { amountMinor: minor(), intervalMonths: s?.intervalMonths ?? 1, nextDueAt: next, lastPaidAt: new Date(paidAt), lastAmountMinor: minor(), active: true } })
      setMsg('Payment recorded.')
    } catch { setMsg('Could not record the payment.') } finally { setBusy(false) }
  }
  async function setup() {
    if (!minor() || !dueAt) { setMsg('Enter an amount and a due date.'); return }
    setBusy(true); setMsg('')
    try {
      await setCashSchedule(member.id, minor(), dueAt, s?.intervalMonths ?? 1)
      onUpdate({ ...member, paymentProvider: 'cash', cashSchedule: { amountMinor: minor(), intervalMonths: s?.intervalMonths ?? 1, nextDueAt: new Date(dueAt), lastPaidAt: s?.lastPaidAt, lastAmountMinor: s?.lastAmountMinor, active: true } })
      setMsg('Cash schedule saved.')
    } catch { setMsg('Could not save the schedule.') } finally { setBusy(false) }
  }
  const hasSchedule = s?.amountMinor != null && s?.nextDueAt
  return <article className="panel cash-panel">
    <p className="eyebrow">Cash membership</p>
    {hasSchedule ? <>
      <div className="cash-status">
        <div><small>Next payment</small><strong>£{((s!.amountMinor) / 100).toFixed(2)}</strong><span>due {fmt(s!.nextDueAt)}</span></div>
        <div><small>Last paid</small><strong>{s!.lastPaidAt ? `£${((s!.lastAmountMinor ?? s!.amountMinor) / 100).toFixed(2)}` : '—'}</strong><span>{s!.lastPaidAt ? fmt(s!.lastPaidAt) : 'no payments yet'}</span></div>
      </div>
      {msg && <p className="review-note">{msg}</p>}
      <div className="cash-record">
        <label>Amount £<input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Paid on<input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} /></label>
        <button className="primary" disabled={busy} onClick={record}>{busy ? 'Saving…' : 'Record payment'}</button>
      </div>
    </> : <>
      <p>Set up a monthly cash schedule so this member and staff can track what’s due.</p>
      {msg && <p className="review-note">{msg}</p>}
      <div className="cash-record">
        <label>Amount £<input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>First payment due<input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
        <button className="primary" disabled={busy || !dueAt} onClick={setup}>{busy ? 'Saving…' : 'Set up schedule'}</button>
      </div>
    </>}
  </article>
}
import { subscribeToMembershipTypes } from '../memberships/membershipService'
import type { MembershipType } from '../memberships/types'

export function MemberProfile({member,onBack,onChange}:{member:Member;onBack():void;onChange(member:Member):void}){
  const [form,setForm]=useState(member),[note,setNote]=useState(''),[notes,setNotes]=useState<MemberNote[]>([]),[history,setHistory]=useState<StatusHistory[]>([]),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[plans,setPlans]=useState<MembershipType[]>([])
  const [linkEmail,setLinkEmail]=useState('')
  useEffect(()=>{setForm(member)},[member])
  useEffect(()=>subscribeToMembershipTypes(setPlans,()=>undefined),[])
  const [feedback,setFeedback]=useState<FeedbackEntry[]>([])
  useEffect(()=>{const failed=()=>setMessage('Some member activity could not be loaded.');const stops=[subscribeToMemberNotes(member.id,setNotes,failed),subscribeToStatusHistory(member.id,setHistory,failed),subscribeToMemberFeedback(member.id,setFeedback,()=>{})];return()=>stops.forEach(stop=>stop())},[member.id])
  const FACES=['😞','🙁','😐','🙂','😄']
  const hapAvg=feedback.length?feedback.reduce((s,f)=>s+(f.rating||0),0)/feedback.length:0
  const date=(value?:{toDate():Date}|Date)=>value?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(value instanceof Date?value:value.toDate()):'Not recorded'
  async function save(event:FormEvent){event.preventDefault();setSaving(true);setMessage('');try{await updateMember(member.id,{firstName:form.firstName,lastName:form.lastName,email:form.email,phone:form.phone});onChange(form);setMessage('Member details saved.')}catch{setMessage('Changes could not be saved.')}finally{setSaving(false)}}
  async function submitNote(event:FormEvent){event.preventDefault();if(!note.trim())return;setSaving(true);try{const saved=await addMemberNote(member.id,note.trim());if(!notes.some(item=>item.id===saved.id))setNotes(current=>[{id:saved.id,body:note.trim()},...current]);setNote('')}catch{setMessage('Note could not be added.')}finally{setSaving(false)}}
  const plan=plans.find(item=>item.id===form.membershipTypeId)
  const payMinor=typeof form.priceMinor==='number'?form.priceMinor:plan?.priceMinor
  const paying=payMinor==null?'Nothing on file':`£${(payMinor/100).toFixed(2).replace(/\.00$/,'')} per ${plan?.billingInterval==='annual'?'year':'month'}`
  async function toggleChecked(){const next=!form.staffChecked;try{await setMemberChecked(member.id,next);const u={...form,staffChecked:next,needsReview:!next,reviewReason:next?null:'Manually marked for review'};setForm(u);onChange(u);setMessage(next?'Review completed.':'Added back to the review list.')}catch{setMessage('Could not update the review status.')}}
  async function submitLink(event:FormEvent){event.preventDefault();if(!linkEmail.trim())return;setSaving(true);setMessage('');try{await linkMemberAccount(member.id,linkEmail.trim());const u={...form,authUid:'linked'};setForm(u);onChange(u);setLinkEmail('');setMessage('Account linked — they now have member access.')}catch{setMessage('Could not link that account. Check the email is registered.')}finally{setSaving(false)}}
  async function ackCancel(){setSaving(true);setMessage('');try{await acknowledgeCancellation(member.id);const u={...form,cancellationAcknowledged:true,needsReview:false};setForm(u);onChange(u);setMessage('Cancellation acknowledged.')}catch{setMessage('Could not acknowledge this just now.')}finally{setSaving(false)}}
  async function addCredits(delta:number){setSaving(true);setMessage('');try{const next=await grantClassCredits(member.id,delta);const u={...form,classCredits:next};setForm(u);onChange(u);setMessage(delta>0?`Added ${delta} class ${delta===1?'pass':'passes'} — they’ll see it straight away.`:'Class passes updated.')}catch{setMessage('Could not update class passes just now.')}finally{setSaving(false)}}
  return <><button className="back-button" onClick={onBack}><ArrowLeft/> Back to members</button><header className="profile-head"><div className="profile-avatar">{form.firstName[0]}{form.lastName[0]}</div><div><p className="eyebrow">{form.membershipTypeName||'Member'}</p><h1>{form.firstName} {form.lastName}</h1><span className={`profile-status status-${form.membershipStatus}`}>{statusLabel[form.membershipStatus]}</span></div>{form.phone&&<a className="secondary profile-call" href={`tel:${form.phone.replace(/\s+/g,'')}`}><Phone size={16}/> Call {form.firstName}</a>}</header>{message&&<div className="notice">{message}</div>}<section className="profile-grid"><article className="panel"><p className="eyebrow">Member details</p><h2>Contact information</h2><form className="profile-form" onSubmit={save}><div className="form-grid"><label>First name<input required value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></label><label>Last name<input required value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label></div><label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Phone number<input type="tel" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/></label><button className="primary" disabled={saving}><Save/> {saving?'Saving…':'Save details'}</button></form></article><aside className="profile-side"><article className="panel"><p className="eyebrow">Membership</p><h2>{form.membershipTypeName||form.membershipTypeId}</h2><dl><div><dt>Paying</dt><dd>{paying}</dd></div><div><dt>Status</dt><dd>{statusLabel[form.membershipStatus]}</dd></div><div><dt>Member since</dt><dd>{date(form.createdAt)}</dd></div></dl></article><article className="panel credits-panel"><p className="eyebrow">Class passes</p><h2>{form.classCredits??0} {(form.classCredits??0)===1?'pass':'passes'}</h2><p>Give free class passes on the house — they update instantly.</p><div className="credit-buttons"><button className="secondary" disabled={saving} onClick={()=>addCredits(1)}>+1</button><button className="secondary" disabled={saving} onClick={()=>addCredits(3)}>+3</button><button className="secondary" disabled={saving} onClick={()=>addCredits(5)}>+5</button>{(form.classCredits??0)>0&&<button className="secondary subtle" disabled={saving} onClick={()=>addCredits(-1)}>−1</button>}</div></article><article className="panel hap-panel"><p className="eyebrow">Happiness-ometer</p><h2>{hapAvg?<>{hapAvg.toFixed(1)}<small> / 5</small> {FACES[Math.round(hapAvg)-1]||''}</>:'No scores yet'}</h2>{feedback.length?<div className="hap-list">{feedback.slice(0,6).map(f=><div className="hap-row" key={f.id}><span className="hap-face">{FACES[f.rating-1]||'😐'}</span><div>{f.prompt&&<small className="hap-prompt">{f.prompt}</small>}{f.comment?<p>{f.comment}</p>:<p className="muted-note">No comment</p>}<small className="hap-date">{f.updatedAt?date(f.updatedAt):''}</small></div></div>)}</div>:<p className="review-note">Nothing logged yet — members are asked in the app.</p>}</article>{form.membershipStatus==='cancelled'&&<article className={`panel cancel-ack${form.cancellationAcknowledged?' seen':''}`}><p className="eyebrow">Cancelled membership</p>{form.cancellationAcknowledged?<p>✓ Seen — now a normal account with no active membership.</p>:<><p>Their payment was cancelled. Once you’ve seen this, confirm it and it stops being flagged — becoming a normal no-membership account.</p><button className="primary" disabled={saving} onClick={ackCancel}>Confirm we’ve seen this</button></>}</article>}{(form.dob||form.addressLine||form.nextOfKin?.name||form.medicalFlag||form.guardianEmail||form.parq||form.goal)&&<article className="panel"><p className="eyebrow">Personal & health</p>{form.medicalFlag&&<p className="medical-alert">⚕️ Medical flag{form.medicalDetails?` — ${form.medicalDetails}`:''}</p>}<div className="ph-list">{form.goal&&<div className="ph-row"><span className="ph-label">Here for</span><span className="ph-value">{goalLabel[form.goal]||form.goal}</span></div>}<div className="ph-row"><span className="ph-label">Date of birth</span><span className="ph-value">{form.dob?date(new Date(form.dob)):'Not recorded'}</span></div><div className="ph-row"><span className="ph-label">Address</span><span className="ph-value">{[form.addressLine,form.postcode].filter(Boolean).join(', ')||'Not recorded'}</span></div><div className="ph-row"><span className="ph-label">Next of kin</span><span className="ph-value">{form.nextOfKin?.name?<>{form.nextOfKin.name}{form.nextOfKin.relationship?<em> · {form.nextOfKin.relationship}</em>:null}{form.nextOfKin.phone?<a href={`tel:${form.nextOfKin.phone.replace(/\s+/g,'')}`}>{form.nextOfKin.phone}</a>:null}</>:'Not recorded'}</span></div>{form.guardianEmail&&<div className="ph-row"><span className="ph-label">Guardian</span><span className="ph-value">{form.guardianEmail}</span></div>}</div>{form.parq&&(()=>{const flagged=PARQ_LABELS.filter(([k])=>form.parq![k]);return <div className="parq-block"><p className="parq-title">PAR-Q health screening</p>{flagged.length?<ul className="parq-flags">{flagged.map(([k,label])=><li key={k}>{label}</li>)}</ul>:<p className="parq-clear">No concerns flagged.</p>}</div>})()}</article>}<article className="panel"><p className="eyebrow">Staff review</p><label className="check-toggle"><input type="checkbox" checked={!form.needsReview&&!!form.staffChecked} onChange={toggleChecked}/> Review complete</label>{form.needsReview&&<p className="review-note">⚑ {form.reviewReason||'This member needs checking.'}</p>}<dl><div><dt>Login</dt><dd>{form.authUid?'Linked ✓':'Not linked'}</dd></div></dl>{!form.authUid&&<form className="profile-form link-form" onSubmit={submitLink}><label>Link a login by email<input type="email" value={linkEmail} onChange={e=>setLinkEmail(e.target.value)} placeholder="account email…"/></label><button className="secondary" disabled={saving||!linkEmail.trim()}>Link account</button></form>}</article>{(form.paymentProvider==='cash'||form.cashSchedule)&&<CashPanel member={form} onUpdate={u=>{setForm(u);onChange(u)}}/>}<article className="panel"><p className="eyebrow">Private staff notes</p><form className="note-form" onSubmit={submitNote}><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note about this member…"/><button className="secondary" disabled={saving||!note.trim()}>Add note</button></form>{notes.map(item=><div className="note" key={item.id}><p>{item.body}</p><small>{item.createdAt?date(item.createdAt):'Just now'} · Staff</small></div>)}</article><article className="panel"><p className="eyebrow">Status history</p><div className="history-item"><i/><div><strong>{statusLabel[form.membershipStatus]}</strong><small>Current membership status</small></div></div>{history.map(item=><div className="history-item muted" key={item.id}><i/><div><strong>{statusLabel[item.to as keyof typeof statusLabel]||item.to}</strong><small>{item.reason||'Status changed'} · {date(item.effectiveAt)}</small></div></div>)}<div className="history-item muted"><i/><div><strong>Member created</strong><small>{date(form.createdAt)}</small></div></div></article></aside></section></>
}
