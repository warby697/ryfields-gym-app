export declare const saveEmailTemplate: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const sendTemplateEmail: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const queueUrgentBroadcast: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    queued: number;
    broadcastId: string;
}>, unknown>;
import '../config.js';
