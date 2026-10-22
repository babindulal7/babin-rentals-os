import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importProducts, importProductsConfig, type ImportProductsInput, type ProductImportEntry } from '../importProducts'
import type { ImportedProductFields } from '../../../lib/productImport'
import type { SystemRole } from '../../../types/database'

const mocks = vi.hoisted(() => ({ create: vi.fn(), previous: vi.fn(), catalogue: vi.fn() }))
vi.mock('../createEquipment', () => ({ createEquipment: mocks.create }))
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ in: mocks.previous, limit: mocks.catalogue }) }) },
}))

const ctx = (role: SystemRole = 'Owner') => ({ userId: 'actor', role, isOnline: true })

function quantityRow(rowIndex: number, name: string): ProductImportEntry {
  const values: ImportedProductFields = {
    name,
    category: 'Lighting',
    brand: 'Aputure',
    tracking: 'Quantity',
    serials: [],
    quantity: 2,
  }
  return {
    rowIndex,
    clientUuid: `00000000-0000-4000-8000-00000000000${rowIndex}`,
    values,
  }
}

function serialisedRow(rowIndex: number, name: string): ProductImportEntry {
  const values: ImportedProductFields = {
    name,
    category: 'Cameras',
    brand: 'Sony',
    model: 'FX3',
    tracking: 'Serialised',
    serials: ['SN-1', 'SN-2'],
  }
  return {
    rowIndex,
    clientUuid: `00000000-0000-4000-8000-00000000000${rowIndex}`,
    values,
    unitUuids: [
      `00000000-0000-4000-8000-0000000001${rowIndex}0`,
      `00000000-0000-4000-8000-0000000001${rowIndex}1`,
    ],
  }
}

const SERIAL_HOME = { warehouseName: 'Central Camera Vault', rack: 'IMP', shelf: '0', bin: 'CSV' }

function input(rows: ProductImportEntry[], serialHome = SERIAL_HOME): ImportProductsInput {
  return { rows, serialHome }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.previous.mockResolvedValue({ data: [], error: null })
  mocks.catalogue.mockResolvedValue({ data: [], error: null })
  mocks.create.mockImplementation(async (fields: { clientUuid: string; tracking: string }) => ({
    productId: `product-${fields.clientUuid.slice(-1)}`,
    assetCode: 'EQ000001',
    status: 'Draft',
    unitCount: fields.tracking === 'Serialised' ? 2 : 0,
  }))
})
afterEach(() => vi.useRealTimers())

describe('product import write outcomes (BQ-407)', () => {
  it('writes each valid row as a Draft through createEquipment, serials included', async () => {
    const rows = [quantityRow(0, 'Aputure 600d Pro'), serialisedRow(1, 'Sony FX3')]
    const progress = vi.fn()
    const result = await importProducts({ ...input(rows), onProgress: progress }, ctx())
    expect(result.outcomes.map((r) => r.status)).toEqual(['saved', 'saved'])
    expect(mocks.create).toHaveBeenCalledTimes(2)

    const first = mocks.create.mock.calls[0]![0] as Record<string, unknown>
    expect(first.status).toBe('Draft')
    expect(first.quantity).toBe(2)
    expect(first).not.toHaveProperty('units')

    const second = mocks.create.mock.calls[1]![0] as Record<string, unknown>
    expect(second.status).toBe('Draft')
    expect(second.warehouseName).toBe(SERIAL_HOME.warehouseName)
    expect(second.location).toEqual({ rack: 'IMP', shelf: '0', bin: 'CSV' })
    expect((second.units as Array<{ serial: string }>).map((u) => u.serial)).toEqual(['SN-1', 'SN-2'])
    expect(progress).toHaveBeenCalledTimes(2)
  })

  it('stops on the first failure and leaves later rows pending', async () => {
    const rows = [quantityRow(0, 'Light One'), quantityRow(1, 'Light Two'), quantityRow(2, 'Light Three')]
    mocks.create.mockResolvedValueOnce({ productId: 'p-1', assetCode: 'EQ000001', status: 'Draft', unitCount: 0 })
      .mockRejectedValueOnce(new Error('Database refused row'))
    const result = await importProducts(input(rows), ctx())
    expect(result.outcomes.map((r) => r.status)).toEqual(['saved', 'failed', 'pending'])
    expect(result.outcomes[1]!.message).toBe('Database refused row')
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('recognises a row a previous attempt already saved, by its receipt key, without writing again', async () => {
    const row = quantityRow(0, 'Aputure 600d Pro')
    mocks.previous.mockResolvedValue({ data: [{ id: 'saved-id', asset_code: 'EQ000009', client_uuid: row.clientUuid }], error: null })
    const result = await importProducts(input([row]), ctx())
    expect(result.outcomes[0]).toMatchObject({ status: 'saved', productId: 'saved-id', assetCode: 'EQ000009' })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('marks a timed-out save as unconfirmed, with later rows untouched', async () => {
    vi.useFakeTimers()
    mocks.create.mockImplementationOnce(() => new Promise(() => {}))
    const work = importProductsConfig.execute(
      input([quantityRow(0, 'Light One'), quantityRow(1, 'Light Two')]),
      ctx(),
    )
    await vi.advanceTimersByTimeAsync(20_001)
    const { result } = await work
    expect(result.outcomes.map((r) => r.status)).toEqual(['unconfirmed', 'pending'])
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('refuses a catalogue duplicate before any writes (BQ-407: block commit on duplicate keys)', async () => {
    mocks.catalogue.mockResolvedValue({
      data: [{ id: 'p-9', name: 'Aputure 600d Pro', brand: 'Aputure', model: null, client_uuid: 'other-key' }],
      error: null,
    })
    await expect(importProducts(input([quantityRow(0, 'Aputure 600d Pro')]), ctx())).rejects.toThrow(
      'matches a product already in the catalogue',
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('refuses to import when the catalogue read fails', async () => {
    mocks.catalogue.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(importProducts(input([quantityRow(0, 'Light One')]), ctx())).rejects.toThrow('catalogue could not be read')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('stops after the current row when asked', async () => {
    const rows = [quantityRow(0, 'Light One'), quantityRow(1, 'Light Two')]
    let stop = false
    const result = await importProducts(
      { ...input(rows), shouldStop: () => stop, onProgress: () => { stop = true } },
      ctx(),
    )
    expect(result.outcomes.map((r) => r.status)).toEqual(['saved', 'pending'])
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it.each(['Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as SystemRole[])(
    'refuses %s before reading or writing anything',
    async (role) => {
      await expect(importProducts(input([quantityRow(0, 'Light One')]), ctx(role))).rejects.toThrow()
      expect(mocks.previous).not.toHaveBeenCalled()
      expect(mocks.create).not.toHaveBeenCalled()
    },
  )

  it('refuses offline work instead of queueing it', async () => {
    await expect(importProducts(input([quantityRow(0, 'Light One')]), { ...ctx(), isOnline: false })).rejects.toThrow('Connect')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('validates every row before the first read', async () => {
    const rows = [quantityRow(0, 'Light One'), quantityRow(1, 'Light Two')]
    rows[1]!.values.quantity = 0
    await expect(importProducts(input(rows), ctx())).rejects.toThrow('Row 2')
    expect(mocks.previous).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('refuses duplicate receipt keys and a serialised row without its unit keys', () => {
    const first = quantityRow(0, 'Light One')
    const second = quantityRow(1, 'Light Two')
    expect(() => importProductsConfig.validate(input([first, { ...second, clientUuid: first.clientUuid }]))).toThrow('save key')
    const serialised = serialisedRow(0, 'Sony FX3')
    expect(() => importProductsConfig.validate(input([{ ...serialised, unitUuids: undefined }]))).toThrow('save key')
    expect(() => importProductsConfig.validate(input([{ ...serialised, unitUuids: ['00000000-0000-4000-8000-00000000010'.repeat(1)] }]))).toThrow(
      'every serialised unit needs its own save key',
    )
  })

  it('refuses a serialised file that names no warehouse for the imported units', () => {
    expect(() => importProductsConfig.validate({ rows: [serialisedRow(0, 'Sony FX3')] })).toThrow('warehouse')
  })
})
