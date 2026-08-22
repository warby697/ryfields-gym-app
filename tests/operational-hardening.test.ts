import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'

const read=(path:string)=>readFileSync(path,'utf8')

describe('operational hardening',()=>{
  it('claims emails and uses provider idempotency',()=>{const source=read('netlify/functions/email-dispatch.ts');expect(source).toContain("status:'sending'");expect(source).toContain('leaseUntil');expect(source).toContain("'Idempotency-Key':`outbox/${item.id}`")})
  // Changed deliberately (owner decision, 19 Aug): a code stays usable until it
  // expires, rather than only while it is the one currently on screen. Rotation
  // and expiry are both 12h, so the old rule added no protection but refused
  // members mid-scan whenever the tablet reloaded, and blocked a second visit
  // in the same day. Expiry is the control that matters.
  it('expires the reception QR after 12h and accepts any unexpired code',()=>{const backend=read('functions/src/callable/checkin.ts'),ui=read('src/app/App.tsx');expect(backend).toContain('12*60*60_000');expect(backend).toContain("challenge.get('expiresAt')");expect(backend).not.toContain("display.get('challengeHash')!==hash");expect(ui).toContain('12*60*60_000')})
  it('retains history for 90 days and clears expired challenges',()=>{const source=read('netlify/functions/archive-cleanup.ts');expect(source).toContain('90 * 86_400_000');expect(source).toContain("collection('checkInChallenges')")})
  it('warns rather than silently displaying failed live data as empty',()=>{expect(read('src/lib/appStatus.tsx')).toContain('This is not the same as there being nothing there');expect(read('src/features/portal/useMemberBookings.ts')).not.toContain('current&&setItems([])');expect(read('src/features/portal/MemberShopPage.tsx')).toContain("reportDataError('the gym shop'")})
  it('has an explicit schema-first launch gate and stale-app update prompt',()=>{expect(read('package.json')).toContain('deploy:firestore-schema');expect(read('LAUNCH-CHECKLIST.md')).toContain('Firestore schema must be published before the Netlify app');expect(read('src/main.tsx')).toContain('onNeedRefresh')})
})
