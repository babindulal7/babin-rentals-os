// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Header from '../../shell/Header'
import { WorkspaceProvider } from '../../../lib/workspaceContext'
import { PageHeader } from '../header/PageHeader'
import { RecordActions } from '../RecordWorkspace'

const state = vi.hoisted(() => ({ viewport:'desktop',mock:false }))
vi.mock('../../../lib/device', () => ({useViewport:()=>state.viewport}))
vi.mock('../../../lib/auth', () => ({useAuth:()=>({user:{name:'Operator',role:'Owner'},logout:vi.fn(),lockNow:vi.fn(),hasPin:false})}))
vi.mock('../../../lib/supabase', () => ({get IS_MOCK(){return state.mock}, supabase: { channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), removeChannel: vi.fn() }}))
vi.mock('../../../lib/syncContext', () => ({useSync:()=>({status:'synced',pendingCount:0})}))
vi.mock('../../shell/CommandPalette', () => ({openCommandPalette:vi.fn()}))
vi.mock('../creation/GlobalAddMenu', () => ({GlobalAddMenu:()=> <button>Global Add</button>}))
;(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true
let container:HTMLDivElement
let root:Root
beforeEach(()=>{state.viewport='desktop';state.mock=false;container=document.createElement('div');document.body.append(container);root=createRoot(container)})
afterEach(async()=>{await act(async()=>root.unmount());container.remove()})

describe('hosted record action hierarchy',()=>{
  async function render(busy=false,dirty=true) {
    await act(async()=>root.render(<MemoryRouter><WorkspaceProvider>
      <Header crumbs={[{label:'Edit Equipment'}]}/>
      <PageHeader title="Edit Equipment" showAddMenu={false} searchInMore={state.viewport==='phone'}/>
      <RecordActions busy={busy} dirty={dirty} label="Save changes" onSave={vi.fn()} onCancel={vi.fn()}
        extra={<button type="button">Create &amp; add another</button>}/>
    </WorkspaceProvider></MemoryRouter>))
  }
  it('has one Save in the fixed primary slot and alternate actions in More',async()=>{
    await render()
    expect(container.querySelectorAll('header')).toHaveLength(1)
    expect(container.querySelector('.record-actions')).toBeNull()
    expect(container.querySelector('[data-header-slot="primary"] button')?.getAttribute('aria-label')).toBe('Save changes')
    expect(container.textContent).not.toContain('Global Add')
    const more=container.querySelector<HTMLButtonElement>('[data-header-slot="more"] button')!
    await act(async()=>more.click())
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('Cancel')
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('Create & add another')
  })
  it('keeps the phone primary accessible and Search reachable from More',async()=>{
    state.viewport='phone'
    await render()
    expect(container.querySelector('[data-header-slot="search"]')).toBeNull()
    const primary=container.querySelector<HTMLButtonElement>('[data-header-slot="primary"] button')!
    expect(primary.getAttribute('aria-label')).toBe('Save changes')
    expect(primary.textContent).toBe('')
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="More record actions"]')!.click())
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('Search')
  })
  it('preserves clean and busy save guards across the portal',async()=>{
    await render(false,false)
    expect(container.querySelector<HTMLButtonElement>('[data-header-slot="primary"] button')?.disabled).toBe(true)
    await render(true,true)
    const primary=container.querySelector<HTMLButtonElement>('[data-header-slot="primary"] button')!
    expect(primary.disabled).toBe(true)
    expect(primary.getAttribute('aria-busy')).toBe('true')
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="More record actions"]')!.click())
    expect(document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.disabled).toBe(true)
  })
  it('keeps mock mode visible and its options reachable without a separate phone header control',async()=>{
    state.viewport='phone'
    state.mock=true
    await render()
    expect(container.querySelector('header [aria-label="Mock Mode Active"]')).toBeNull()
    const profile=container.querySelector<HTMLButtonElement>('button[aria-label*="user profile"]')!
    expect(profile.textContent).toBe('Mock')
    await act(async()=>profile.click())
    const options=container.querySelector<HTMLButtonElement>('[role="dialog"] button')!
    expect(options).not.toBeNull()
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Mock Mode Active')
  })
})
