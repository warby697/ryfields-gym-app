import {applicationDefault, initializeApp} from 'firebase-admin/app'
import {FieldValue, getFirestore} from 'firebase-admin/firestore'

if (!process.env.GOCARDLESS_ACCESS_TOKEN) throw new Error('Missing GOCARDLESS_ACCESS_TOKEN')
if (process.env.GOCARDLESS_ENVIRONMENT !== 'sandbox') throw new Error('Refusing to run outside GoCardless sandbox')

initializeApp({credential: applicationDefault()})
const db = getFirestore()
const headers = {
  Authorization: `Bearer ${process.env.GOCARDLESS_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'GoCardless-Version': '2015-07-06',
}

async function gc(path, body) {
  const response = await fetch(`https://api-sandbox.gocardless.com${path}`, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`)
  return data
}

const matches = await db.collection('members').where('email', '==', 'ryfieldsgym@gmail.com').get()
if (matches.size !== 1) throw new Error(`Expected one Harry member, found ${matches.size}`)
const member = matches.docs[0]
const current = member.data()
if (current.gocardlessMandateId || current.gocardlessSubscriptionId) {
  throw new Error(`Harry already has GoCardless links (${current.gocardlessMandateId || '-'}, ${current.gocardlessSubscriptionId || '-'})`)
}

const customerResult = await gc('/customers', {customers: {
  given_name: 'Harry', family_name: 'Potter', email: 'ryfieldsgym@gmail.com',
  address_line1: 'Sandbox Test Address', city: 'Manchester', postal_code: 'M1 1AA', country_code: 'GB',
  metadata: {member_id: member.id, purpose: 'gym_plus_upgrade_test'},
}})
const customer = customerResult.customers
const bankResult = await gc('/customer_bank_accounts', {customer_bank_accounts: {
  account_holder_name: 'Harry Potter', account_number: '55779911', branch_code: '200000', country_code: 'GB',
  links: {customer: customer.id}, metadata: {member_id: member.id},
}})
const bank = bankResult.customer_bank_accounts
const mandateResult = await gc('/mandates', {mandates: {
  scheme: 'bacs', links: {customer_bank_account: bank.id}, metadata: {member_id: member.id},
}})
const mandate = mandateResult.mandates
const start = new Date()
start.setUTCDate(start.getUTCDate() + 10)
const startDate = start.toISOString().slice(0, 10)
const subscriptionResult = await gc('/subscriptions', {subscriptions: {
  amount: 2500, currency: 'GBP', name: 'Ryfields Gym monthly membership (sandbox test)',
  interval_unit: 'monthly', day_of_month: start.getUTCDate(), start_date: startDate,
  links: {mandate: mandate.id}, metadata: {member_id: member.id, membership_type_id: 'gym'},
}})
const subscription = subscriptionResult.subscriptions

await db.runTransaction(async transaction => {
  const fresh = await transaction.get(member.ref)
  if (fresh.get('gocardlessMandateId') || fresh.get('gocardlessSubscriptionId')) throw new Error('Harry changed while setup was running; refusing to overwrite')
  transaction.set(member.ref, {
    membershipTypeId: 'gym', membershipStatus: 'active', membershipPriceMinor: 2500,
    gocardlessCustomerId: customer.id, gocardlessMandateId: mandate.id,
    gocardlessSubscriptionId: subscription.id, gocardlessEnvironment: 'sandbox',
    nextPaymentDate: startDate, updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true})
  transaction.set(db.collection('mandates').doc(mandate.id), {
    provider: 'gocardless', providerMandateId: mandate.id, memberId: member.id,
    status: mandate.status, environment: 'sandbox', createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  transaction.set(db.collection('subscriptions').doc(subscription.id), {
    provider: 'gocardless', providerSubscriptionId: subscription.id, mandateId: mandate.id,
    memberId: member.id, membershipTypeId: 'gym', amountMinor: 2500, currency: 'GBP',
    status: subscription.status, startDate, environment: 'sandbox',
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
})

console.log(JSON.stringify({memberId: member.id, customerId: customer.id, mandateId: mandate.id, subscriptionId: subscription.id, startDate, status: subscription.status}, null, 2))
