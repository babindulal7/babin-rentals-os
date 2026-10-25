// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'

const seam = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), key: 0, role: 'Owner' }))
const product = vi.hoisted(() => ({ id: 'product-1', name: 'FX3', assetCode: 'EQ-1', brand: 'Sony', category: 'Cameras', isActive: true, dailyRate: 10000, trackingMode: 'Serialised', unitCountExcludingRetired: 3, totalQuantity: 3 }))
const fixture = vi.hoisted(() => ({ id: 'bundle-1', bundleCode: 'BND-1', name: 'Film kit', description: 'Stored description', category: 'Cameras', categoryId: 'cat-1', isActive: true, dailyRate: 10000, weeklyRate: null, items: [{ itemId: 'item-1', productId: 'product-1', productName: 'FX3', category: 'Cameras', brand: 'Sony', quantity: 1, days: 2, isMandatory: false, sortOrder: 0, dailyRate: 10000, trackingMode: 'Serialised', unitsTotal: 3, unitsInStock: 3 }] }))
const saved = vi.hoisted(() => ({ id: 'bundle-1', code: 'BND-1', revision: 'rev-1', values: { name: 'Film kit', description: 'Stored description', category_id: 'cat-1', is_active: true, daily_rate: 100, weekly_rate: null }, rows: [{ id: 'item-1', product_id: 'product-1', quantity: 1, days: 2, is_mandatory: false, sort_order: 0 }] }))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({user: { id: 'owner-1', role: seam.role, name: 'Owner' }, loading: false}) }))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/network', () => ({useNetwork: () => true}))
vi.mock('../../../lib/device', () => ({useViewport: () => 'desktop', useCapability: () => ({hasHover: true})}))
vi.mock('../../../lib/supabase', () => ({supabase: {}, newClientUuid: () => `key-${++seam.key}`}))
vi.mock('../../../actions/recordEditor', () => ({saveRecordSection: seam.save}))
vi.mock('../../../lib/queries/recordEditor', () => ({readRecordEditor: seam.read}))
vi.mock('../../../lib/queries/useBundles', () => ({useBundleWithItems: () => ({rows: [fixture], loading: false, error: null})}))
vi.mock('../../../lib/queries/inventory', () => ({useInventoryCategories: () => ({rows: [{ id: 'cat-1', name: 'Cameras' }]}), listInventory: async () => ({rows: [product]})}))
vi.mock('../../../lib/queries/productAvailability', () => ({readProductAvailability: async () => new Map([['product-1',{unitsOwned: 3, unitsFree: 3, unitsHeld: 0}]])}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
window.matchMedia = ((media: string) => ({media, matches: false, addEventListener() {}, removeEventListener() {}})) as unknown as typeof window.matchMedia
Element.prototype.scrollIntoView = () => {}
const { AddBundle } = await import('../AddBundle')
let root: Root
let container: HTMLDivElement
const button = (label: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === label)
const click = (element: Element | undefined) => act(async () => { element?.dispatchEvent(new MouseEvent('click', {bubbles: true})) })
async function input(label: string, value: string) {
  const el = [...container.querySelectorAll('input')].find(input => input.closest('label')?.textContent?.includes(label))
  if (!el) throw new Error(`Missing ${label}`)
  await act(async () => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el,value); el.dispatchEvent(new Event('input', {bubbles: true}))})
}
async function mount(edit = true) {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  await act(async () => root.render(<MemoryRouter><ToastProvider><AddBundle {...(edit ? {bundleRef: 'bundle-1'} : {})}/></ToastProvider></MemoryRouter>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
}
beforeEach(() => {seam.role='Owner'; seam.key=0; seam.read.mockReset().mockResolvedValue(saved); seam.save.mockReset().mockImplementation(async input => ({...saved, revision: 'rev-2', values: {...saved.values, ...input.values}, rows: input.rows ?? saved.rows}))})
afterEach(async () => {if(root) await act(async () => root.unmount()); container?.remove()})

describe('active Bundle Builder section persistence', () => {
  it('uses the shared workspace/actions and exposes real section saves after loading', async () => {
    await mount()
    expect(container.querySelector('.record-workspace')).not.toBeNull()
    expect(container.querySelectorAll('[aria-label="Record actions"]')).toHaveLength(1)
    expect(button('Save Identity')).toBeDefined()
    expect(button('Save Rates')).toBeDefined()
    expect(button('Save Components')).toBeDefined()
  })

  it('saves identity without submitting unsaved component/rate edits', async () => {
    await mount()
    await input('Bundle Name', 'New kit')
    await click(button('Save Identity'))
    expect(seam.save).toHaveBeenCalledOnce()
    expect(seam.save.mock.calls[0]![0]).toMatchObject({kind: 'bundle', id: 'bundle-1', section: 'identity', expectedRevision: 'rev-1', values: {name: 'New kit', category_id: 'cat-1', is_active: true}})
    expect(seam.save.mock.calls[0]![0].values).not.toHaveProperty('daily_rate')
    expect(seam.save.mock.calls[0]![0].rows).toBeUndefined()
  })

  it('preserves existing component identity, days and optional status in section saves', async () => {
    await mount()
    await click(button('Save Components'))
    expect(seam.save.mock.calls[0]![0]).toMatchObject({section: 'components', rows: [{id: 'item-1', product_id: 'product-1', quantity: 1, days: 2, is_mandatory: false}]})
  })

  it('keeps unsaved Identity edits and the leave guard after saving Components', async () => {
    await mount()
    await input('Bundle Name', 'Unsaved sibling name')
    await click(button('Save Components'))
    expect([...container.querySelectorAll('input')].some(input => input.value === 'Unsaved sibling name')).toBe(true)
    await click(button('Cancel'))
    expect(document.body.textContent).toContain('Discard unsaved changes?')
  })

  it('keeps section creation disabled before the deliberate Create Bundle action', async () => {
    await mount(false)
    expect((button('Save Identity') as HTMLButtonElement).disabled).toBe(true)
    expect(seam.save).not.toHaveBeenCalled()
  })

  it('refuses direct editing by a role the server cannot authorize', async () => {
    seam.role='Coordinator'
    await mount()
    expect(button('Save Identity')).toBeUndefined()
    expect(container.textContent).toContain('Editing a bundle is not available for your role')
  })
})
