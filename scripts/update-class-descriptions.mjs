import { initializeApp,cert } from 'firebase-admin/app'
import { FieldValue,getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { CLASS_DESCRIPTIONS } from './class-descriptions.mjs'

const key=JSON.parse(readFileSync('C:/Users/pwpt/Documents/Apps/ryfields-gym-app/.secrets/ryfields-gym-firebase-adminsdk-fbsvc-7671db904e.json','utf8'))
initializeApp({credential:cert(key)})
const db=getFirestore(),templates=await db.collection('classTemplates').get(),sessions=await db.collection('classSessions').get(),batch=db.batch()
let templateCount=0,sessionCount=0
const unmatched=[]
for(const item of templates.docs){const name=String(item.get('name')||''),description=CLASS_DESCRIPTIONS[name];if(description){batch.update(item.ref,{description,updatedAt:FieldValue.serverTimestamp()});templateCount++}else unmatched.push(name)}
for(const item of sessions.docs){if(item.get('status')!=='scheduled')continue;const description=CLASS_DESCRIPTIONS[String(item.get('nameSnapshot')||'')];if(description){batch.update(item.ref,{descriptionSnapshot:description,updatedAt:FieldValue.serverTimestamp()});sessionCount++}}
await batch.commit()
console.log(`Updated ${templateCount} class templates and ${sessionCount} future sessions.`)
if(unmatched.length)console.log(`No Bookwhen description matched: ${unmatched.join(', ')}`)
