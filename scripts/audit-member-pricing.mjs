// READ-ONLY. Reconciles each active member's DISPLAYED price (member.priceMinor
// falling back to the plan price) against what they ACTUALLY pay by direct debit.
//
// Deliberately conservative. A member is only classed CLEAR when every real
// membership collection on their record agrees on one amount and that amount
// cannot be explained by a household member's price (a parent's mandate often
// collects a teen's £10). Everything else is left for a human.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) })
const db = getFirestore()
const money = m => (m == null ? '-' : `£${(m / 100).toFixed(2).replace(/\.00$/, '')}`)
// Fees and reversals are not membership collections.
const REAL = new Set(['paid_out', 'confirmed', 'submitted', 'created'])

const [members, types, payments] = await Promise.all([
  db.collection('members').get(), db.collection('membershipTypes').get(), db.collection('payments').get(),
])
const plan = Object.fromEntries(types.docs.map(d => [d.id, { price: Number(d.get('priceMinor') || 0), interval: String(d.get('billingInterval') || 'monthly') }]))
const displayedOf = m => { const own = m.get('priceMinor'); return typeof own === 'number' ? own : plan[String(m.get('membershipTypeId') || '')]?.price }

// Household = shares an email or a GoCardless customer id.
const houses = new Map()
for (const m of members.docs) for (const k of [String(m.get('email') || '').toLowerCase(), String(m.get('gocardlessCustomerId') || '')]) {
  if (!k) continue; if (!houses.has(k)) houses.set(k, new Set()); houses.get(k).add(m.id)
}
const householdOf = m => { const out = new Set()
  for (const k of [String(m.get('email') || '').toLowerCase(), String(m.get('gocardlessCustomerId') || '')]) for (const id of houses.get(k) || []) if (id !== m.id) out.add(id)
  return [...out].map(id => members.docs.find(d => d.id === id)).filter(Boolean) }

const paysOf = new Map()
for (const p of payments.docs) {
  if (String(p.get('provider')) !== 'gocardless' || !REAL.has(String(p.get('status')))) continue
  const id = String(p.get('memberId') || ''), amt = Number(p.get('amountMinor') || 0)
  if (!id || !amt) continue
  if (!paysOf.has(id)) paysOf.set(id, []); paysOf.get(id).push(amt)
}

const clear = [], ambiguous = [], ok = [], nodata = []
for (const m of members.docs) {
  if (!['active', 'payment_failed'].includes(String(m.get('membershipStatus') || ''))) continue
  const typeId = String(m.get('membershipTypeId') || ''), displayed = displayedOf(m)
  const amounts = [...new Set(paysOf.get(m.id) || [])]
  const row = { id: m.id, name: `${m.get('firstName') || ''} ${m.get('lastName') || ''}`.trim(), typeId, displayed, amounts,
    ownSet: typeof m.get('priceMinor') === 'number', count: (paysOf.get(m.id) || []).length }
  if (!amounts.length) { nodata.push(row); continue }
  if (amounts.length === 1 && amounts[0] === displayed) { ok.push(row); continue }
  const house = householdOf(m)
  const housePrices = new Set(house.map(displayedOf).filter(v => typeof v === 'number'))
  row.house = house.map(h => `${h.get('firstName')} ${h.get('lastName')}@${money(displayedOf(h))}`)
  if (plan[typeId]?.interval === 'annual') { row.why = 'annual billing, monthly comparison invalid'; ambiguous.push(row); continue }
  if (amounts.length > 1) { row.why = `${amounts.length} different amounts collected`; ambiguous.push(row); continue }
  if (housePrices.has(amounts[0])) { row.why = `£${amounts[0]/100} matches a household member's price, likely their payment on this mandate`; ambiguous.push(row); continue }
  if (row.count < 2 && displayed != null && amounts[0] > displayed) { row.why = 'single payment ABOVE displayed price'; ambiguous.push(row); continue }
  clear.push(row)
}
const line = r => `  ${r.name.padEnd(24)} ${r.typeId.padEnd(9)} displayed=${money(r.displayed).padEnd(7)} paid=${r.amounts.map(money).join('/').padEnd(14)} n=${String(r.count).padEnd(3)} ${r.ownSet ? 'override set' : 'NO override'}  ${r.id}${r.why ? `\n      ^ ${r.why}${r.house?.length ? ` | household: ${r.house.join(', ')}` : ''}` : ''}`
console.log(`active=${ok.length + clear.length + ambiguous.length + nodata.length}  already correct=${ok.length}  no DD history=${nodata.length}`)
console.log(`\n=== CLEAR MISMATCHES — safe to fix (${clear.length}) ===`); clear.forEach(r => console.log(line(r)))
console.log(`\n=== AMBIGUOUS — needs a human (${ambiguous.length}) ===`); ambiguous.forEach(r => console.log(line(r)))
console.log('\nFIX SET:', JSON.stringify(Object.fromEntries(clear.map(r => [r.id, r.amounts[0]]))))
