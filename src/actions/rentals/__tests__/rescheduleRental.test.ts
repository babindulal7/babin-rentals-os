import {beforeEach,describe,expect,it,vi} from 'vitest'
import {rescheduleRentalConfig,type RescheduleRentalInput} from '../rescheduleRental'
const db=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../../../lib/supabase',()=>({supabase:{rpc:db.rpc}}))
const input:RescheduleRentalInput={bookingId:'b1',expectedRevision:'2027-01-01T00:00:00Z',shiftDays:2,reason:'Client moved the shooting date',clientUuid:'request-1'}
const ctx={userId:'actor',role:'Owner' as const,isOnline:true}
beforeEach(()=>db.rpc.mockReset())
describe('Guarded Calendar reschedule action',()=>{
 it('requires its explicit capability and online role',async()=>{expect(rescheduleRentalConfig.permissions).toEqual(['rental.reschedule']);await expect(rescheduleRentalConfig.execute(input,{...ctx,role:'Warehouse'})).rejects.toThrow(/cannot reschedule/);await expect(rescheduleRentalConfig.execute(input,{...ctx,isOnline:false})).rejects.toThrow(/Connect/);expect(db.rpc).not.toHaveBeenCalled()})
 it('rejects missing revision, same day, fractional shift and short reason',()=>{for(const patch of [{expectedRevision:''},{shiftDays:0},{shiftDays:0.5},{reason:'short'}])expect(()=>rescheduleRentalConfig.validate({...input,...patch})).toThrow()})
 it('passes revision, stable UUID and replacement proposal through one RPC',async()=>{db.rpc.mockResolvedValue({data:{id:'b1',booking_no:'BK-1',pickup_at:'2027-01-12T01:00:00Z',return_at:'2027-01-13T01:00:00Z',revision:'new'},error:null});const saved=await rescheduleRentalConfig.execute({...input,agreementProposalId:'proposal'},ctx);expect(saved.result.pickupAt).toBe('2027-01-12T01:00:00Z');expect(db.rpc).toHaveBeenCalledWith('reschedule_rental',{p_booking_id:'b1',p_revision:input.expectedRevision,p_shift_days:2,p_reason:input.reason,p_key:'request-1',p_agreement_proposal:'proposal'})})
 it('preserves server refusal rather than emitting success',async()=>{db.rpc.mockResolvedValue({data:null,error:{message:'assigned unit conflicts'}});await expect(rescheduleRentalConfig.execute(input,ctx)).rejects.toThrow(/conflicts/)})
 it('refuses a response for another rental or missing saved schedule',async()=>{for(const data of [null,{id:'other',booking_no:'BK-1',revision:'new'},{id:'b1',booking_no:'BK-1',revision:'new',pickup_at:'invalid',return_at:'invalid'}]){db.rpc.mockResolvedValue({data,error:null});await expect(rescheduleRentalConfig.execute(input,ctx)).rejects.toThrow(/confirmed/)}})
})
