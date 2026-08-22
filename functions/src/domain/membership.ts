export const membershipStatuses=['pending_payment','active','suspended','cancelled','payment_failed'] as const
export type MembershipStatus=typeof membershipStatuses[number]
const allowed:Record<MembershipStatus,MembershipStatus[]>={pending_payment:['active','cancelled'],active:['suspended','cancelled','payment_failed'],suspended:['active','cancelled'],cancelled:[],payment_failed:['active','suspended','cancelled']}
export function canTransitionMembership(from:MembershipStatus,to:MembershipStatus){return allowed[from].includes(to)}
