export declare const goCardlessAccessToken: import("firebase-functions/params").SecretParam;
export declare const goCardlessWebhookSecret: import("firebase-functions/params").SecretParam;
export declare const goCardlessEnvironment: import("firebase-functions/params").StringParam;
export declare const appBaseUrl: import("firebase-functions/params").StringParam;
export declare function goCardlessRequest<T>(path: string, options?: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
}): Promise<T>;
export type BillingRequest = {
    id: string;
    status: string;
    metadata?: Record<string, string>;
    links?: {
        customer?: string;
    };
    payment_request?: {
        amount?: number;
        currency?: string;
        links?: {
            payment?: string;
        };
    };
    mandate_request?: {
        links?: {
            mandate?: string;
        };
    };
};
export type BillingRequestFlow = {
    id: string;
    authorisation_url: string;
};
