import { describe, it, expect } from 'vitest'
import { SYSTEM_SUMMARY } from '../settings'
import { IS_MOCK } from '../../lib/supabase'

describe('System Summary — the Environment row reads the build it runs in', () => {
  it('says Mock mode in a mock build, and Production only in a live one', () => {
    const environment = SYSTEM_SUMMARY.find((row) => row.label === 'Environment')
    expect(environment?.value).toBe(IS_MOCK ? 'Mock mode' : 'Production')
  })
})

describe('System Summary — the live statuses state their absence', () => {
  const NO_READER_ROWS = ['Database', 'Storage used', 'Backup status', 'Last backup', 'Next scheduled backup', 'Active sessions']

  it('shows Not tracked yet, with a neutral tone, where no reader exists', () => {
    for (const label of NO_READER_ROWS) {
      const row = SYSTEM_SUMMARY.find((r) => r.label === label)
      expect(row?.value, label).toBe('Not tracked yet')
      expect(row?.tone, label).toBe('default')
    }
  })

  it('prints none of the old literal status figures', () => {
    const values = SYSTEM_SUMMARY.map((row) => row.value).join(' | ')
    expect(values).not.toMatch(/Healthy|246\.8|Successful|02:15|02:00/)
  })
})
