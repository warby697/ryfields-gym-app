import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { db, firebaseConfigured, functions } from '../../lib/firebase'
import { httpsCallable } from '../../lib/netlifyFunctions'
import { useAuth } from '../auth/AuthProvider'
import type { MembershipType } from '../memberships/types'

const PARQ: [string, string][] = [
  ['q1', 'Has a doctor ever said you have a heart condition and that you should only do physical activity recommended by a doctor?'],
  ['q2', 'Do you feel pain in your chest when you do physical activity?'],
  ['q3', 'In the past month, have you had chest pain when you were not doing physical activity?'],
  ['q4', 'Do you lose your balance because of dizziness, or do you ever lose consciousness?'],
  ['q5', 'Do you have a bone or joint problem that could be made worse by a change in your physical activity?'],
  ['q6', 'Is a doctor currently prescribing drugs for your blood pressure or a heart condition?'],
  ['q7', 'Do you know of any other reason why you should not do physical activity?'],
]

export function Onboarding(){
  const { user, logout } = useAuth()
  const parts=(user?.displayName||'').split(' ')
  const [mode,setMode]=useState<'choose'|'claim'|'join'>('choose')
  const [claim,setClaim]=useState({email:user?.email||'',firstName:parts[0]||'',lastName:parts.slice(1).join(' ')||''})
  const [join,setJoin]=useState({firstName:parts[0]||'',lastName:parts.slice(1).join(' ')||'',membershipTypeId:'',dob:'',phone:'',addressLine:'',postcode:'',nokName:'',nokRelationship:'',nokPhone:'',adultEmail:'',medicalDetails:''})
  const [parq,setParq]=useState<Record<string,boolean>>({q1:false,q2:false,q3:false,q4:false,q5:false,q6:false,q7:false})
  const [terms,setTerms]=useState(false)
  const [plans,setPlans]=useState<MembershipType[]>([])
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{if(!firebaseConfigured)return;return onSnapshot(query(collection(db,'membershipTypes'),orderBy('name')),s=>setPlans(s.docs.map(d=>({id:d.id,...d.data()}) as MembershipType).filter(p=>p.active!==false)))},[])

  const refresh=async()=>{await user?.getIdToken(true)} // picks up the new member role and swaps to the portal
  async function continueWithoutMembership(){if(!parts[0]||!parts.slice(1).join(' ')){setError('Please sign out and create your account again with your full name.');return}setBusy(true);setError('');try{await httpsCallable(functions,'createFreeAccount')({firstName:parts[0],lastName:parts.slice(1).join(' ')});await refresh()}catch(err){setError(err instanceof Error&&err.message?err.message:'We couldn’t open your account just now.')}finally{setBusy(false)}}

  async function submitClaim(e:FormEvent){e.preventDefault();setBusy(true);setError('')
    try{await httpsCallable(functions,'claimMembership')(claim);await refresh()}
    catch{setError('We couldn’t match those details to an unclaimed membership. Check the email and name we hold for you, or contact the gym.')}
    finally{setBusy(false)}}

  const isTeen=join.membershipTypeId==='teen'
  const anyParq=Object.values(parq).some(Boolean)
  async function submitJoin(e:FormEvent){e.preventDefault()
    if(!join.membershipTypeId){setError('Please choose a plan.');return}
    if(isTeen&&!join.adultEmail.trim()){setError('Please enter the parent/guardian member’s email.');return}
    if(anyParq&&!join.medicalDetails.trim()){setError('Please give brief details for the health question(s) you answered “yes” to.');return}
    setBusy(true);setError('')
    try{await httpsCallable(functions,'completeRegistration')({firstName:join.firstName,lastName:join.lastName,phone:join.phone,dob:join.dob,addressLine:join.addressLine,postcode:join.postcode,membershipTypeId:join.membershipTypeId,nextOfKin:{name:join.nokName,relationship:join.nokRelationship,phone:join.nokPhone},parq,medicalDetails:join.medicalDetails,adultEmail:isTeen?join.adultEmail:'',termsAccepted:true,marketingConsent:true});await refresh()}
    catch(err){setError(err instanceof Error&&err.message?err.message:'Sorry, we couldn’t set up your membership just now. Please try again.')}
    finally{setBusy(false)}}

  return <main className="register-page"><section className="register-card"><img className="auth-logo" src="/logo.png" alt="Ryfields Gym"/>
    {mode==='choose'&&<>
      <p className="eyebrow">Welcome{parts[0]?`, ${parts[0]}`:''}</p><h1>Let’s get you set up</h1><p>Are you already a member at Ryfields Gym, or just joining us?</p>
      <div className="onboard-choices">
        <button type="button" className="panel onboard-choice" onClick={()=>{setError('');setMode('claim')}}><strong>I’m already a member</strong><span>Claim your existing membership using the details we hold for you.</span></button>
        <button type="button" className="panel onboard-choice" onClick={()=>{setError('');setMode('join')}}><strong>I’m new here</strong><span>Join Ryfields Gym and pick the plan that suits you.</span></button>
        <button type="button" className="panel onboard-choice" disabled={busy} onClick={continueWithoutMembership}><strong>Continue without a membership</strong><span>Browse classes, visit the Shop and buy a flexible day pass. Join whenever you’re ready.</span></button>
      </div>
      {error&&<p className="form-error">{error}</p>}
      <p className="login-link"><button type="button" className="link-button" onClick={()=>logout()}>Sign out</button></p>
    </>}
    {mode==='claim'&&<form onSubmit={submitClaim}>
      <p className="eyebrow">Claim your membership</p><h1>Are you already a member?</h1><p>Enter the email and name we have on file and we’ll link your membership to this account.</p>
      <label>Email we hold for you<input required type="email" value={claim.email} onChange={e=>setClaim({...claim,email:e.target.value})}/></label>
      <div className="form-grid"><label>First name<input required value={claim.firstName} onChange={e=>setClaim({...claim,firstName:e.target.value})}/></label><label>Last name<input required value={claim.lastName} onChange={e=>setClaim({...claim,lastName:e.target.value})}/></label></div>
      {error&&<p className="form-error">{error}</p>}
      <button className="primary" disabled={busy}>{busy?'Checking…':'Claim my membership'}</button>
      <p className="login-link"><button type="button" className="link-button" onClick={()=>{setError('');setMode('choose')}}>Back</button></p>
    </form>}
    {mode==='join'&&<form onSubmit={submitJoin}>
      <p className="eyebrow">Join Ryfields Gym</p><h1>Create your membership</h1><p>A few details to get you set up — you can arrange payment next.</p>
      <div className="form-grid"><label>First name<input required value={join.firstName} onChange={e=>setJoin({...join,firstName:e.target.value})}/></label><label>Last name<input required value={join.lastName} onChange={e=>setJoin({...join,lastName:e.target.value})}/></label></div>
      <div className="form-grid"><label>Date of birth<input required type="date" value={join.dob} onChange={e=>setJoin({...join,dob:e.target.value})}/></label><label>Mobile number<input required type="tel" value={join.phone} onChange={e=>setJoin({...join,phone:e.target.value})}/></label></div>
      <label>Address<input required value={join.addressLine} onChange={e=>setJoin({...join,addressLine:e.target.value})}/></label>
      <label>Postcode<input required value={join.postcode} onChange={e=>setJoin({...join,postcode:e.target.value})}/></label>
      <fieldset><legend>Membership</legend><div className="registration-plans">{plans.map(plan=><label className={join.membershipTypeId===plan.id?'selected':''} key={plan.id}><input type="radio" name="plan" value={plan.id} checked={join.membershipTypeId===plan.id} onChange={()=>setJoin({...join,membershipTypeId:plan.id})}/><span><strong>{plan.name}</strong><small>{plan.description}</small></span><b>£{(plan.priceMinor/100).toFixed(0)}/{plan.billingInterval==='annual'?'yr':'mo'}</b></label>)}</div></fieldset>
      {isTeen&&<label>Parent/guardian member’s email<input required type="email" value={join.adultEmail} onChange={e=>setJoin({...join,adultEmail:e.target.value})}/><small className="field-hint">A teen membership must be linked to an adult who is already a member.</small></label>}
      <fieldset><legend>Emergency contact (next of kin)</legend><label>Name<input required value={join.nokName} onChange={e=>setJoin({...join,nokName:e.target.value})}/></label><div className="form-grid"><label>Relationship<input required value={join.nokRelationship} onChange={e=>setJoin({...join,nokRelationship:e.target.value})}/></label><label>Phone<input required type="tel" value={join.nokPhone} onChange={e=>setJoin({...join,nokPhone:e.target.value})}/></label></div></fieldset>
      <fieldset><legend>Health check (PAR-Q)</legend><p className="field-hint">Please answer honestly — it helps us keep you safe.</p>{PARQ.map(([k,q])=><label className="parq-row" key={k}><span>{q}</span><span className="parq-toggle"><input type="checkbox" checked={parq[k]} onChange={e=>setParq({...parq,[k]:e.target.checked})}/> Yes</span></label>)}{anyParq&&<label>Please give brief details<textarea required value={join.medicalDetails} onChange={e=>setJoin({...join,medicalDetails:e.target.value})}/></label>}</fieldset>
      <label className="checkbox"><input required type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/> <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">terms &amp; conditions</a> and <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a>, and confirm the information above is accurate.</span></label>
      {error&&<p className="form-error">{error}</p>}
      <button className="primary" disabled={busy||!terms}>{busy?'Setting up…':'Create membership'}</button>
      <p className="login-link"><button type="button" className="link-button" onClick={()=>{setError('');setMode('choose')}}>Back</button></p>
    </form>}
  </section></main>
}
