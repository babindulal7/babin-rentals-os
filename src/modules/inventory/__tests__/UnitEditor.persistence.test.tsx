// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { InventoryUnitRow } from '../../../lib/queries/inventory'
const state = vi.hoisted(() => ({ save: vi.fn(), user: { id: 'owner', role: 'Owner' as const } }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../../lib/supabase', () => ({ supabase: {}, newClientUuid: () => crypto.randomUUID() }))
vi.mock('../../../actions/inventory/updateEquipmentUnit', async () => ({
  ...await vi.importActual('../../../actions/inventory/updateEquipmentUnit'), updateEquipmentUnit: state.save,
}))
import { UnitEditor } from '../AssetDetail'
const unit: InventoryUnitRow = {
  id: 'unit-1', productId: 'product-1', revision: '2026-10-25T10:00:00.000Z', assetTag: 'CAM-1', serialNo: null,
  state: 'In Stock', condition: 'Good', branchId: 'branch-1', warehouseId: 'warehouse-1',
  barcode: null, qrCode: null, storageZoneId: null, rack: null, shelf: null, bin: null, containerId: null,
  runningHours: 0, lastMaintenanceAtAd: null, nextMaintenanceAtAd: null, warrantyExpiresAd: null,
  insuranceExpiresAd: null, retiredAtAd: null, retirementReason: null, purchasePrice: null, replacementValue: null,
}
const snapshot = { id: unit.id, revision: '2026-10-26T10:00:00.000Z', assetTag: 'CAM-2', serialNo: null,
  state: 'In Stock', condition: 'Good', rack: null, shelf: null, bin: null }
let root: Root
let container: HTMLDivElement
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
async function open() {
  const callbacks = { onSaved: vi.fn(), onDone: vi.fn(), onReload: vi.fn() }
  await act(async () => root.render(<MemoryRouter><UnitEditor unit={unit} money={false} {...callbacks} /></MemoryRouter>))
  return callbacks
}
function input(label: string): HTMLInputElement {
  const node = [...document.querySelectorAll('label')].find(node => node.textContent === label)
  const control = node?.htmlFor ? document.getElementById(node.htmlFor) : null
  if (!(control instanceof HTMLInputElement)) throw new Error('Missing input: ' + label)
  return control
}
function button(name: string, parent: ParentNode = document): HTMLButtonElement {
  const result = [...parent.querySelectorAll('button')].find(node => node.textContent?.trim() === name)
  if (!result) throw new Error('Missing button: ' + name)
  return result
}
async function change(label: string, value: string) {
  await act(async () => {
    const element = input(label)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(name: string, parent: ParentNode = document) {
  await act(async () => button(name, parent).click())
}
async function saveField(label: string) { await click('Save', input(label).parentElement!) }
beforeEach(() => {
  state.save.mockReset(); state.save.mockResolvedValue(snapshot)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
describe('unit inline persistence', () => {
  it('keeps engine status read-only and omits money', async () => {
    await open()
    expect(document.querySelector('#edit-state')).toBeNull()
    expect(document.body.textContent).toContain('Status changes through Operations and maintenance workflows.')
    expect(document.body.textContent).not.toContain('Replacement value')
  })
  it('only advances a confirmed field baseline while its sibling draft survives', async () => {
    const callbacks = await open()
    await change('Asset tag', 'CAM-2'); await change('Shelf', 'B2')
    await saveField('Asset tag')
    expect(callbacks.onSaved).toHaveBeenCalledOnce()
    expect(input('Asset tag').value).toBe('CAM-2')
    expect(input('Shelf').value).toBe('B2')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Unsaved changes')
    expect(state.save.mock.calls[0]?.[0].patch).toEqual({ assetTag: 'CAM-2' })
  })
  it('retains a failed draft and reuses its key on retry', async () => {
    state.save.mockRejectedValueOnce(new Error('Connection interrupted. Retry this save.'))
    await open(); await change('Asset tag', 'CAM-2'); await saveField('Asset tag')
    expect(document.body.textContent).toContain('Connection interrupted. Retry this save.')
    expect(input('Asset tag').value).toBe('CAM-2')
    await saveField('Asset tag')
    expect(state.save).toHaveBeenCalledTimes(2)
    expect(state.save.mock.calls[1]?.[0].clientUuid).toBe(state.save.mock.calls[0]?.[0].clientUuid)
    expect(state.save.mock.calls[1]?.[0].expectedRevision).toBe(unit.revision)
  })
  it('requires an explicit discard before closing dirty edits', async () => {
    const callbacks = await open(); await change('Rack', 'A'); await click('Close')
    expect(callbacks.onDone).not.toHaveBeenCalled()
    await click('Keep editing')
    expect(input('Rack').value).toBe('A')
    await click('Close'); await click('Discard changes')
    expect(callbacks.onDone).toHaveBeenCalledOnce()
  })
  it('makes a stale reload explicit and keeps the draft if cancelled', async () => {
    state.save.mockRejectedValueOnce(new Error('The unit changed. Reload the latest record before saving.'))
    const callbacks = await open(); await change('Asset tag', 'CAM-2'); await saveField('Asset tag')
    await click('Reload latest record'); await click('Keep editing')
    expect(callbacks.onReload).not.toHaveBeenCalled()
    expect(input('Asset tag').value).toBe('CAM-2')
    await click('Reload latest record'); await click('Discard and reload')
    expect(callbacks.onReload).toHaveBeenCalledOnce()
  })
})
