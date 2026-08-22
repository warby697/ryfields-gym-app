import { describe, expect, it } from 'vitest';
import { calculateUpgradeAmount } from './shop.js';
describe('Gym Plus pro-rata calculation', () => {
    it('charges half of the £15 difference for half a 30-day cycle', () => { expect(calculateUpgradeAmount(new Date('2026-07-15T12:00:00Z'), new Date('2026-07-30T12:00:00Z'))).toMatchObject({ amountMinor: 750, remainingDays: 15, cycleDays: 30 }); });
    it('handles a longer month without exceeding £15', () => { expect(calculateUpgradeAmount(new Date('2026-07-01T12:00:00Z'), new Date('2026-08-01T12:00:00Z')).amountMinor).toBe(1500); });
});
