import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jpegPagePdf } from '../scheduleAmendment'
import { prepareRescheduleAgreement, readyRescheduleAgreement } from '../../actions/rentals/rescheduleAgreement'
const mocked=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../supabase',()=>({supabase:{rpc:mocked.rpc},newClientUuid:()=>crypto.randomUUID()}))
const context={userId:'owner',role:'Owner' as const,isOnline:true}
const input={bookingId:'booking',expectedRevision:'revision',pickupAt:'2027-01-02T00:15:00Z',returnAt:'2027-01-03T00:15:00Z',clientUuid:'proposal'}
describe('reschedule agreement confirmation boundary',()=>{
 beforeEach(()=>mocked.rpc.mockReset())
 it('requires explicit readable agreement requirements',async()=>{
  mocked.rpc.mockResolvedValue({data:null,error:null})
  await expect(prepareRescheduleAgreement(input,context)).rejects.toThrow('could not be verified')
 })
 it('does not let money-blind staff create agreement proposals',async()=>{
  await expect(prepareRescheduleAgreement(input,{...context,role:'Warehouse'})).rejects.toThrow('cannot replace')
  expect(mocked.rpc).not.toHaveBeenCalled()
 })
 it('does not queue offline agreement changes',async()=>{
  await expect(prepareRescheduleAgreement(input,{...context,isOnline:false})).rejects.toThrow('Connect')
  expect(mocked.rpc).not.toHaveBeenCalled()
 })
 it('requires confirmed original identity when a signature exists',async()=>{
  mocked.rpc.mockResolvedValue({data:{required:true,proposalId:'proposal'},error:null})
  await expect(prepareRescheduleAgreement(input,context)).rejects.toThrow('not confirmed')
 })
 it('allows confirmed unsigned requirements without inventing a signature',async()=>{
  mocked.rpc.mockResolvedValue({data:{required:false},error:null})
  expect(await prepareRescheduleAgreement(input,context)).toEqual({required:false})
 })
 it('refuses a ready response for another proposal',async()=>{
  mocked.rpc.mockResolvedValue({data:{ready:true,proposalId:'different'},error:null})
  await expect(readyRescheduleAgreement({proposalId:'proposal',method:'upload',signerName:'Signer',signerRole:'Client',originalHash:'a'.repeat(64),pdfPath:'staff/owner/signed.pdf',pdfHash:'b'.repeat(64),signaturePath:null},context)).rejects.toThrow('not confirmed')
 })
})
describe('signed amendment binary document',()=>{
 it('writes accurate object offsets and preserves actual image bytes',()=>{
  const image=new Uint8Array([255,216,255,224,0,255,217])
  const bytes=jpegPagePdf(image,1240,1754),pdf=new TextDecoder('latin1').decode(bytes)
  expect(pdf.startsWith('%PDF-1.4')).toBe(true)
  const xref=pdf.indexOf('xref\n')
  const offset=Number(pdf.match(/startxref\n(\d+)/)?.[1])
  expect(offset).toBe(xref)
  const entries=pdf.slice(xref).split('\n').slice(3,8)
  entries.forEach((entry,index)=>expect(pdf.slice(Number(entry.slice(0,10)))).toMatch(new RegExp('^'+(index+1)+' 0 obj')))
  const start=pdf.indexOf('stream\n')+7
  expect([...bytes.slice(start,start+image.length)]).toEqual([...image])
 })
})
