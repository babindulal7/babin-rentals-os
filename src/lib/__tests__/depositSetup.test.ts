import { describe, expect, it } from 'vitest'
import {
  buildDepositSetupCsv,
  changedDepositFields,
  depositBasis,
  depositDraftFromRow,
  depositDraftIsDirty,
  depositRowWarning,
  depositSetupProgress,
  describeDepositChange,
  effectiveUnitDepositPaisa,
  filterDepositRows,
  isDepositConfigured,
  paisaToRupeeText,
  parseDepositDraft,
  previewDepositSetupCsv,
  type DepositSetupRow,
} from '../depositSetup'
import { rupees } from '../money'

/* T3-02 — the deposit setup editor's rules. Figures are integer paisa. */

const row = (over: Partial<DepositSetupRow> = {}): DepositSetupRow => ({
  id: 'p1',
  assetCode: 'CAM-001',
  name: 'Sony FX3',
  brand: 'Sony',
  model: 'FX3',
  fixedPaisa: null,
  percent: null,
  replacementPaisa: null,
  ...over,
})

describe('paisaToRupeeText — a plain editable rupee string, never grouped money', () => {
  it('writes blanks, whole rupees and paise', () => {
    expect(paisaToRupeeText(null)).toBe('')
    expect(paisaToRupeeText(rupees(15_000))).toBe('15000')
    expect(paisaToRupeeText(1_500_050)).toBe('15000.50')
    expect(paisaToRupeeText(5)).toBe('0.05')
  })
})

describe('parseDepositDraft — blank is unfinished work, zero is a decision', () => {
  it('treats a blank field as not set', () => {
    const parsed = parseDepositDraft({ fixed: '', percent: '', replacement: '' })
    expect(parsed.ok).toBe(true)
    expect(parsed.values).toEqual({ fixedPaisa: null, percent: null, replacementPaisa: null })
  })

  it('keeps a deliberate zero fixed deposit', () => {
    const parsed = parseDepositDraft({ fixed: '0', percent: '', replacement: '' })
    expect(parsed.values.fixedPaisa).toBe(0)
    expect(parsed.warnings.join(' ')).toContain('deliberately asks for no deposit')
  })

  it('parses grouped rupees and percentages', () => {
    const parsed = parseDepositDraft({ fixed: 'Rs 1,85,000', percent: '12.5%', replacement: '4,20,000' })
    expect(parsed.ok).toBe(true)
    expect(parsed.values).toEqual({
      fixedPaisa: rupees(185_000),
      percent: 12.5,
      replacementPaisa: rupees(420_000),
    })
  })

  it('refuses negative money, percentages outside 0-100 and a third decimal', () => {
    expect(parseDepositDraft({ fixed: '-1', percent: '', replacement: '' }).errors.fixed).toBeDefined()
    expect(parseDepositDraft({ fixed: '', percent: '101', replacement: '' }).errors.percent).toBeDefined()
    expect(parseDepositDraft({ fixed: '', percent: '-1', replacement: '' }).errors.percent).toBeDefined()
    expect(parseDepositDraft({ fixed: '', percent: '12.345', replacement: '' }).errors.percent).toBeDefined()
  })

  it('warns when a percentage has no replacement value to take a percentage of', () => {
    const parsed = parseDepositDraft({ fixed: '', percent: '20', replacement: '' })
    expect(parsed.ok).toBe(true)
    expect(parsed.warnings.join(' ')).toContain('asks for no deposit')
  })

  it('says fixed wins when both are above zero', () => {
    const parsed = parseDepositDraft({ fixed: '5000', percent: '20', replacement: '100000' })
    expect(parsed.warnings.join(' ')).toContain('fixed deposit above zero wins')
  })
})

describe('the effective deposit reads the booking engine rule, not a second one', () => {
  it('fixed wins, else percent of replacement, else nothing', () => {
    expect(depositBasis(row({ fixedPaisa: rupees(5_000), percent: 20, replacementPaisa: rupees(100_000) }))).toBe('fixed')
    expect(depositBasis(row({ percent: 20, replacementPaisa: rupees(100_000) }))).toBe('percent')
    expect(depositBasis(row({}))).toBe('none')
  })

  it('rounds the per-unit figure to a whole rupee for display', () => {
    expect(effectiveUnitDepositPaisa(row({ percent: 10, replacementPaisa: rupees(4_20_000) }))).toBe(rupees(42_000))
    expect(effectiveUnitDepositPaisa(row({ percent: 33.33, replacementPaisa: 1_000_050 }))).toBe(rupees(3_333))
    expect(effectiveUnitDepositPaisa(row({}))).toBeNull()
  })
})

describe('progress counts decided products, and a blank is not a zero', () => {
  it('counts either column being set', () => {
    const progress = depositSetupProgress([
      row({ id: 'a', fixedPaisa: 0 }),
      row({ id: 'b', percent: 0 }),
      row({ id: 'c' }),
      row({ id: 'd', replacementPaisa: rupees(100) }),
    ])
    expect(progress).toEqual({ total: 4, configured: 2, unset: 2, percentComplete: 50 })
    expect(isDepositConfigured(row({ fixedPaisa: null, percent: null }))).toBe(false)
    expect(isDepositConfigured(row({ fixedPaisa: null, percent: 0 }))).toBe(true)
  })

  it('is 0% for an empty catalogue rather than NaN', () => {
    expect(depositSetupProgress([])).toEqual({ total: 0, configured: 0, unset: 0, percentComplete: 0 })
  })
})

describe('filtering — search plus the no-deposit filter', () => {
  const rows = [
    row({ id: 'a', name: 'Sony FX3', assetCode: 'CAM-001', brand: 'Sony', model: 'FX3', fixedPaisa: rupees(5_000) }),
    row({ id: 'b', name: 'Aputure 600D', assetCode: 'LIT-004', brand: 'Aputure', model: '600D' }),
  ]

  it('matches name, code, brand and model', () => {
    expect(filterDepositRows(rows, { search: 'lit-004' }).map((r) => r.id)).toEqual(['b'])
    expect(filterDepositRows(rows, { search: 'sony' }).map((r) => r.id)).toEqual(['a'])
  })

  it('keeps only products nobody has decided on', () => {
    expect(filterDepositRows(rows, { onlyUnset: true }).map((r) => r.id)).toEqual(['b'])
  })
})

describe('dirty detection and warnings', () => {
  it('compares parsed values, so reformatting the same figure is not a change', () => {
    const r = row({ fixedPaisa: rupees(15_000) })
    expect(depositDraftIsDirty(r, { fixed: '15,000', percent: '', replacement: '' })).toBe(false)
    expect(depositDraftIsDirty(r, { fixed: '15001', percent: '', replacement: '' })).toBe(true)
  })

  it('treats an unparseable draft as dirty so it cannot be saved silently', () => {
    const r = row()
    expect(depositDraftIsDirty(r, { fixed: '-5', percent: '', replacement: '' })).toBe(true)
  })

  it('lists changed fields only', () => {
    const current = { fixedPaisa: null, percent: 10, replacementPaisa: rupees(100) }
    expect(changedDepositFields(current, { ...current, fixedPaisa: 0 })).toEqual(['deposit_fixed'])
    expect(changedDepositFields(current, current)).toEqual([])
  })

  it('warns on a percentage with no replacement value, and nowhere else', () => {
    expect(depositRowWarning(row({ percent: 20 }))).toContain('replacement value is missing')
    expect(depositRowWarning(row({ percent: 20, replacementPaisa: rupees(100) }))).toBeNull()
    expect(depositRowWarning(row({ fixedPaisa: rupees(100) }))).toBeNull()
  })

  it('builds a draft that round-trips the row', () => {
    const r = row({ fixedPaisa: rupees(5_000), percent: 12.5, replacementPaisa: rupees(4_20_000) })
    expect(depositDraftFromRow(r)).toEqual({ fixed: '5000', percent: '12.5', replacement: '420000' })
  })
})

describe('CSV round trip', () => {
  const rows = [
    row({ id: 'a', name: 'Sony FX3', assetCode: 'CAM-001', fixedPaisa: rupees(15_000), percent: null, replacementPaisa: rupees(4_20_000) }),
    row({ id: 'b', name: 'Aputure 600D', assetCode: 'LIT-004', brand: 'Aputure', model: '600D' }),
  ]

  it('exports the editable columns as plain values and re-imports with no changes', () => {
    const csv = buildDepositSetupCsv(rows)
    const preview = previewDepositSetupCsv(csv, rows)
    expect(preview.ok).toBe(true)
    expect(preview.changes).toEqual([])
    expect(preview.unchanged).toBe(2)
    expect(preview.dataRows).toBe(2)
  })

  it('matches by asset code first and by name/brand/model when the code is absent', () => {
    const csv = 'name,brand,model,deposit_fixed\r\nSony FX3,Sony,FX3,20000\r\n'
    const preview = previewDepositSetupCsv(csv, rows)
    expect(preview.ok).toBe(true)
    expect(preview.changes.map((c) => c.productId)).toEqual(['a'])
    expect(preview.changes[0]!.changes).toEqual([{ field: 'deposit_fixed', from: rupees(15_000), to: rupees(20_000) }])
  })

  it('preserves columns the file does not carry', () => {
    const csv = 'asset_code,deposit_percent\r\nCAM-001,25\r\n'
    const preview = previewDepositSetupCsv(csv, rows)
    expect(preview.ok).toBe(true)
    expect(preview.changes[0]!.newValues).toEqual({
      fixedPaisa: rupees(15_000),
      percent: 25,
      replacementPaisa: rupees(4_20_000),
    })
  })

  it('clears a value when its column is present and the cell is blank', () => {
    const csv = 'asset_code,deposit_fixed\r\nCAM-001,\r\n'
    const preview = previewDepositSetupCsv(csv, rows)
    expect(preview.ok).toBe(true)
    expect(preview.changes[0]!.changes).toEqual([{ field: 'deposit_fixed', from: rupees(15_000), to: null }])
  })

  it('refuses an unmatched row, a duplicate product and an invalid value instead of skipping them', () => {
    const unknown = previewDepositSetupCsv('asset_code,deposit_fixed\r\nNOPE-1,100\r\n', rows)
    expect(unknown.ok).toBe(false)
    expect(unknown.rowErrors.join(' ')).toContain('No active product matches')

    const twice = previewDepositSetupCsv(
      'asset_code,deposit_fixed\r\nCAM-001,100\r\nCAM-001,200\r\n',
      rows,
    )
    expect(twice.ok).toBe(false)
    expect(twice.rowErrors.join(' ')).toContain('already appears on row 2')

    const invalid = previewDepositSetupCsv('asset_code,deposit_percent\r\nCAM-001,120\r\n', rows)
    expect(invalid.ok).toBe(false)
    expect(invalid.rowErrors.join(' ')).toContain('percentage from 0 to 100')
  })

  it('refuses a file with no value column, and one with no data rows', () => {
    const noValues = previewDepositSetupCsv('asset_code,name\r\nCAM-001,Sony FX3\r\n', rows)
    expect(noValues.ok).toBe(false)
    expect(noValues.fileErrors.join(' ')).toContain('nothing to apply')

    const noRows = previewDepositSetupCsv('asset_code,deposit_fixed\r\n', rows)
    expect(noRows.ok).toBe(false)
    expect(noRows.fileErrors.join(' ')).toContain('no data rows')
  })

  it('refuses a file the parser could not read', () => {
    const broken = previewDepositSetupCsv('asset_code,deposit_fixed\r\n"CAM-001,100\r\n', rows)
    expect(broken.ok).toBe(false)
    expect(broken.fileErrors.length).toBeGreaterThan(0)
  })

  it('ignores columns it does not know', () => {
    const csv = 'asset_code,effective_deposit,deposit_fixed\r\nCAM-001,"Rs 15,000",15000\r\n'
    const preview = previewDepositSetupCsv(csv, rows)
    expect(preview.ok).toBe(true)
    expect(preview.unchanged).toBe(1)
  })

  it('reports a change as one sentence a person can check', () => {
    expect(describeDepositChange({ field: 'deposit_fixed', from: rupees(15_000), to: null })).toBe(
      'Fixed deposit: Rs 15,000 to not set',
    )
    expect(describeDepositChange({ field: 'deposit_percent', from: null, to: 25 })).toBe('Deposit percent: not set to 25%')
  })
})
