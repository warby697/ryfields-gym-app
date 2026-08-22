export declare const saveClassSession: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    id: string;
}>, unknown>;
export declare const cancelClassSession: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    refunded: number;
}>, unknown>;
export declare const bookClass: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    status: "confirmed" | "waitlisted";
    position: number | null;
}>, unknown>;
export declare const cancelClassBooking: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    promotedMemberId: string | null;
    forfeited: boolean;
}>, unknown>;
export declare const markClassAttendance: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const staffCancelClassBooking: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    refunded: boolean;
    promotedMemberId: string | null;
}>, unknown>;
import '../config.js';
