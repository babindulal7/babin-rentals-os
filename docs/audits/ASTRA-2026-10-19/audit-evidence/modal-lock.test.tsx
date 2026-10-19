// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { it, expect, vi } from 'vitest'
vi.mock('../src/lib/device', () => ({ useViewport: () => 'desktop' }))
import { Modal } from '../src/components/ui/Modal'
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
it('keeps outer scroll lock after an initially dormant inner modal opens then closes', async () => {
 const host=document.createElement('div'); document.body.appendChild(host)
 const root=createRoot(host); const close=()=>{}
 const draw=(inner:boolean)=><><Modal isOpen onClose={close} title="Outer">Outer</Modal><Modal isOpen={inner} onClose={close} title="Inner">Inner</Modal></>
 try {
 await act(async()=>{root.render(draw(false))})
 expect(document.body.style.overflow).toBe('hidden')
 await act(async()=>{root.render(draw(true))})
 expect(document.body.style.overflow).toBe('hidden')
 await act(async()=>{root.render(draw(false))})
 expect(document.body.style.overflow).toBe('hidden')
 } finally { await act(async()=>root.unmount()); host.remove() }
})
