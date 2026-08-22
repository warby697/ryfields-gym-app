export declare function chooseBookingPlacement(bookedCount: number, capacity: number, waitlistCount: number): {
    status: "confirmed" | "waitlisted";
    position: number | null;
};
