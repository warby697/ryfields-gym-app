export type MembershipStatus = 'pending_payment' | 'active' | 'suspended' | 'cancelled' | 'payment_failed'

export type Member = {
  id: string
  memberNumber: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  membershipTypeId: string
  membershipTypeName?: string
  membershipStatus: MembershipStatus
  createdAt?: { toDate(): Date } | Date
  staffChecked?: boolean
  authUid?: string
  needsReview?: boolean
  reviewReason?: string | null
  reviewRequestedAt?: { toDate(): Date } | Date | null
  paymentProvider?: string
  priceMinor?: number | null
  legacyPlanLabel?: string
  cashSchedule?: CashSchedule
  dob?: string
  addressLine?: string
  postcode?: string
  nextOfKin?: { name?: string; relationship?: string; phone?: string }
  medicalFlag?: boolean
  medicalDetails?: string
  parq?: Record<string, boolean>
  guardianEmail?: string
  cancellationAcknowledged?: boolean
  goal?: string
  firstVisitAt?: { toDate(): Date } | Date
  classCredits?: number
}

export const goalLabel: Record<string, string> = {
  weight_loss: 'Weight loss', muscle: 'Muscle building', fun: 'Fun & events', wellness: 'Wellness',
}

export type CashSchedule = {
  amountMinor: number
  intervalMonths: number
  nextDueAt?: { toDate(): Date } | Date
  lastPaidAt?: { toDate(): Date } | Date
  lastAmountMinor?: number
  active?: boolean
}

export type NewMember = Pick<Member, 'firstName' | 'lastName' | 'email' | 'phone' | 'membershipTypeId'>

export const statusLabel: Record<MembershipStatus, string> = {
  pending_payment: 'Pending payment', active: 'Active', suspended: 'Suspended',
  cancelled: 'Cancelled', payment_failed: 'Payment failed',
}
