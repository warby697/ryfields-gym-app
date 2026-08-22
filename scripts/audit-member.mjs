import {applicationDefault, initializeApp} from 'firebase-admin/app'
import {getAuth} from 'firebase-admin/auth'
import {getFirestore} from 'firebase-admin/firestore'

const email=String(process.argv[2]||'').trim().toLowerCase()
if(!email)throw new Error('Usage: node scripts/audit-member.mjs member@example.com')
initializeApp({credential:applicationDefault()})
const db=getFirestore(),matches=await db.collection('members').where('email','==',email).get()
const results=[]
for(const doc of matches.docs){
  const d=doc.data(),auth=d.authUid?await getAuth().getUser(String(d.authUid)).catch(()=>null):null
  const[orders,upgrades,mandate,subscription]=await Promise.all([db.collection('shopOrders').where('memberId','==',doc.id).get(),db.collection('membershipUpgradeRequests').where('memberId','==',doc.id).get(),d.gocardlessMandateId?db.collection('mandates').doc(String(d.gocardlessMandateId)).get():null,d.gocardlessSubscriptionId?db.collection('subscriptions').doc(String(d.gocardlessSubscriptionId)).get():null])
  results.push({id:doc.id,memberNumber:d.memberNumber,name:`${d.firstName||''} ${d.lastName||''}`.trim(),email:d.email,claimed:!!d.authUid,authAccountFound:!!auth,authEmail:auth?.email||null,authRole:auth?.customClaims?.role||null,authMemberId:auth?.customClaims?.memberId||null,membershipTypeId:d.membershipTypeId||null,membershipTypeName:d.membershipTypeName||null,membershipStatus:d.membershipStatus||null,classCredits:d.classCredits??null,gocardlessEnvironment:d.gocardlessEnvironment||null,gocardlessCustomerLinked:!!d.gocardlessCustomerId,gocardlessMandateLinked:!!d.gocardlessMandateId,gocardlessMandateId:d.gocardlessMandateId||null,mandateStatus:mandate?.get('status')||null,mandateProviderCreatedAt:mandate?.get('providerCreatedAt')||null,gocardlessSubscriptionLinked:!!d.gocardlessSubscriptionId,gocardlessSubscriptionId:d.gocardlessSubscriptionId||null,subscriptionStatus:subscription?.get('status')||null,subscriptionProviderCreatedAt:subscription?.get('providerCreatedAt')||null,shopOrders:orders.docs.map(x=>({id:x.id,productId:x.get('productId'),amountMinor:x.get('amountMinor'),status:x.get('status')})),upgradeRequests:upgrades.docs.map(x=>({id:x.id,status:x.get('status'),proRataPaidMinor:x.get('proRataPaidMinor'),oldSubscriptionId:x.get('oldSubscriptionId'),newSubscriptionId:x.get('newSubscriptionId'),error:x.get('error')}))})
}
console.log(JSON.stringify({matches:results.length,results},null,2))
