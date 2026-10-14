// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'
import DeliveryWorkspace from '../DeliveryWorkspace'
import { saveDeliveries } from '../../../lib/queries/delivery'

const state = vi.hoisted(() => ({ role: 'Owner' as SystemRole, mock: true, online: true, toast: vi.fn() }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'local-owner', name: 'Local Tester', role: state.role } }) }))
vi.mock('../../../lib/supabase', () => ({ get IS_MOCK() { return state.mock } }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => state.online }))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: state.toast }) }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
let root: Root | undefined
let container: HTMLDivElement
function button(label: string) { return Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === label) }
async function mount() {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  await act(async () => { root?.render(<MemoryRouter><DeliveryWorkspace /></MemoryRouter>) })
}
beforeEach(() => {
  localStorage.clear(); state.role = 'Owner'; state.mock = true; state.online = true; state.toast.mockClear()
  saveDeliveries([{ id: 'DEL-2601', bookingNo: '807', clientName: 'Local Test Client', clientPhone: 'LOCAL-PHONE', address: 'LOCAL-ADDRESS', neighborhood: 'Local', mode: 'Babin Delivery', status: 'Ready', scheduledDate: '2026-10-14', scheduledTime: '10:00', deliveryFeeNpr: 3500 }], { role: 'Owner', isOnline: true })
})
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); localStorage.clear(); vi.restoreAllMocks() })
describe('DeliveryWorkspace fail-closed boundary', () => {
  it.each(['Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as const)('offers no delivery writes to %s', async role => {
    state.role = role; await mount(); expect(button('Dispatch')).toBeUndefined(); expect(button('+ New Dispatch')).toBeUndefined(); expect(state.toast).not.toHaveBeenCalled()
  })
  it.each(['Driver', 'Client'] as const)('does not show unscoped trip contacts to %s', async role => {
    state.role = role; await mount(); expect(container.textContent).not.toContain('LOCAL-PHONE'); expect(container.textContent).not.toContain('LOCAL-ADDRESS'); expect(container.textContent).not.toContain('Local Test Client'); expect(container.querySelector('[role="alert"]')).toBeTruthy()
  })
  it('reports live data unavailable with no sample rows or success', async () => {
    state.mock = false; await mount(); expect(container.textContent).toContain('server-backed'); expect(container.textContent).not.toContain('No deliveries scheduled'); expect(container.textContent).not.toContain('Local Test Client'); expect(button('+ New Dispatch')?.disabled).toBe(true); expect(state.toast).not.toHaveBeenCalled()
  })
  it('disables offline writes and explains they are not queued', async () => {
    state.online = false; await mount(); expect(button('Dispatch')?.disabled).toBe(true); expect(button('+ New Dispatch')?.disabled).toBe(true); expect(container.textContent).toContain('not queued'); expect(state.toast).not.toHaveBeenCalled()
  })
  it('shows persistent storage refusal inline and never announces success', async () => {
    await mount(); const before = localStorage.getItem('babin_rentals_deliveries_v1'); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Local storage unavailable') })
    await act(async () => { button('Dispatch')?.click() }); expect(container.textContent).toContain('Local storage unavailable'); expect(state.toast).not.toHaveBeenCalled(); expect(localStorage.getItem('babin_rentals_deliveries_v1')).toBe(before)
  })
})
