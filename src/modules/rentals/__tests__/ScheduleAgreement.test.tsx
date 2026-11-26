// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({prepare:vi.fn(),cancel:vi.fn(),rpc:vi.fn(),download:vi.fn(),getUser:vi.fn(),ready:vi.fn(),upload:vi.fn(),amendment:vi.fn(),user:{id:'owner',role:'Owner'}}))
vi.mock('../../../lib/auth',()=>({useAuth:()=>({user:state.user})}))
vi.mock('../../../lib/supabase',()=>({newClientUuid:()=>crypto.randomUUID(),supabase:{rpc:state.rpc,auth:{getUser:state.getUser},storage:{from:()=>({download:state.download})}}}))
vi.mock('../../../actions/rentals/rescheduleAgreement',()=>({prepareRescheduleAgreement:state.prepare,cancelRescheduleAgreement:state.cancel,readyRescheduleAgreement:state.ready,hashAgreement:vi.fn().mockResolvedValue('a'.repeat(64)),uploadAgreementEvidence:state.upload}))
vi.mock('../../../lib/scheduleAmendment',()=>({createScheduleAmendment:state.amendment}))
vi.mock('../modals/SignOnGlassModal',()=>({SignOnGlassModal:({isOpen,defaultName,onSignComplete}:{isOpen:boolean;defaultName:string;onSignComplete:(signature:{name:string;role:string;atIso:string;dataUrl:string;mode:'draw'})=>void})=>isOpen?<button type="button" onClick={()=>onSignComplete({name:defaultName,role:'receiver',atIso:'2027-01-01T10:00:00Z',dataUrl:'data:image/png;base64,c2lnbmF0dXJl',mode:'draw'})}>Capture drawn signature</button>:null}))
import { ScheduleAgreement } from '../components/ScheduleAgreement'
;(globalThis as Record<string,unknown>)['IS_REACT_ACT_ENVIRONMENT']=true
describe('schedule agreement requirements',()=>{
 let host:HTMLDivElement,root:Root
 const ready=vi.fn()
 const render=(pickupAt='2027-01-02T00:15:00Z',returnAt='2027-01-04T00:15:00Z')=>root.render(<ScheduleAgreement bookingId="booking" expectedRevision="revision" pickupAt={pickupAt} returnAt={returnAt} onProposalReady={ready}/> )
 beforeEach(()=>{
  state.prepare.mockReset();state.rpc.mockReset();state.download.mockReset();state.cancel.mockReset().mockResolvedValue(undefined)
  state.getUser.mockReset().mockResolvedValue({data:{user:{id:'owner'}},error:null})
  state.ready.mockReset().mockResolvedValue({ready:true})
  state.upload.mockReset().mockImplementation(async(_blob:unknown,_extension:unknown,path:unknown)=>String(path))
  state.amendment.mockReset().mockResolvedValue(new NodeBlob(['%PDF-1.4 drawn amendment'],{type:'application/pdf'}))
  vi.stubGlobal('URL',class extends URL {static createObjectURL(){return 'blob:agreement-preview'}static revokeObjectURL(){return undefined}})
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({blob:async()=>new NodeBlob(['signature'],{type:'image/png'})}))
  ready.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host)
 })
 afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()})
 function control(label:string):HTMLInputElement {
  const field=[...host.querySelectorAll('label')].find(node=>node.firstChild?.textContent===label)?.querySelector('input')
  if(!field)throw new Error('Missing input: '+label)
  return field
 }
 function button(label:string):HTMLButtonElement {
  const target=[...document.querySelectorAll('button')].find(node=>node.textContent?.trim()===label)
  if(!target)throw new Error('Missing button: '+label)
  return target
 }
 async function enter(label:string,value:string){await act(async()=>{
  const input=control(label)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value)
  input.dispatchEvent(new Event('input',{bubbles:true}))
 })}
 async function uploadPdf(){await act(async()=>{
  const file=control('Upload newly signed PDF')
  Object.defineProperty(file,'files',{configurable:true,value:[new NodeBlob(['%PDF-1.4 signed upload'],{type:'application/pdf'})]})
  file.dispatchEvent(new Event('change',{bubbles:true}))
 })}
 async function acknowledge(){await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())}
 function signedOriginal(){
  state.rpc.mockResolvedValue({data:'staff/owner/original.pdf',error:null})
  state.download.mockResolvedValue({data:new NodeBlob(['%PDF-1.4 original agreement'],{type:'application/pdf'}),error:null})
 }
 it('enables only confirmed unsigned requirements',async()=>{
  state.prepare.mockResolvedValue({required:false})
  await act(async()=>render())
  expect(ready).toHaveBeenLastCalledWith(null,true)
  expect(host.textContent).toContain('No signed agreement needs replacement')
 })
 it('refuses an HTML original before creating an embedded preview',async()=>{
  state.prepare.mockResolvedValue({required:true,proposalId:'proposal',originalDocumentId:'original'})
  state.rpc.mockResolvedValue({data:'staff/owner/original.pdf',error:null})
  state.download.mockResolvedValue({data:new NodeBlob(['<html><script>bad()</script></html>'],{type:'text/html'}),error:null})
  await act(async()=>render())
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('not a readable PDF')
  expect(host.querySelector('iframe')).toBeNull()
  expect(ready.mock.calls.some(call=>call[1]===true)).toBe(false)
 })
 it('ignores requirements arriving after a different date selection',async()=>{
  let finish:((value:{required:boolean})=>void)|undefined
  state.prepare.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce({required:false})
  await act(async()=>render())
  await act(async()=>render('2027-01-03T00:15:00Z'))
  expect(ready).toHaveBeenLastCalledWith(null,true)
  const count=ready.mock.calls.length
  await act(async()=>finish?.({required:true}))
  expect(ready).toHaveBeenCalledTimes(count)
  expect(host.textContent).toContain('No signed agreement needs replacement')
 })
 it('ignores a save whose authentication arrives after the proposal dates change',async()=>{
  signedOriginal()
  state.prepare.mockResolvedValueOnce({required:true,proposalId:'proposal-a',originalDocumentId:'original'})
   .mockResolvedValueOnce({required:true,proposalId:'proposal-b',originalDocumentId:'original'})
  let finishAuth:((value:{data:{user:{id:string}};error:null})=>void)|undefined
  state.getUser.mockImplementationOnce(()=>new Promise(resolve=>{finishAuth=resolve}))
  await act(async()=>render())
  await enter('Signer name','Asha Rai');await enter('Signer capacity','Client representative');await acknowledge();await uploadPdf()
  await act(async()=>button('Save signed replacement').click())
  expect(state.getUser).toHaveBeenCalledOnce()
  await act(async()=>render('2027-01-03T00:15:00Z','2027-01-05T00:15:00Z'))
  await act(async()=>finishAuth?.({data:{user:{id:'owner'}},error:null}))
  expect(state.upload).not.toHaveBeenCalled()
  expect(state.ready).not.toHaveBeenCalled()
  expect(ready.mock.calls.some(call=>call[0]==='proposal-a'&&call[1]===true)).toBe(false)
  // The new proposal must still save under its own path, without old refs poisoning its retry.
  await enter('Signer name','Asha Rai');await enter('Signer capacity','Client representative');await acknowledge();await uploadPdf()
  await act(async()=>button('Save signed replacement').click())
  expect(state.upload).toHaveBeenCalledWith(expect.anything(),'pdf','staff/owner/proposal-b-agreement.pdf')
  expect(state.ready).toHaveBeenCalledWith(expect.objectContaining({proposalId:'proposal-b',pdfPath:'staff/owner/proposal-b-agreement.pdf'}),expect.anything())
  expect(ready).toHaveBeenLastCalledWith('proposal-b',true)
 })
 it('locks evidence and signer controls while a drawn amendment is still rendering',async()=>{
  signedOriginal()
  state.prepare.mockResolvedValue({required:true,proposalId:'proposal-a',originalDocumentId:'original'})
  let finishCapture:((value:NodeBlob)=>void)|undefined
  state.amendment.mockImplementationOnce(()=>new Promise(resolve=>{finishCapture=resolve}))
  await act(async()=>render())
  await enter('Signer name','Asha Rai');await enter('Signer capacity','Client representative');await acknowledge()
  await act(async()=>button('Sign on this device').click())
  await act(async()=>button('Capture drawn signature').click())
  expect(state.amendment).toHaveBeenCalledOnce()
  expect(control('Upload newly signed PDF').disabled).toBe(true)
  expect(control('Signer name').disabled).toBe(true)
  expect(control('Signer capacity').disabled).toBe(true)
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true)
  expect(button('Sign on this device').disabled).toBe(true)
  expect(state.ready).not.toHaveBeenCalled()
  await act(async()=>finishCapture?.(new NodeBlob(['%PDF-1.4 drawn amendment'],{type:'application/pdf'})))
  expect(control('Upload newly signed PDF').disabled).toBe(false)
  expect(control('Signer name').value).toBe('Asha Rai')
  expect(button('Save signed replacement').disabled).toBe(false)
 })

})
