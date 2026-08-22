import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { initializeAppCheck,ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'local-placeholder',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ryfields-local',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ryfields-local',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '0',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'local-placeholder',
}

export const firebaseConfigured = Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID)
const app = getApps().length ? getApp() : initializeApp(config)
if(import.meta.env.PROD&&import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY){
  initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY),isTokenAutoRefreshEnabled:true})
}
export const auth = getAuth(app)
export const db = getFirestore(app)
// Kept as a compatibility argument for the app's callable wrapper. Protected
// server operations are handled by Netlify Functions, as in Squadron Ops.
export const functions = null
