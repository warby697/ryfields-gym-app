import {applicationDefault,initializeApp} from 'firebase-admin/app'
import {FieldValue,getFirestore} from 'firebase-admin/firestore'
const[email,name]=process.argv.slice(2);if(!email||!name)throw new Error('Usage: node scripts/set-member-plan-name.mjs email "Plan name"')
initializeApp({credential:applicationDefault()});const db=getFirestore(),matches=await db.collection('members').where('email','==',email.toLowerCase()).get();if(matches.size!==1)throw new Error(`Expected one member, found ${matches.size}`);await matches.docs[0].ref.update({membershipTypeName:name,updatedAt:FieldValue.serverTimestamp()});console.log(`Updated ${matches.docs[0].id} to ${name}`)
