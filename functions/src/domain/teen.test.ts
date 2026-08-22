import { describe, expect, it } from 'vitest'
import { requiresGuardian, normaliseGuardianEmail, isEligibleGuardian, selectGuardian, type GuardianCandidate } from './teen.js'

describe('requiresGuardian', () => {
  it('gates the teen membership id', () => { expect(requiresGuardian('teen')).toBe(true) })
  it('gates any type flagged requiresAdult', () => { expect(requiresGuardian('junior', true)).toBe(true) })
  it('does not gate a normal adult plan', () => {
    expect(requiresGuardian('gym')).toBe(false)
    expect(requiresGuardian('gym_plus', false)).toBe(false)
    expect(requiresGuardian('annual', undefined)).toBe(false)
  })
  it('only treats an explicit true as the flag (not truthy values)', () => {
    // typeSnap.get('requiresAdult') is passed as `=== true`, so anything else is false
    expect(requiresGuardian('gym', undefined)).toBe(false)
  })
})

describe('normaliseGuardianEmail', () => {
  it('lowercases and trims to match the stored query key', () => {
    expect(normaliseGuardianEmail('  Parent@Example.COM ')).toBe('parent@example.com')
  })
  it('handles missing / null / empty input', () => {
    expect(normaliseGuardianEmail(undefined)).toBe('')
    expect(normaliseGuardianEmail(null)).toBe('')
    expect(normaliseGuardianEmail('')).toBe('')
    expect(normaliseGuardianEmail('   ')).toBe('')
  })
})

describe('isEligibleGuardian', () => {
  const active = (membershipTypeId: string, membershipStatus = 'active') => ({ id: 'x', membershipTypeId, membershipStatus })
  it('accepts active gym, gym_plus and annual adults', () => {
    expect(isEligibleGuardian(active('gym'))).toBe(true)
    expect(isEligibleGuardian(active('gym_plus'))).toBe(true)
    expect(isEligibleGuardian(active('annual'))).toBe(true)
  })
  it('rejects a teen as a guardian (no chain of teens)', () => {
    expect(isEligibleGuardian(active('teen'))).toBe(false)
  })
  it('rejects comp / blank / unknown membership types', () => {
    expect(isEligibleGuardian(active('comp'))).toBe(false)
    expect(isEligibleGuardian(active(''))).toBe(false)
    expect(isEligibleGuardian({ id: 'x', membershipStatus: 'active' })).toBe(false)
  })
  it('rejects a non-active adult (pending / suspended / cancelled / payment_failed)', () => {
    // Documents CURRENT behaviour: only status === active qualifies.
    for (const s of ['pending_payment', 'suspended', 'cancelled', 'payment_failed']) {
      expect(isEligibleGuardian(active('gym', s))).toBe(false)
    }
  })
  it('is defensive against missing status field', () => {
    expect(isEligibleGuardian({ id: 'x', membershipTypeId: 'gym' })).toBe(false)
  })
})

describe('selectGuardian', () => {
  const c = (id: string, membershipTypeId: string, membershipStatus = 'active'): GuardianCandidate => ({ id, membershipTypeId, membershipStatus })

  it('returns undefined when nobody shares the email', () => {
    expect(selectGuardian([])).toBeUndefined()
  })
  it('returns undefined when the only match is not an eligible adult', () => {
    expect(selectGuardian([c('t1', 'teen')])).toBeUndefined()
    expect(selectGuardian([c('a1', 'gym', 'cancelled')])).toBeUndefined()
  })
  it('finds the single eligible adult', () => {
    expect(selectGuardian([c('a1', 'gym')])?.id).toBe('a1')
  })
  it('household: picks the first active adult when several share one email', () => {
    // e.g. helensergeant11@gmail.com -> Helen(gym/active), Maddison-Mai(teen), Demi-Lei(teen)
    const found = selectGuardian([c('teen1', 'teen'), c('helen', 'gym'), c('teen2', 'teen')])
    expect(found?.id).toBe('helen')
  })
  it('household with a non-adult first: skips ineligible and binds the adult', () => {
    // e.g. cobbers74@gmail.com -> Lillie(teen/active), Matt(gym/active)
    expect(selectGuardian([c('lillie', 'teen'), c('matt', 'gym')])?.id).toBe('matt')
  })
  it('skips an inactive adult in favour of an active one at the same email', () => {
    expect(selectGuardian([c('lapsed', 'gym', 'cancelled'), c('paying', 'annual', 'active')])?.id).toBe('paying')
  })
  it('annual guardian (never in the monthly feeds) still qualifies', () => {
    // e.g. geoffhenshaw52@gmail.com -> Geoff(annual/active) guardian for the Henshaw teens
    expect(selectGuardian([c('teen1', 'teen'), c('geoff', 'annual'), c('teen2', 'teen')])?.id).toBe('geoff')
  })
})
