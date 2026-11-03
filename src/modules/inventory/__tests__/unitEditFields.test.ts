import { describe, expect, it } from 'vitest'
import type { SystemRole } from '../../../types/database'
import { canEditUnitIdentity } from '../../../lib/rbac'
import { UNIT_FIELDS } from '../unitEditFields'

const roles: SystemRole[] = [
  'Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse',
  'Technician', 'Accounts', 'Driver', 'Client',
]

describe('T2-17 unit identity role gate', () => {
  it('matches product_units_update RLS without admitting Coordinator or Technician', () => {
    expect(roles.filter(canEditUnitIdentity)).toEqual(['Owner', 'Admin', 'Manager', 'Warehouse'])
  })
  it('allows Warehouse but does not require financial visibility', () => {
    expect(canEditUnitIdentity('Warehouse')).toBe(true)
    expect(canEditUnitIdentity('Technician')).toBe(false)
  })
})

describe('T2-17 unit editor fields', () => {
  it('exposes only identity/location changes; life-cycle and money fields are immutable', () => {
    const byKey = new Map(UNIT_FIELDS.map((field) => [field.key, field]))
    expect([...byKey].filter(([, field]) => !field.immutable).map(([key]) => key))
      .toEqual(['assetTag', 'serialNo', 'rack', 'shelf', 'bin'])
    for (const key of ['state', 'condition', 'replacementValue']) {
      expect(byKey.get(key)?.immutable).toBeTruthy()
    }
  })
  it('refuses a blank asset tag, including whitespace-only input', () => {
    const field = UNIT_FIELDS.find((f) => f.key === 'assetTag')
    expect(field?.validate?.('  ')).toMatch(/required/)
    expect(field?.validate?.(' FX3-01 ')).toBeNull()
  })
  it('saves rack, shelf and bin as one future atomic edit group', () => {
    expect(UNIT_FIELDS.filter((f) => f.group === 'location').map((f) => f.key))
      .toEqual(['rack', 'shelf', 'bin'])
    expect(UNIT_FIELDS.find((f) => f.key === 'state')?.group).toBeUndefined()
  })
})
