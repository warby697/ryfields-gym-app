import { readFileSync } from 'node:fs'

const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')
const indexes=JSON.parse(readFileSync(new URL('../firestore.indexes.json',import.meta.url),'utf8'))
const bookingIndex=indexes.indexes?.some(index=>index.collectionGroup==='bookings'&&index.queryScope==='COLLECTION_GROUP'&&['memberId','status'].every(field=>index.fields?.some(item=>item.fieldPath===field)))
const bookingRule=rules.includes('match /{path=**}/bookings/{bookingMemberId}')&&rules.includes('resource.data.memberId == memberId()')
if(!bookingIndex||!bookingRule){console.error('Required member-bookings Firestore rule/index is missing. Do not deploy the web app.');process.exit(1)}
console.log('Firestore launch schema is present: member booking rule and collection-group index verified.')
