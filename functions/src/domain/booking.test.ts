import { describe,expect,it } from 'vitest'
import { chooseBookingPlacement } from './booking.js'
describe('booking placement',()=>{it('confirms while space remains',()=>expect(chooseBookingPlacement(19,20,0)).toEqual({status:'confirmed',position:null}));it('waitlists at capacity in order',()=>expect(chooseBookingPlacement(20,20,4)).toEqual({status:'waitlisted',position:5}));it('rejects invalid counters',()=>expect(()=>chooseBookingPlacement(-1,20,0)).toThrow())})
