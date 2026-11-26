// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { registryFlagsShownFor, type MaintenanceRecord } from '../Maintenance'
import type { Paisa } from '../../../lib/money'

const base: MaintenanceRecord = {
  id: 'MT-TEST-0001',
  equipmentName: 'Test Camera',
  serialNumber: 'SN-TEST-0001',
  type: 'Repair',
  priority: 'Medium',
  status: 'At Vendor',
  flags: [],
  conditions: [],
  costEstPaisa: 0 as Paisa,
}

describe('registryFlagsShownFor: one Overdue definition for the KPI, chip, filter and row', () => {
  it('shows Overdue for an open job past its estimated completion, even with no stored flag', () => {
    expect(registryFlagsShownFor({ ...base, estCompletion: new Date('2020-01-01') })).toEqual(['Overdue'])
  })

  it('ignores a stored Overdue flag when the estimated completion is still ahead', () => {
    expect(registryFlagsShownFor({ ...base, flags: ['Overdue'], estCompletion: new Date('2099-01-01') })).toEqual([])
  })

  it('does not show Overdue once the job is Completed or Cancelled', () => {
    expect(registryFlagsShownFor({ ...base, status: 'Completed', estCompletion: new Date('2020-01-01') })).toEqual([])
    expect(registryFlagsShownFor({ ...base, status: 'Cancelled', estCompletion: new Date('2020-01-01') })).toEqual([])
  })

  it('does not show Overdue without an estimated completion', () => {
    expect(registryFlagsShownFor({ ...base, flags: ['Overdue'] })).toEqual([])
  })
})
