// Moves a membership from one login to another, for the common case where a
// member accidentally created two accounts and claimed with the wrong one.
// Does the same three things the app's linkMemberAccount does, plus tidies the
// account being left behind so two logins never both hold the same membership.
//
//   node scripts/relink-member-account.mjs                 (preview)
//   node scripts/relink-member-account.mjs apply           (do it)
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const MEMBER_ID = 'FHsJJWblvzVV5SJLzqw7'          // RYF-1040 Kevin Atkinson Hughes-Gandy
const FROM_UID = 'eY5jO2JYBBQM6efGjUDR0dOgH3B3'   // k-b-a@mail.com, password unknown to him
const TO_UID = '6GcrHWeK03XzZCo3LvXwuV0hyAV2'     // kevin_atkinson69@hotmail.com, he has this one
const NEW_CONTACT_EMAIL = 'kevin_atkinson69@hotmail.com'

initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) })
const auth = getAuth(), db = getFirestore(), apply = process.argv.includes('apply')

const memberRef = db.collection('members').doc(MEMBER_ID)
const member = await memberRef.get()
if (!member.exists) throw new Error('Member not found - aborting.')
if (member.get('authUid') !== FROM_UID) throw new Error(`Member is linked to ${member.get('authUid')}, not the account I expected - aborting.`)

const from = await auth.getUser(FROM_UID), to = await auth.getUser(TO_UID)
const alreadyLinked = (await db.collection('members').where('authUid', '==', TO_UID).get()).docs
if (alreadyLinked.length) throw new Error(`${to.email} already holds a membership - aborting rather than creating a second link.`)

console.log(`Member   : ${member.get('memberNumber')} ${member.get('firstName')} ${member.get('lastName')}`)
console.log(`           ${member.get('membershipTypeId')} / ${member.get('membershipStatus')}, ${member.get('classCredits') ?? 0} class passes`)
console.log(`Moving   : ${from.email}  ->  ${to.email}`)
console.log(`Contact  : ${member.get('email')}  ->  ${NEW_CONTACT_EMAIL}`)
console.log(`Leaving  : ${from.email} signed out, no membership, account kept (not deleted)`)
if (!apply) { console.log('\nPreview only. Add `apply` to make the change.'); process.exit(0) }

await memberRef.update({ authUid: TO_UID, email: NEW_CONTACT_EMAIL,
  searchTokens: [String(member.get('firstName') || '').toLowerCase(), String(member.get('lastName') || '').toLowerCase(),
    NEW_CONTACT_EMAIL, String(member.get('memberNumber') || '').toLowerCase()],
  updatedAt: FieldValue.serverTimestamp() })
await auth.setCustomUserClaims(TO_UID, { role: 'member', memberId: MEMBER_ID })
// The old login must stop being a member immediately, not when its token expires.
await auth.setCustomUserClaims(FROM_UID, {})
await auth.revokeRefreshTokens(FROM_UID)
console.log('\nDone. He signs in with the hotmail address and the password he already has.')
