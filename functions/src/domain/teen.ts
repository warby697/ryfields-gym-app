// Teen membership guardian gating.
//
// A teen membership must be linked to a parent/guardian who is already an
// active adult member. This module holds the pure decision logic so it can be
// unit-tested in isolation from Firestore; the completeRegistration callable
// wires these helpers to the live query.

export const GUARDIAN_ELIGIBLE_TYPES = ['gym', 'gym_plus', 'annual'] as const
export const GUARDIAN_ELIGIBLE_STATUSES = ['active'] as const

export type GuardianCandidate = {
  id: string
  membershipTypeId?: unknown
  membershipStatus?: unknown
}

/** Does this membership require a linked adult guardian? */
export function requiresGuardian(membershipTypeId: string, requiresAdult?: boolean): boolean {
  return membershipTypeId === 'teen' || requiresAdult === true
}

/** Normalise a guardian email exactly as the query key is built (lowercase + trim). */
export function normaliseGuardianEmail(raw?: string | null): string {
  return (raw || '').toLowerCase().trim()
}

/** Is a single candidate an eligible guardian (active adult gym/plus/annual)? */
export function isEligibleGuardian(candidate: GuardianCandidate): boolean {
  return (
    GUARDIAN_ELIGIBLE_TYPES.includes(String(candidate.membershipTypeId) as (typeof GUARDIAN_ELIGIBLE_TYPES)[number]) &&
    GUARDIAN_ELIGIBLE_STATUSES.includes(String(candidate.membershipStatus) as (typeof GUARDIAN_ELIGIBLE_STATUSES)[number])
  )
}

/**
 * Pick the guardian from the members sharing the supplied email.
 * Returns the first eligible candidate, or undefined if none qualify.
 * (Mirrors the household case: several people can share one email; we bind to
 * the first active adult membership among them.)
 */
export function selectGuardian(candidates: GuardianCandidate[]): GuardianCandidate | undefined {
  return candidates.find(isEligibleGuardian)
}
