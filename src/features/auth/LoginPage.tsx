import { useState, type FormEvent } from 'react'
import { Navigate,useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { login, user, demo } = useAuth()
  const location=useLocation(),requested=(location.state as{from?:unknown}|null)?.from,returnTo=typeof requested==='string'&&requested.startsWith('/')&&!requested.startsWith('/login')?requested:'/'
  const forEvent=returnTo.includes('event=')
  const forCheckIn=returnTo.includes('/check-in')
  const eventName=(()=>{try{return new URLSearchParams(returnTo.split('?')[1]||'').get('t')||''}catch{return''}})()
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [info,setInfo]=useState(''); const [busy,setBusy]=useState(false)
  if (user || demo) return <Navigate to={returnTo} replace />
  async function submit(event: FormEvent){event.preventDefault();setError('');setInfo('');setBusy(true);try{await login(email,password)}catch{setError('We could not sign you in. Check your details and try again.')}finally{setBusy(false)}}
  async function reset(){setError('');setInfo('');if(!email){setError('Enter your email address first.');return}try{await fetch('/.netlify/functions/password-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});setInfo("If there's an account for that email, a message from Paul & Becky is on its way.")}catch{setError('Password reset could not be started.')}}
  return <main className="login-page"><section className="login-card"><img className="auth-logo" src="/logo.png" alt="Ryfields Gym"/><p className="eyebrow">Ryfields Gym & Fitness</p><h1>{forEvent?'Get your tickets':forCheckIn?'Almost there':'Welcome back'}</h1><p>{forEvent?<>You’re booking {eventName?<strong>{eventName}</strong>:'an event'} at Ryfields Gym. Create an account and we’ll take you straight to checkout.</>:forCheckIn?<>Sign in and we’ll check you straight in.</>:'Sign in to your account.'}</p>{forEvent&&<Link className="primary login-cta" to="/register" state={{from:returnTo}}>Create an account</Link>}{forEvent&&<p className="login-or">Already have an account? Sign in below.</p>}<form onSubmit={submit}><label>Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}{info&&<p className="notice" role="status">{info}</p>}<button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button><button className="link-button" type="button" onClick={reset}>Forgot password?</button>{forCheckIn?<p className="login-link">New to Ryfields? <Link to="/register" state={{from:returnTo}}>Create an account</Link> — you can pick up a day pass in the shop.</p>:!forEvent&&<p className="login-link">First time using the Ryfields Gym app? <Link to="/register" state={{from:returnTo}}>Get started here</Link></p>}</form></section></main>
}
