import { type CallableRequest } from 'firebase-functions/v2/https';
export type StaffRole = 'staff' | 'admin';
export declare function requireStaff(request: CallableRequest): StaffRole;
export declare function requireAdmin(request: CallableRequest): 'admin';
export declare function requireClassStaff(request: CallableRequest): 'instructor' | 'staff' | 'admin';
