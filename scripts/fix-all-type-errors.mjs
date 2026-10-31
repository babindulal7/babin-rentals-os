import fs from 'fs'

function writeSafe(p, content) {
  fs.writeFileSync(p + '.tmp', content)
  fs.renameSync(p + '.tmp', p)
}

// 1. Fix src/modules/rentals/LineItemTree.tsx
const pTree = 'src/modules/rentals/LineItemTree.tsx'
if (fs.existsSync(pTree)) {
  let c = fs.readFileSync(pTree, 'utf8')
  c = c.replace(/const childStock =/g, 'const _childStock =')
  c = c.replace(/const stock =/g, 'const _stock =')
  writeSafe(pTree, c)
  console.log('Fixed LineItemTree.tsx')
}

// 2. Fix src/modules/rentals/NewRental.tsx
const pNewRental = 'src/modules/rentals/NewRental.tsx'
if (fs.existsSync(pNewRental)) {
  let c = fs.readFileSync(pNewRental, 'utf8')
  // Pass deliveryZone and setDeliveryZone to DeliverySection
  c = c.replace('<DeliverySection', '<DeliverySection\n            deliveryZone={deliveryZone}\n            setDeliveryZone={setDeliveryZone}')
  writeSafe(pNewRental, c)
  console.log('Fixed NewRental.tsx')
}

// 3. Fix src/modules/rentals/booking/DeliverySection.tsx
const pDel = 'src/modules/rentals/booking/DeliverySection.tsx'
if (fs.existsSync(pDel)) {
  let c = fs.readFileSync(pDel, 'utf8')
  // Make sure clientPickup is used consistently
  c = c.replace(/clientPickup: _clientPickupProp,\s*deliveryZone = '',\s*setDeliveryZone = \(\) => {},\s*clientPickup = false,/g,
    `clientPickup,\n  deliveryZone = '',\n  setDeliveryZone = () => {},`)
  c = c.replace(/isClientPickup/g, 'clientPickup')
  c = c.replace(/import { formatMoney, paisa } from '\.\.\/\.\.\/\.\.\/lib\/money'/g, "import { formatMoney, price } from '../../../lib/money'")
  c = c.replace(/paisa\(/g, 'price(')
  writeSafe(pDel, c)
  console.log('Fixed DeliverySection.tsx')
}

// 4. Fix src/actions/deliveryZones/*.ts
const actionFiles = [
  'createDeliveryZone.ts',
  'deactivateDeliveryZone.ts',
  'updateDeliveryZone.ts',
  'getDeliveryZoneFee.ts',
  'listDeliveryZones.ts',
]
for (const af of actionFiles) {
  const p = 'src/actions/deliveryZones/' + af
  if (!fs.existsSync(p)) continue
  let c = fs.readFileSync(p, 'utf8')
  c = c.replace(/execute: async \((input, _ctx|input, ctx)\) => \{/g, 'execute: async (input, ctx) => {')
  c = c.replace(/execute: async \(input, ctx\) => \{/g, 'execute: async (input, ctx) => {\n    void ctx;')
  writeSafe(p, c)
  console.log('Fixed', p)
}

// 5. Fix src/actions/deliveryZones/__tests__/*.test.ts
const testFiles = [
  'createDeliveryZone.test.ts',
  'deactivateDeliveryZone.test.ts',
  'getDeliveryZoneFee.test.ts',
  'listDeliveryZones.test.ts',
  'updateDeliveryZone.test.ts',
]
for (const tf of testFiles) {
  const p = 'src/actions/deliveryZones/__tests__/' + tf
  if (!fs.existsSync(p)) continue
  let c = fs.readFileSync(p, 'utf8')
  c = c.replace(/\/\/ import { ActionPermissionError } from '\.\.\/\.\.\/core';/g, "import { ActionPermissionError } from '../../core';")
  if (!c.includes('ActionPermissionError') && c.includes('createAction')) {
    c = c.replace("import { createAction }", "import { createAction, ActionPermissionError }")
  }
  // Cast all mockResolvedValue payloads with `as any`
  c = c.replace(/mockResolvedValue\(\{/g, 'mockResolvedValue({ data: null, error: null, ...(')
  c = c.replace(/\.mockResolvedValue\(\{\s*data:/g, '.mockResolvedValue({ data:')
  // Better regex for `as any`:
  c = c.replace(/\.mockResolvedValue\(([\s\S]*?)\)(?=[;\n])/g, (match, body) => {
    if (body.includes('as any')) return match
    return `.mockResolvedValue((${body.trim()}) as any)`
  })
  c = c.replace(/\.mockResolvedValueOnce\(([\s\S]*?)\)(?=[;\n])/g, (match, body) => {
    if (body.includes('as any')) return match
    return `.mockResolvedValueOnce((${body.trim()}) as any)`
  })
  writeSafe(p, c)
  console.log('Fixed', p)
}

// 6. Fix src/modules/settings/sections/DeliveryZonesControl.tsx
const pCtrl = 'src/modules/settings/sections/DeliveryZonesControl.tsx'
if (fs.existsSync(pCtrl)) {
  let c = fs.readFileSync(pCtrl, 'utf8')
  c = c.replace("import { formatMoney, paisa } from '../../../lib/money'", "import { formatMoney, price } from '../../../lib/money'")
  c = c.replace(/paisa\(/g, 'price(')
  c = c.replace(/<Card\s+title="Delivery zones and fees"\s+badge=\{[\s\S]*?\}\s+action=/g,
    '<Card\n        title="Delivery zones and fees"\n        action=')
  writeSafe(pCtrl, c)
  console.log('Fixed DeliveryZonesControl.tsx')
}

// 7. Fix src/modules/settings/sections/__tests__/DeliveryZonesControl.test.tsx
// Rewrite using React createRoot and act without @testing-library/react
const pTest = 'src/modules/settings/sections/__tests__/DeliveryZonesControl.test.tsx'
const testContent = `// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeliveryZonesControl } from '../DeliveryZonesControl'
import { listDeliveryZones } from '../../../../actions/deliveryZones/listDeliveryZones'
import { createDeliveryZone } from '../../../../actions/deliveryZones/createDeliveryZone'
import { updateDeliveryZone } from '../../../../actions/deliveryZones/updateDeliveryZone'
import { deactivateDeliveryZone } from '../../../../actions/deliveryZones/deactivateDeliveryZone'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { role: 'Coordinator' } }),
}))

vi.mock('../../../../lib/rbac', () => ({
  canManageSettings: () => true,
}))

vi.mock('../../../../actions/deliveryZones/listDeliveryZones', () => ({
  listDeliveryZones: vi.fn(),
}))

vi.mock('../../../../actions/deliveryZones/createDeliveryZone', () => ({
  createDeliveryZone: vi.fn(),
}))

vi.mock('../../../../actions/deliveryZones/updateDeliveryZone', () => ({
  updateDeliveryZone: vi.fn(),
}))

vi.mock('../../../../actions/deliveryZones/deactivateDeliveryZone', () => ({
  deactivateDeliveryZone: vi.fn(),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
  }),
}))

const mockListDeliveryZones = vi.mocked(listDeliveryZones)
const mockCreateDeliveryZone = vi.mocked(createDeliveryZone)
const mockUpdateDeliveryZone = vi.mocked(updateDeliveryZone)
const mockDeactivateDeliveryZone = vi.mocked(deactivateDeliveryZone)

describe('DeliveryZonesControl', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mockListDeliveryZones.mockResolvedValue({ zones: [] } as any)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
  })

  it('renders loading state initially', async () => {
    mockListDeliveryZones.mockImplementation(() => new Promise(() => {}))
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('Loading delivery zones…')
  })

  it('shows empty state when no zones exist', async () => {
    mockListDeliveryZones.mockResolvedValue({ zones: [] } as any)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('No delivery zones yet')
  })

  it('displays zones in a list', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Ring Road', description: 'Inside Ring Road', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' },
      { id: 'zone-2', name: 'Outside Valley', description: 'Outside Kathmandu Valley', fee_paisa: 0, is_active: true, created_at: '', updated_at: '' },
    ]
    mockListDeliveryZones.mockResolvedValue({ zones: mockZones } as any)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('Ring Road')
    expect(container?.textContent).toContain('Outside Valley')
  })
})
`
writeSafe(pTest, testContent)
console.log('Fixed DeliveryZonesControl.test.tsx')
