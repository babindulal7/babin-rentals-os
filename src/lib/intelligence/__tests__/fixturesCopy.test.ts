import { describe, it, expect } from 'vitest'
import { SYNTHETIC_DATA_QUALITY_ISSUES } from '../fixtures'

describe('Data quality evidence — plain labels, no table or function names', () => {
  it('names no table, function or snake_case identifier in any evidence line', () => {
    for (const issue of SYNTHETIC_DATA_QUALITY_ISSUES) {
      expect(issue.evidence, issue.code).not.toMatch(/\b[a-z]+_[a-z_]+\b|\btable\b|next_document_number/)
    }
  })

  it('keeps the catalogue identifiers in the data and the plain label in the text', () => {
    const missingChildren = SYNTHETIC_DATA_QUALITY_ISSUES.find((i) => i.code === 'CMP-002')
    expect(missingChildren?.canonicalId).toBe('CAM-SONY-FX30-BODY')
    expect(missingChildren?.evidence).toBe('No child items are flagged as required to operate.')

    const unregisteredUnits = SYNTHETIC_DATA_QUALITY_ISSUES.find((i) => i.code === 'OPS-005')
    expect(unregisteredUnits?.evidence).toBe(
      'The warehouse audit finds no physical units registered under the equipment numbering sequence.',
    )
  })
})
