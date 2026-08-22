import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const email = String(process.argv[2] || '').trim().toLowerCase()
if (!email) throw new Error('Usage: node scripts/audit-auth-user.mjs member@example.com')

initializeApp({ credential: applicationDefault(), projectId: 'ryfields-gym' })
const user = await getAuth().getUserByEmail(email)
console.log(JSON.stringify({
  uid: user.uid,
  email: user.email,
  disabled: user.disabled,
  emailVerified: user.emailVerified,
  providers: user.providerData.map(item => item.providerId),
  createdAt: user.metadata.creationTime,
  lastSignInAt: user.metadata.lastSignInTime,
  lastRefreshAt: user.metadata.lastRefreshTime,
  customClaims: user.customClaims || {},
}, null, 2))
