import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture=vi.hoisted(()=>({error:null as {message:string}|null}))
vi.mock('../../supabase',()=>({IS_MOCK:false,supabase:{from:()=>{
  const query:Record<string,unknown>={}
  const result=()=>({data:fixture.error?null:[],error:fixture.error,count:0})
  for(const key of ['select','order','is','eq','gte','lte','range','limit','in'])query[key]=()=>query
  query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)
  return query
}}}))
import { getSalesVatReport } from '../salesVatReports'
beforeEach(()=>{fixture.error=null})
describe('WF-01 live financial report truth',()=>{
  it('preserves a genuinely empty period without sample invoices or tax rows',async()=>{
    const report=await getSalesVatReport()
    expect(report.sales.metrics.invoiceCount).toBe(0)
    expect(report.sales.invoices).toEqual([])
    expect(report.vat.monthlySchedule).toEqual([])
  })
  it('refuses an unavailable read rather than reporting zero financial activity',async()=>{
    fixture.error={message:'Permission denied'}
    await expect(getSalesVatReport()).rejects.toThrow()
  })
})
