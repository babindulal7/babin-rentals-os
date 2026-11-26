import { beforeEach,describe,expect,it,vi } from 'vitest'
import { parseCalendarResources, listCalendarResources } from '../calendarResources'
const db=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../../supabase',()=>({supabase:{rpc:db.rpc}}))
vi.mock('../../settingsStore',()=>({getSetting:()=> '06:00'}))
function payload(){return {resources:[{id:'unit:u1',type:'Equipment',name:'Recorded camera',code:'CAM-1',meta:'In Stock · Good'}],allocations:[{id:'hold:h1',resource_id:'unit:u1',booking_id:'b1',booking_no:'BK-2027-0001',stage:'Booked',start_at:'2027-01-10T01:00:00Z',end_at:'2027-01-10T03:00:00Z',quantity:1}],sources:[{id:'serialized',status:'complete',count:1},{id:'warehouse-bays',status:'unavailable',reason:'No allocation contract'}]}}
beforeEach(()=>db.rpc.mockReset())
describe('Verified Calendar resource read',()=>{
 it('preserves exact intervals separately from display days',()=>{const result=parseCalendarResources(payload());expect(result.bars[0]?.intervalStart).toBe('2027-01-10T01:00:00Z');expect(result.bars[0]?.from.toISOString()).toBe('2027-01-10T00:00:00.000Z');expect(result.catalogue[0]?.id).toBe('unit:u1')})
 it('retains unavailable source states without coercing them into zero resources',()=>expect(parseCalendarResources(payload()).sources[1]).toEqual({id:'warehouse-bays',status:'unavailable',reason:'No allocation contract'}))
 it('rejects an allocation without an authoritative lane',()=>{const data=payload();data.allocations[0]!.resource_id='invented';expect(()=>parseCalendarResources(data)).toThrow(/verified resource/)})
 it('rejects duplicate resource identity rather than merging by label',()=>{const data=payload();data.resources.push(data.resources[0]!);expect(()=>parseCalendarResources(data)).toThrow(/duplicated/)})
 it('rejects unknown source completeness and partial responses',()=>{expect(()=>parseCalendarResources({resources:[],allocations:[]})).toThrow(/not confirmed/);const data=payload();data.sources[0]!.status='unknown';expect(()=>parseCalendarResources(data)).toThrow(/completeness/)})
 it('rejects invalid intervals or quantities',()=>{const data=payload();data.allocations[0]!.end_at=data.allocations[0]!.start_at;expect(()=>parseCalendarResources(data)).toThrow(/invalid time/);data.allocations[0]!.end_at='2027-01-10T03:00:00Z';data.allocations[0]!.quantity=0;expect(()=>parseCalendarResources(data)).toThrow(/quantity/)})
 it('requests one money-free aggregate over exact operational-day bounds',async()=>{db.rpc.mockResolvedValue({data:payload(),error:null});await listCalendarResources('2027-01-10','2027-01-11');expect(db.rpc).toHaveBeenCalledWith('calendar_resource_window',{p_from:'2027-01-10T06:00:00.000+05:45',p_to:'2027-01-12T00:15:00.000Z'})})
 it('surfaces server read failures as unknown availability',async()=>{db.rpc.mockResolvedValue({data:null,error:{message:'source denied'}});await expect(listCalendarResources('2027-01-10','2027-01-11')).rejects.toThrow(/unavailable/ )})
})
