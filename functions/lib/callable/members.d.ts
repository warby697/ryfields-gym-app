export declare const createMember: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    id: string;
    memberNumber: string;
}>, unknown>;
export declare const updateMember: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const addMemberNote: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    id: string;
}>, unknown>;
export declare const updateOwnProfile: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const dismissAppWelcome: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const completeRegistration: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    memberId: string;
    memberNumber: string;
}>, unknown>;
export declare const createFreeAccount: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    memberId: string;
    memberNumber: string;
}>, unknown>;
export declare const selectMembershipPlan: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const claimMembership: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    memberId: string;
    memberNumber: any;
    firstName: any;
    lastName: any;
}>, unknown>;
export declare const setMemberChecked: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const linkMemberAccount: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const acknowledgeCancellation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const setMemberJourney: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const updateGoalProgress: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const grantClassCredits: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    classCredits: number;
}>, unknown>;
import '../config.js';
