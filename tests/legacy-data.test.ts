import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('legacy data remains visible',()=>{
  it('treats missing active flags as active across customer views',()=>{
    const onboarding=readFileSync('src/features/onboarding/Onboarding.tsx','utf8')
    const portal=readFileSync('src/features/portal/MemberPortal.tsx','utf8')
    expect(onboarding).toContain('p.active!==false')
    expect(portal).toContain('ev.active!==false')
    expect(portal).not.toContain("where('active','==',true)")
  })

  it('applies noticeboard display dates and paid-ticket reservations consistently',()=>{
    const portal=readFileSync('src/features/portal/MemberPortal.tsx','utf8')
    expect(portal).toContain('!ev.startsOn||ev.startsOn<=today')
    expect(portal).toContain('!ev.endsOn||ev.endsOn>=today')
    expect(portal).toContain('session.capacity-session.bookedCount-session.reservedTickets')
  })
})
