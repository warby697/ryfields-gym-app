export declare const setCashSchedule: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const recordCashPayment: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
    amount: string;
    nextDueAt: string;
}>, unknown>;
import '../config.js';
