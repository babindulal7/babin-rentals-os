// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { InventoryUnitRow } from '../../../lib/queries/inventory'

const save = vi.hoisted(() => vi.fn())
const key = '77777777-7777-4777-8777-777777777777'

vi.mock('../../../actions/inventory/updateUnit', () => ({ updateUnit: save }))
vi.mock('../../../lib/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../lib/auth')>(),
  useAuth: () => ({ user: { id: 'warehouse-1', role: 'Warehouse' } }),
}))
vi.mock('../../../lib/supabase', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../lib/supabase')>(),
  newClientUuid: () => key,
}))

const { UnitEditor } = await import('../AssetDetail')
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const baseUnit = {
  id: 'unit-1',
  assetTag: 'FX3-01',
  serialNo: 'SN-01',
  state: 'In Stock',
  rack: 'A',
  shelf: '1',
  bin: null,
  condition: 'Good',
  replacementValue: null,
  updatedAt: '2026-11-05T12:00:00.000Z',
} as unknown as InventoryUnitRow

let host: HTMLDivElement
let root: Root
let persisted: ReturnType<typeof vi.fn>
let openLabel: ReturnType<typeof vi.fn>
let done: ReturnType<typeof vi.fn>

async function mount(unit: InventoryUnitRow = baseUnit) {
  await act(async () => {
    root.render(
      <UnitEditor
        unit={unit}
        money={false}
        onDone={done}
        onPersisted={persisted}
        onOpenLabel={openLabel}
      />,
    )
  })
}

function change(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>('#edit-' + id)
  if (!input) throw new Error('Missing editable input: ' + id)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function saveRow() {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Save')
  if (!button) throw new Error('Expected field Save button')
  await act(async () => { button.click() })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  save.mockReset()
  persisted = vi.fn()
  openLabel = vi.fn()
  done = vi.fn()
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('T2-17 unit editor persistence', () => {
  it('writes with signed-in Warehouse context and the original revision, then refreshes only on confirmed receipt', async () => {
    save.mockResolvedValue({
      id: 'unit-1', assetTag: 'FX3-NEW', serialNo: 'SN-01', rack: 'A', shelf: '1', bin: null,
      updatedAt: '2026-11-05T13:00:00.000Z',
    })
    await mount()
    await act(async () => change('assetTag', 'FX3-NEW'))
    await saveRow()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({
      unitId: 'unit-1',
      expectedRevision: baseUnit.updatedAt,
      clientUuid: key,
      patch: { assetTag: 'FX3-NEW' },
    }, { userId: 'warehouse-1', role: 'Warehouse', isOnline: true })
    expect(persisted).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Unit details saved and confirmed by the database.')
    expect(host.textContent).toContain('The existing physical label is outdated.')
    const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('View updated label'))
    expect(button).toBeTruthy()
    await act(async () => button!.click())
    expect(openLabel).toHaveBeenCalledWith(expect.objectContaining({ assetTag: 'FX3-NEW' }))
    expect(host.querySelector<HTMLInputElement>('#edit-assetTag')?.value).toBe('FX3-NEW')
    expect(host.textContent).not.toContain('Replacement value')
  })

  it('keeps the draft and stable retry identity after a write error', async () => {
    save.mockRejectedValueOnce(new Error('Unit changed since you opened it'))
    await mount()
    await act(async () => change('rack', 'B'))
    await saveRow()
    expect(persisted).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Unit changed since you opened it')
    expect(host.querySelector<HTMLInputElement>('#edit-rack')?.value).toBe('B')
    save.mockResolvedValueOnce({
      id: 'unit-1', assetTag: 'FX3-01', serialNo: 'SN-01', rack: 'B', shelf: '1', bin: null,
      updatedAt: '2026-11-05T13:00:00.000Z',
    })
    await saveRow()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]?.[0]?.clientUuid).toBe(save.mock.calls[0]?.[0]?.clientUuid)
    expect(persisted).toHaveBeenCalledTimes(1)
  })

  it('refuses edits when the original revision is unavailable, without pretending to save', async () => {
    await mount({ ...baseUnit, updatedAt: null })
    await act(async () => change('serialNo', 'SN-02'))
    await saveRow()
    expect(save).not.toHaveBeenCalled()
    expect(persisted).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Reload this unit before saving.')
    expect(host.querySelector<HTMLInputElement>('#edit-serialNo')?.value).toBe('SN-02')
  })
})
