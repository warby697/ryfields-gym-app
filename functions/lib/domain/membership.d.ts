export declare const membershipStatuses: readonly ['pending_payment', 'active', 'suspended', 'cancelled', 'payment_failed'];
export type MembershipStatus = typeof membershipStatuses[number];
export declare function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean;
