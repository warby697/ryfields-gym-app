export const membershipStatuses = ['pending_payment', 'active', 'suspended', 'cancelled', 'payment_failed'];
const allowed = { pending_payment: ['active', 'cancelled'], active: ['suspended', 'cancelled', 'payment_failed'], suspended: ['active', 'cancelled'], cancelled: [], payment_failed: ['active', 'suspended', 'cancelled'] };
export function canTransitionMembership(from, to) { return allowed[from].includes(to); }
