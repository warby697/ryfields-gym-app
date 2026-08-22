import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('member portal capacity safeguards',()=>{
  const portal=readFileSync('src/features/portal/MemberPortal.tsx','utf8')
  const bookings=readFileSync('src/features/portal/useMemberBookings.ts','utf8')
  const checkin=readFileSync('functions/src/callable/checkin.ts','utf8')
  const checkout=readFileSync('functions/src/scheduled/visits.ts','utf8')
  const rules=readFileSync('firestore.rules','utf8')

  it('queries bookings by member instead of scanning every future session',()=>{
    expect(bookings).toContain("collectionGroup(db,'bookings')")
    expect(bookings).toContain("where('memberId','==',memberId)")
    expect(bookings).toContain("where('status','in',['confirmed','waitlisted'])")
    expect(portal).not.toMatch(/classSessions[^\n]+limit\(100\)[^\n]+bookings/)
  })

  it('uses one realtime occupancy document with no per-device polling',()=>{
    expect(portal).toContain("doc(db,'gymStatus','current')")
    expect(portal).not.toContain("functions,'gymOccupancy'")
    expect(portal).not.toContain('setInterval(load,60000)')
  })

  it('updates and reconciles shared occupancy server-side',()=>{
    expect(checkin).toContain("collection('gymStatus').doc('current')")
    expect(checkout).toContain("collection('gymStatus').doc('current').set")
    expect(rules).toContain('match /gymStatus/{id} { allow read: if signedIn(); allow write: if false; }')
  })
})
