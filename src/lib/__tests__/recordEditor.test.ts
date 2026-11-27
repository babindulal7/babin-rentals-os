import { describe, it, expect } from 'vitest'
import {
  recordSectionKey,
  validateRecord,
  recordPayload,
  applySavedRecordSection,
  recordDefaults,
} from '../recordEditor'

describe('recordEditor', () => {
  it('normalizes section keys consistently', () => {
    expect(recordSectionKey('Basic Details')).toBe('basic details')
    expect(recordSectionKey('  Rates & Deposit  ')).toBe('  rates & deposit  ')
  })

  it('validates required client fields and PAN format', () => {
    const errors = validateRecord('client', { ...recordDefaults.client, name: '', phone: '123', pan_vat: 'ABC' })
    expect(errors.name).toBeTruthy()
    expect(errors.phone).toBeTruthy()

    const ok = validateRecord('client', { ...recordDefaults.client, name: 'Alpha Films', phone: '9800000000', pan_vat: '123456789' })
    expect(ok).toEqual({})
  })

  it('filters createOnly fields when editing and merges saved section snapshots', () => {
    const payload = recordPayload('equipment', { ...recordDefaults.equipment, name: 'FX6', initialUnits: 3 }, true)
    expect(payload.name).toBe('FX6')
    expect('initialUnits' in payload).toBe(false)

    const merged = applySavedRecordSection(
      { values: { name: 'Old', phone: '9800000000' }, rows: [] },
      { id: 'c1', code: 'CL-1', revision: '2', values: { name: 'New' }, rows: [] },
      { section: 'basic', fields: { name: 'New' } },
    )
    expect(merged.values.name).toBe('New')
    expect(merged.values.phone).toBe('9800000000')
  })
})
