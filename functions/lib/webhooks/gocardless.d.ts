export declare function validGoCardlessSignature(raw: Buffer, received: string, secret: string): boolean;
export declare function paymentStatus(action: string): string | undefined;
export declare const goCardlessWebhook: import("firebase-functions/v2/https").HttpsFunction;
import '../config.js';
