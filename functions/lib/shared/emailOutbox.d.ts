import { type Firestore } from 'firebase-admin/firestore';
export type TransactionalEmailKind = 'class_cancelled' | 'class_changed' | 'waitlist_promoted' | 'membership_started' | 'membership_upgraded' | 'membership_cancelled' | 'payment_failed' | 'shop_receipt' | 'event_ticket' | 'shop_staff_order' | 'shop_order_ready' | 'shop_refund' | 'direct_debit_problem' | 'urgent_notice';
export declare function queueEmail(db: Firestore, id: string, input: {
    kind: TransactionalEmailKind;
    to: string;
    firstName?: string;
    variables?: Record<string, string | number | boolean | null>;
    signoff?: string;
}): Promise<void>;
