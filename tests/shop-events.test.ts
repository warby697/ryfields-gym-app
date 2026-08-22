import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

describe('customer shop events',()=>{
  it('includes legacy bookable events that predate the event type field',()=>{
    const source=readFileSync('src/features/portal/MemberShopPage.tsx','utf8')
    expect(source).toContain("item.type==='event'||Boolean(item.sessionId)")
    expect(source).toContain('eventSummary(event.body)')
    expect(source).not.toContain("<p>{event.body||'See what’s happening at Ryfields Gym.'}</p>")
    expect(source).toContain("item.get('description')||item.get('body')||''")
    expect(source).toContain("item.get('amountMinor')??item.get('priceMinor')??item.get('price')??0")
  })
})
