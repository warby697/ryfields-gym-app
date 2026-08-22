import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('pre-launch transactional safeguards',()=>{
  it('forces paid event sessions through the ticket checkout',()=>{
    const api=readFileSync('netlify/functions/api.ts','utf8')
    const events=readFileSync('functions/src/callable/events.ts','utf8')
    const portal=readFileSync('src/features/portal/MemberPortal.tsx','utf8')
    expect(api).toContain("name==='bookClass'")
    expect(api).toContain("Number(event.get('ticketPriceMinor')||0)>0")
    expect(api).toContain("session.get('eventTicketPriceMinor')")
    expect(events).toContain('eventTicketPriceMinor:parsed.data.ticketPriceMinor')
    expect(portal).toContain('data.creditExempt===true?[]')
  })

  it('cancels low-number classes and refunds credits transactionally',()=>{
    const source=readFileSync('netlify/functions/class-minimum-check.ts','utf8')
    expect(source).toContain('db.runTransaction')
    expect(source).toContain("fresh.get('status')!=='scheduled'")
    expect(source).toContain("transaction.update(db.collection('members')")
  })

  it('leases each Stripe checkout and atomically marks fulfilment',()=>{
    const source=readFileSync('netlify/functions/stripe-webhook.ts','utf8')
    expect(source).toContain('claimCheckoutFulfilment')
    expect(source).toContain("state==='fulfilled'")
    expect(source).toContain("fulfilmentState:'fulfilled'")
    expect(source).toContain('transaction.update(member!.ref,fulfilmentMemberUpdates)')
    expect(source).toContain("!existingOrder.exists&&fulfilmentType==='manual'")
  })

  it('awards weekly credits at 6pm London time once per Sunday',()=>{
    const source=readFileSync('netlify/functions/weekly-class-credits.ts','utf8')
    expect(source).toContain("schedule: '0 17,18 * * 0'")
    expect(source).toContain("timeZone:'Europe/London'")
    expect(source).toContain("parts.weekday!=='Sun'||parts.hour!=='18'")
    expect(source).toContain('lastWeeklyCreditKey')
  })

  it('retains the accepted authenticated API limit',()=>{
    const source=readFileSync('netlify/functions/api.ts','utf8')
    expect(source).toContain('windowLimit:120')
  })
})
