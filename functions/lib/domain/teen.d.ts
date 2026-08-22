export declare const GUARDIAN_ELIGIBLE_TYPES: readonly ['gym', 'gym_plus', 'annual'];
export declare const GUARDIAN_ELIGIBLE_STATUSES: readonly ['active'];
export type GuardianCandidate = {
    id: string;
    membershipTypeId?: unknown;
    membershipStatus?: unknown;
};
/** Does this membership require a linked adult guardian? */
export declare function requiresGuardian(membershipTypeId: string, requiresAdult?: boolean): boolean;
/** Normalise a guardian email exactly as the query key is built (lowercase + trim). */
export declare function normaliseGuardianEmail(raw?: string | null): string;
/** Is a single candidate an eligible guardian (active adult gym/plus/annual)? */
export declare function isEligibleGuardian(candidate: GuardianCandidate): boolean;
/**
 * Pick the guardian from the members sharing the supplied email.
 * Returns the first eligible candidate, or undefined if none qualify.
 * (Mirrors the household case: several people can share one email; we bind to
 * the first active adult membership among them.)
 */
export declare function selectGuardian(candidates: GuardianCandidate[]): GuardianCandidate | undefined;
