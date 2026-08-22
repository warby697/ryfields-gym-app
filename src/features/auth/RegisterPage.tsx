import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { httpsCallable } from '../../lib/netlifyFunctions'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { auth, firebaseConfigured, functions } from '../../lib/firebase'

export function RegisterPage(){
  const navigate=useNavigate(),location=useLocation()
  const requested=(location.state as{from?:unknown}|null)?.from
  const destination=typeof requested==='string'&&requested.startsWith('/')?requested:'/'
  const buyingTicket=destination.includes('event=')
  const [form,setForm]=useState({firstName:'',lastName:'',email:'',password:'',termsAccepted:false})
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('')
    try{
      if(!firebaseConfigured)throw new Error('Firebase is not connected.')
      const credential=await createUserWithEmailAndPassword(auth,form.email,form.password)
      await updateProfile(credential.user,{displayName:`${form.firstName} ${form.lastName}`.trim()})
      await credential.user.getIdToken(true)
      // Ticket buyers get the free member account created for them right away —
      // the event checkout needs a member record, and asking them to pick from
      // the onboarding options first is the step that loses people.
      if(buyingTicket){await httpsCallable(functions,'createFreeAccount')({firstName:form.firstName,lastName:form.lastName});await credential.user.getIdToken(true)}
      navigate(destination,{replace:true})
    }catch{setError('We could not create your account. That email may already be registered — try signing in instead.')}
    finally{setBusy(false)}
  }
  return <main className="register-page"><section className="register-card"><img className="auth-logo" src="/logo.png" alt="Ryfields Gym"/><p className="eyebrow">Join Ryfields Gym</p><h1>Create your account</h1><p>{buyingTicket?'Just a few details and your tickets are next — we’ll take you straight to checkout.':'Set up a free Ryfields Gym account. Already a paying member? Create your account, then claim your membership on the next screen.'}</p><form onSubmit={submit}><div className="form-grid"><label>First name<input required value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></label><label>Last name<input required value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label></div><label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Password<input required minLength={8} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><label className="checkbox"><input required type="checkbox" checked={form.termsAccepted} onChange={e=>setForm({...form,termsAccepted:e.target.checked})}/> <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">terms &amp; conditions</a> and <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a>.</span></label>{error&&<p className="form-error">{error}</p>}<button className="primary" disabled={busy||!form.termsAccepted}>{busy?'Creating account…':buyingTicket?'Create account & continue':'Create account'}</button><p className="login-link">Already have an account? <Link to="/login" state={{from:destination}}>Sign in</Link></p></form></section></main>
}
