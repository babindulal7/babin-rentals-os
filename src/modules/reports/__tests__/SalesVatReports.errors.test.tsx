// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fixture=vi.hoisted(()=>({money:true,load:vi.fn()}))
vi.mock('../../../lib/moneyVisibility',()=>({useCanViewMoney:()=>fixture.money}))
vi.mock('../../../lib/device',()=>({useViewport:()=> 'phone'}))
vi.mock('../../../lib/queries/salesVatReports',()=>({getSalesVatReport:fixture.load}))
import SalesVatReports from '../SalesVatReports'
let container:HTMLDivElement,root:Root
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  fixture.money=true; fixture.load.mockReset(); fixture.load.mockRejectedValue(new Error('Read denied'))
  container=document.createElement('div'); document.body.append(container); root=createRoot(container)
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals()})
async function render(){await act(async()=>{root.render(<MemoryRouter><SalesVatReports /></MemoryRouter>)})}
describe('Sales/VAT failure and role boundaries',()=>{
  it('shows persistent error and Retry instead of zero figures or export',async()=>{
    await render()
    expect(container.textContent).toContain('Sales and VAT records could not be loaded')
    expect(container.textContent).not.toContain('Rs 0')
    expect(container.textContent).not.toContain('Export')
    const retry=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Retry'))
    expect(retry).toBeDefined()
    await act(async()=>retry!.click())
    expect(fixture.load).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Sales and VAT records could not be loaded')
  })
  it('does not issue financial reads for a money-blind role',async()=>{
    fixture.money=false; await render()
    expect(fixture.load).not.toHaveBeenCalled()
    expect(container.textContent).toContain('there is no version of this page your role can see')
  })
})
