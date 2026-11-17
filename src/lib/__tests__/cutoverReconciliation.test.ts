import { describe, it, expect } from 'vitest'
import {
  reconcileBooqableCutover,
  compareThreeDayQuotes,
  type BooqableRawRow,
  type OsEntityRecord,
} from '../cutoverReconciliation'

describe('T9-01 Cutover Reconciliation Engine', () => {
  it('classifies 100% of rows deterministically (new, unchanged, updated, conflict, rejected, os_only)', () => {
    const sourceRows: BooqableRawRow[] = [
      // 1. New client
      {
        entity: 'client',
        externalId: 'bq-c-001',
        fields: { name: 'Aarav Sharma', phone: '9841234567', email: 'aarav@example.com' },
      },
      // 2. Unchanged product
      {
        entity: 'product',
        externalId: 'bq-p-101',
        fields: { name: 'Sony FX3', storeSlug: 'sony-fx3', dailyRatePaisa: 500000 },
      },
      // 3. Updated product (rate changed)
      {
        entity: 'product',
        externalId: 'bq-p-102',
        fields: { name: 'Canon R5C', storeSlug: 'canon-r5c', dailyRatePaisa: 600000 },
      },
      // 4 & 5. Duplicate external ID inside source -> conflict
      {
        entity: 'product',
        externalId: 'bq-p-conflict',
        fields: { name: 'Conflict Item A' },
      },
      {
        entity: 'product',
        externalId: 'bq-p-conflict',
        fields: { name: 'Conflict Item B' },
      },
      // 6. Rejected (missing name)
      {
        entity: 'bundle',
        externalId: 'bq-b-999',
        fields: { name: '', items: [] },
      },
      // 7. Seasonal rule with valid endDate
      {
        entity: 'seasonal_rule',
        externalId: 'bq-s-summer25',
        fields: { name: 'SUMMER25', endDate: '2027-08-31T23:59:59Z', discountPercent: 10 },
      },
      // 8. Rejected seasonal rule (missing endDate)
      {
        entity: 'seasonal_rule',
        externalId: 'bq-s-invalid',
        fields: { name: 'New Year No End' },
      },
    ]

    const osRecords: OsEntityRecord[] = [
      // Matches bq-p-101 exactly
      {
        entity: 'product',
        externalId: 'bq-p-101',
        localId: 'os-p-01',
        fields: { name: 'Sony FX3', storeSlug: 'sony-fx3', dailyRatePaisa: 500000 },
      },
      // Matches bq-p-102 with older daily rate
      {
        entity: 'product',
        externalId: 'bq-p-102',
        localId: 'os-p-02',
        fields: { name: 'Canon R5C', storeSlug: 'canon-r5c', dailyRatePaisa: 550000 },
      },
      // OS Only record
      {
        entity: 'product',
        externalId: 'bq-p-os-only',
        localId: 'os-p-99',
        fields: { name: 'Local Only Mic' },
      },
    ]

    const report = reconcileBooqableCutover(sourceRows, osRecords)

    expect(report.counts.client.new).toBe(1)
    expect(report.counts.product.unchanged).toBe(1)
    expect(report.counts.product.updated).toBe(1)
    expect(report.counts.product.conflict).toBe(2)
    expect(report.counts.bundle.rejected).toBe(1)
    expect(report.counts.seasonal_rule.new).toBe(1)
    expect(report.counts.seasonal_rule.rejected).toBe(1)
    expect(report.counts.product.os_only).toBe(1)

    expect(report.hasConflicts).toBe(true)
    expect(report.hasRejections).toBe(true)

    // Check updated row fields
    const updatedRow = report.rows.find((r) => r.externalId === 'bq-p-102')
    expect(updatedRow?.status).toBe('updated')
    expect(updatedRow?.changedFields).toEqual(['dailyRatePaisa'])

    // Check conflict row
    const conflictRows = report.rows.filter((r) => r.externalId === 'bq-p-conflict')
    expect(conflictRows.length).toBe(2)
    expect(conflictRows[0]?.status).toBe('conflict')
  })

  it('verifies 20-product 3-day pricing comparison vector', () => {
    const twentySampleProducts = Array.from({ length: 20 }, (_, i) => ({
      id: `prod-${i + 1}`,
      name: `Camera Gear Item #${i + 1}`,
      dailyRateNpr: 1000 + i * 250,
      booqableThreeDayTotalNpr: (1000 + i * 250) * 3,
    }))

    const comparison = compareThreeDayQuotes(twentySampleProducts)
    expect(comparison.length).toBe(20)

    for (const vector of comparison) {
      expect(vector.isAcceptableRoundingMatch).toBe(true)
      expect(vector.differencePaisa).toBeLessThanOrEqual(100)
      expect(vector.osCalculatedThreeDayTotalPaisa).toBe(vector.osDailyRatePaisa * 3)
    }
  })

  it('preserves fractional NPR as integer paisa in quote comparison', () => {
    const rows = compareThreeDayQuotes([{
      id: 'fx3', name: 'Camera',
      dailyRateNpr: 1234.56,
      booqableThreeDayTotalNpr: 3703.68,
    }])
    expect(rows[0]?.osDailyRatePaisa).toBe(123456)
    expect(rows[0]?.osCalculatedThreeDayTotalPaisa).toBe(370368)
    expect(rows[0]?.differencePaisa).toBe(0)
  })

  it('rejects unknown entity types cleanly without crash', () => {
    const raw: any = [{ entity: 'unknown_entity', externalId: '123', fields: {} }]
    const report = reconcileBooqableCutover(raw)
    expect(report.rows[0]?.status).toBe('rejected')
  })
})
