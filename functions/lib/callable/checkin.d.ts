export declare const createCheckInChallenge: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    token: string;
    expiresAt: number;
}>, unknown>;
export declare const memberCheckIn: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    visitId: string;
    memberName: string;
    scheduledCheckoutAt: number;
    paymentWarning: boolean;
    entitlement: string;
    classes: string[];
}>, unknown>;
export declare const searchCheckInMembers: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    members: {
        id: string;
        name: string;
        plan: string;
        status: string;
    }[];
}>, unknown>;
export declare const staffCheckIn: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    visitId: string;
    memberName: string;
    scheduledCheckoutAt: number;
    paymentWarning: boolean;
    entitlement: string;
    classes: string[];
}>, unknown>;
import '../config.js';
