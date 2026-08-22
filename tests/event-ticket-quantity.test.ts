import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

// A ticket purchase touches four places: the checkout that reserves, the two
// fulfilment paths (browser return AND the async webhook) that convert the
// reservation into a booking, and the cleanup that releases abandoned holds.
// If any one of them forgets the quantity, capacity silently drifts and the
// event either oversells or strands seats. These guard that they stay in step.
const shop=readFileSync('functions/src/callable/shop.ts','utf8')
const webhook=readFileSync('netlify/functions/stripe-webhook.ts','utf8')
const cleanup=readFileSync('netlify/functions/event-reservation-cleanup.ts','utf8')
const register=readFileSync('src/features/auth/RegisterPage.tsx','utf8')

describe('event ticket quantity',()=>{
  it('accepts a bounded quantity on checkout',()=>{
    expect(shop).toContain('quantity:z.number().int().min(1).max(10).default(1)')
  })
  it('reserves and charges for every ticket, not just one',()=>{
    expect(shop).toContain("reservedTickets:FieldValue.increment(quantity)")
    expect(shop).toContain("'line_items[0][quantity]':String(quantity)")
    expect(shop).toContain('amountMinor:amount*quantity')
  })
  it('refuses to oversell the room',()=>{
    expect(shop).toContain('remaining=capacity-booked-reserved')
    expect(shop).toContain('if(quantity>remaining)')
  })
  it('moves the whole reservation into the booking on return from Stripe',()=>{
    expect(shop).toContain('reservedTickets:FieldValue.increment(-quantity),bookedCount:FieldValue.increment(quantity)')
    expect(shop).toContain('tickets:held+quantity')
  })
  it('does the same on the async webhook path',()=>{
    expect(webhook).toContain('reservedTickets:FieldValue.increment(-quantity),bookedCount:FieldValue.increment(quantity)')
    expect(webhook).toContain('tickets:held+quantity')
  })
  it('puts every held ticket back when a checkout is abandoned',()=>{
    expect(cleanup).toContain("reservedTickets:FieldValue.increment(-Number(fresh.get('quantity')||1))")
  })
  it('rolls back the full hold if Stripe never starts',()=>{
    expect(shop).toContain("FieldValue.increment(-Number(reservation.get('quantity')||1))")
  })
})

describe('ticket buyer sign-up',()=>{
  it('creates the member record and returns to the event without the onboarding fork',()=>{
    expect(register).toContain("destination.includes('event=')")
    expect(register).toContain("httpsCallable(functions,'createFreeAccount')")
    expect(register).toContain('navigate(destination,{replace:true})')
  })
})

// The confirmation email doubles as the ticket: it is what the buyer shows up
// with, and what the door checks the party size against.
const outbox=readFileSync('functions/src/shared/emailOutbox.ts','utf8')
const dispatch=readFileSync('netlify/functions/email-dispatch.ts','utf8')
const scan=readFileSync('netlify/functions/email-trigger-scan.ts','utf8')

describe('event ticket email',()=>{
  it('is a known email kind',()=>{
    expect(outbox).toContain("'event_ticket'")
  })
  it('carries when, where and how many, not just an amount',()=>{
    expect(dispatch).toContain("case'event_ticket'")
    expect(dispatch).toContain('WHEN:')
    expect(dispatch).toContain('WHERE:')
    expect(dispatch).toContain('TICKETS:')
  })
  it('sends the ticket instead of the generic shop receipt for event orders',()=>{
    expect(scan).toContain("isTicket=String(o.get('fulfilmentType')||'')==='event_ticket'")
    expect(scan).toContain("isTicket?'event_ticket':'shop_receipt'")
  })
  it('reads the real date and venue off the linked session',()=>{
    expect(scan).toContain("order.get('eventSessionId')")
    expect(scan).toContain("tickets:Number(order.get('quantity')||1)")
    expect(scan).toContain("locationSnapshot")
  })
})

// A failed check-in has several distinct causes (expired code, replaced code,
// already in, membership not active). Collapsing them into one message sent
// staff hunting a QR fault when the real cause was a cancelled membership.
const checkinFn=readFileSync('functions/src/callable/checkin.ts','utf8')
const portal=readFileSync('src/features/portal/MemberPortal.tsx','utf8')
const appShell=readFileSync('src/app/App.tsx','utf8')

describe('check-in failure messages',()=>{
  it('explains the entitlement problem rather than naming a status',()=>{
    // Superseded the cancelled/not-yet-active split: a member without a
    // membership may still hold a day pass or a booking, so the message covers
    // all three and tells them where to buy one.
    expect(checkinFn).toContain("active membership, day pass or class booking")
    expect(checkinFn).not.toContain("This membership is not active.")
  })
  it("keeps the kiosk code alive unattended and warns when it cannot",()=>{
    // The tablet sits in the gym for days with nobody there: a long setTimeout
    // is not a refresh strategy, because an idle iPad suspends timers.
    expect(appShell).toContain("RENEW_BEFORE=60*60_000")
    expect(appShell).toContain("visibilitychange")
    expect(appShell).toContain("qr-warning")
    expect(appShell).not.toContain("window.setTimeout(rotate,12*60*60_000)")
  })
  it('never blames the QR code for a membership problem',()=>{
    expect(portal).not.toContain('This code has expired or your membership cannot check in.')
  })
  it('surfaces the server reason to the member and to staff',()=>{
    expect(portal).toContain("err instanceof Error&&err.message?err.message")
    expect(appShell).toContain("}catch(err){setSuccess(err instanceof Error&&err.message?err.message")
  })
})

// Check-in must test entitlement, not just membership: a paid day pass or a
// booked class earns entry, and the pass is spent on the way in.
describe('check-in entitlement',()=>{
  it('accepts a membership, a day pass or a class booking',()=>{
    expect(checkinFn).toContain("status==='pending_payment'")
    expect(checkinFn).toContain("db.collection('dayPasses').where('purchasedByMemberId','==',memberId)")
    expect(checkinFn).toContain("const entitlement=membershipOk?'membership':forClass?'class_booking':'day_pass'")
  })
  it('spends the day pass on entry',()=>{
    expect(checkinFn).toContain("transaction.update(dayPassRef,{status:'used'")
  })
  it('tells the member what to do when they have none of them',()=>{
    expect(checkinFn).toContain("active membership, day pass or class booking")
    expect(checkinFn).toContain('visit the shop')
  })
  it('records every refused entry with a timestamp for the camera',()=>{
    expect(checkinFn).toContain("db.collection('checkInFailures').add")
    expect(checkinFn).toContain('recordCheckInFailure')
  })
})

// An unstaffed gym gives no feedback unless the tablet does: someone scanning
// with their phone should see the big screen acknowledge them.
describe('kiosk greeting',()=>{
  it('stamps one small feed doc rather than exposing every visit to the tablet',()=>{
    expect(checkinFn).toContain("db.collection('checkInFeed').doc('latest')")
    expect(checkinFn).toContain("outcome:'welcome'")
    expect(checkinFn).toContain("outcome:input.benign?'info':'problem'")
  })
  it("does not flash red or log a door problem for a harmless double scan",()=>{
    // "Already checked in" is thrown as an error but is not a problem: showing
    // it in red, or listing it for camera review, would be wrong on both counts.
    expect(checkinFn).toContain("benign:(error as{code?:string})?.code==='already-exists'")
    expect(checkinFn).toContain("input.benign?Promise.resolve():db.collection('checkInFailures').add")
  })
  it('greets by first name only',()=>{
    expect(checkinFn).toContain("firstName:member.get('firstName')")
    expect(checkinFn).not.toContain("feedRef,{outcome:'welcome',memberName")
  })
  it('ignores a stale feed doc on reload and clears itself',()=>{
    expect(appShell).toContain('Date.now()-at>20_000')
    expect(appShell).toContain('setGreeting(null),6000')
  })
})

// Someone scanning the QR while signed out lands on the login page. A member
// needs to know the scan worked; a non-member needs a route in rather than a
// password box and no explanation.
const login=readFileSync('src/features/auth/LoginPage.tsx','utf8')
describe('signed-out arrivals',()=>{
  it('recognises an event and a check-in separately',()=>{
    expect(login).toContain("const forEvent=returnTo.includes('event=')")
    expect(login).toContain("const forCheckIn=returnTo.includes('/check-in')")
  })
  it('never says "Welcome back" to someone who has never been',()=>{
    expect(login).toContain("forEvent?'Get your tickets':forCheckIn?'Almost there':'Welcome back'")
  })
  it('offers a non-member at the door a way in',()=>{
    expect(login).toContain('pick up a day pass in the shop')
  })
})

// Class attendance can be recorded two ways: the member scans at the door, or
// Becky ticks them off on the register. Both must leave the same trace.
const classesFn=readFileSync('functions/src/callable/classes.ts','utf8')
describe('register marks a visit too',()=>{
  it('records a class visit when staff mark someone present',()=>{
    expect(classesFn).toContain("entitlement:'class_booking'")
    expect(classesFn).toContain("visitType:'class'")
  })
  it('keeps class attendance off the gym busy count',()=>{
    expect(classesFn).toContain('countsTowardOccupancy:false')
  })
  it('does not double count someone who already scanned at the door',()=>{
    expect(classesFn).toContain("array-contains")
    expect(classesFn).toContain('existingVisits.empty')
  })
  it('only counts people who actually turned up',()=>{
    expect(classesFn).toContain('parsed.data.attended&&existingVisits.empty')
  })
})
