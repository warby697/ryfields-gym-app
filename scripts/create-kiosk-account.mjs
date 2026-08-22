import { applicationDefault,cert,getApps,initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync } from 'node:fs'

const email=String(process.env.KIOSK_EMAIL||'').trim().toLowerCase(),password=String(process.env.KIOSK_PASSWORD||'')
if(!email||password.length<6){console.error('Set KIOSK_EMAIL and a KIOSK_PASSWORD of at least 6 characters.');process.exit(1)}
let credential=applicationDefault()
if(process.env.GOOGLE_APPLICATION_CREDENTIALS){credential=cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8')))}
if(!getApps().length)initializeApp({credential})
const auth=getAuth();let user
try{user=await auth.getUserByEmail(email);await auth.updateUser(user.uid,{password,displayName:'Ryfields Gym Check-in Kiosk',disabled:false})}
catch(error){if(error?.code!=='auth/user-not-found')throw error;user=await auth.createUser({email,password,displayName:'Ryfields Gym Check-in Kiosk',emailVerified:true})}
await auth.setCustomUserClaims(user.uid,{role:'kiosk'})
await auth.revokeRefreshTokens(user.uid)
console.log(`Kiosk account ready: ${email}. Sign in once on the tablet, then lock the kiosk software to the app.`)
