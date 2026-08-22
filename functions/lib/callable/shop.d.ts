export declare function calculateUpgradeAmount(now: Date, renewal: Date): {
    amountMinor: number;
    remainingDays: number;
    cycleDays: number;
};
export declare const previewGymPlusUpgrade: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    amountMinor: number;
    remainingDays: number;
    cycleDays: number;
    renewalDate: string;
    oldSubscriptionId: string;
    mandateId: string;
}>, unknown>;
export declare const getStripeShopOrderStatus: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    status: string;
    productId: string;
    productName: string;
    fulfilmentType: string;
    amountMinor: number;
}>, unknown>;
export declare const createStripeShopCheckout: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    url: string;
}>, unknown>;
export declare const createStripeEventCheckout: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    url: string;
}>, unknown>;
export declare const confirmStripeEventCheckout: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    status: string;
}>, unknown>;
export declare const saveShopProduct: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    id: string;
}>, unknown>;
export declare const deleteShopProduct: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
}>, unknown>;
export declare const listShopOrders: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    orders: {
        id: string;
        productId: string;
        productName: string;
        memberId: string;
        memberName: string;
        amountMinor: number;
        fulfilmentStatus: string;
        paidAt: any;
        updatedAt: any;
    }[];
}>, unknown>;
export declare const updateShopOrderStatus: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    ok: boolean;
    status: "delivered" | "ordered" | "ready";
}>, unknown>;
