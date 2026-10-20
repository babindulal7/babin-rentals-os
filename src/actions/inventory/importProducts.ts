import { createAction, type ActionConfig, type ActionContext } from '../core'
import { supabase } from '../../lib/supabase'
import {
  canImportProducts,
  productIdentityKey,
  validateImportedProduct,
  type ImportedProductFields,
} from '../../lib/productImport'
import { createEquipment, type EquipmentUnitInput } from './createEquipment'

/**
 * # IMPORT_PRODUCTS — the bulk half of the catalogue CSV import (BQ-407)
 *
 * Mirrors `actions/clients/importClients.ts` row for row, because that file
 * already solved the problems this one has:
 *
 *   - **one receipt key per row** (Law 8): a retry of a half-finished import
 *     replays the SAME keys, so a product already saved is recognised by its
 *     `products.client_uuid` read-back instead of being created twice;
 *   - **online, or refused** — every row needs the database's asset-code
 *     allocator, exactly like a single Create;
 *   - **stop at the first failure** — the operator fixes the row and retries;
 *     the rows after it are untouched, so nothing is half-committed;
 *   - **duplicates block the whole commit** (BQ-407: "block commit on
 *     duplicate keys"), re-checked against the live catalogue at commit time,
 *     because the file may have sat on disk since the dry-run.
 *
 * What the import creates: **Draft** catalogue rows. The Ready-to-Rent gate
 * that activates a product is the Add Equipment page's own rule; a bulk import
 * cannot clear a gate it cannot evaluate. Imported rows are reviewed, then
 * activated one by one.
 *
 * Serialised rows place their units in ONE facility for the whole file
 * (`serialHome`), because `product_units.warehouse_id` is NOT NULL and a CSV
 * row carries no bin. Re-shelving imported units is floor work afterwards.
 */
export interface ProductImportEntry {
  rowIndex: number
  /** Law 8 — the `products` row key, minted where the operator acted, stable across retries. */
  clientUuid: string
  values: ImportedProductFields
  /** Law 8 — one key per serialised unit, in `values.serials` order. */
  unitUuids?: readonly string[] | undefined
}

export interface ProductImportOutcome {
  rowIndex: number
  status: 'saved' | 'failed' | 'unconfirmed' | 'pending'
  productId?: string
  assetCode?: string
  unitCount?: number
  message?: string
}

export interface ImportProductsInput {
  rows: readonly ProductImportEntry[]
  /** Required when any row is Serialised — where the imported units land. */
  serialHome?: { warehouseName: string; rack: string; shelf: string; bin: string } | undefined
  onProgress?: (outcomes: readonly ProductImportOutcome[]) => void
  shouldStop?: () => boolean
}

export interface ImportProductsResult {
  outcomes: ProductImportOutcome[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEOUT_MS = 20_000
class ImportConfirmationTimeout extends Error {}

/** A timeout is uncertain: the server may have saved the row. Retry its original receipt key. */
async function confirmedWithin<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ImportConfirmationTimeout(
                'Save confirmation timed out. Retry this import to check the same save; a second product will not be created.',
              ),
            ),
          TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export const importProductsConfig: ActionConfig<ImportProductsInput, ImportProductsResult> = {
  name: 'IMPORT_PRODUCTS',
  permissions: ['inventory.create'],
  implemented: true,

  validate(input) {
    if (!input.rows.length) throw new Error('Include at least one valid product row.')
    const keys = new Set<string>()
    const indices = new Set<number>()
    for (const row of input.rows) {
      if (!Number.isInteger(row.rowIndex) || row.rowIndex < 0 || indices.has(row.rowIndex)) {
        throw new Error('Every import row must have a unique row number.')
      }
      indices.add(row.rowIndex)
      if (!UUID.test(row.clientUuid) || keys.has(row.clientUuid.toLowerCase())) {
        throw new Error('Every import row must have its own save key.')
      }
      keys.add(row.clientUuid.toLowerCase())
      const errors = validateImportedProduct(row.values)
      if (errors.length) throw new Error(`Row ${row.rowIndex + 1}: ${errors.join(' ')}`)
      if (row.values.tracking === 'Serialised') {
        const unitKeys = row.unitUuids ?? []
        if (unitKeys.length !== row.values.serials.length) {
          throw new Error(`Row ${row.rowIndex + 1}: every serialised unit needs its own save key.`)
        }
        const seenUnit = new Set<string>()
        for (const key of unitKeys) {
          if (!UUID.test(key) || seenUnit.has(key.toLowerCase())) {
            throw new Error(`Row ${row.rowIndex + 1}: every serialised unit needs its own save key.`)
          }
          seenUnit.add(key.toLowerCase())
        }
        if (!input.serialHome?.warehouseName) {
          throw new Error('Serialised rows need the warehouse that imported units land in.')
        }
      }
    }
  },

  async execute(input, ctx: ActionContext) {
    if (!canImportProducts(ctx.role)) throw new Error('Your role cannot import the equipment catalogue.')
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('Connect to import products. Your file and mappings are still here.')
    }

    const rows = input.rows.map((row) => ({
      ...row,
      values: { ...row.values },
      ...(row.unitUuids ? { unitUuids: [...row.unitUuids] } : {}),
    }))
    importProductsConfig.validate({ rows, serialHome: input.serialHome })

    /* Previous attempts reconcile by receipt key: a row already saved is
       reported as saved, never inserted twice. */
    const savedByKey = new Map<string, { id: string; assetCode: string }>()
    for (let offset = 0; offset < rows.length; offset += 100) {
      const { data, error } = await confirmedWithin(
        Promise.resolve(
          supabase
            .from('products')
            .select('id, asset_code, client_uuid')
            .in('client_uuid', rows.slice(offset, offset + 100).map((row) => row.clientUuid)),
        ),
      )
      if (error) throw new Error(`Previous saves could not be checked: ${error.message}`)
      for (const row of (data ?? []) as unknown as Array<{ id: string; asset_code: string; client_uuid: string }>) {
        savedByKey.set(row.client_uuid.toLowerCase(), { id: row.id, assetCode: row.asset_code })
      }
    }

    /* BQ-407 duplicate block, against the live catalogue at commit time. The
       catalogue is small (it is a rental shop, not a warehouse log), so one
       full read is both simpler and more honest than name-only server filters. */
    const { data: catalogue, error: catalogueError } = await confirmedWithin(
      Promise.resolve(supabase.from('products').select('id, name, brand, model, client_uuid').limit(5000)),
    )
    if (catalogueError) throw new Error(`The catalogue could not be read for duplicate checking: ${catalogueError.message}`)
    const existing = (
      (catalogue ?? []) as unknown as Array<{
        id: string
        name: string
        brand: string
        model: string | null
        client_uuid: string
      }>
    )
      /* A row this same import already saved (reconciled above) is not a duplicate of itself. */
      .filter((p) => !savedByKey.has(p.client_uuid.toLowerCase()))
      .map((p) => ({ key: productIdentityKey(p.name, p.brand, p.model), id: p.id }))
    const duplicate = rows.find((row) => {
      const key = productIdentityKey(row.values.name, row.values.brand, row.values.model)
      return !savedByKey.has(row.clientUuid) && existing.some((p) => p.key === key)
    })
    if (duplicate) {
      throw new Error(
        `Row ${duplicate.rowIndex + 1} (${duplicate.values.name}) matches a product already in the catalogue. ` +
          'Nothing new was saved. Review the duplicate and skip that row.',
      )
    }

    const outcomes: ProductImportOutcome[] = rows.map((row) => {
      const prior = savedByKey.get(row.clientUuid)
      return prior
        ? { rowIndex: row.rowIndex, status: 'saved', productId: prior.id, assetCode: prior.assetCode, message: 'Saved by a previous attempt of this import.' }
        : { rowIndex: row.rowIndex, status: 'pending' }
    })

    for (let index = 0; index < rows.length; index++) {
      if (input.shouldStop?.()) break
      const row = rows[index]!
      if (outcomes[index]!.status === 'saved') {
        input.onProgress?.([...outcomes])
        continue
      }
      try {
        const serialised = row.values.tracking === 'Serialised'
        const units: EquipmentUnitInput[] | undefined = serialised
          ? row.values.serials.map((serial, i) => ({
              serial,
              condition: 'Good',
              clientUuid: row.unitUuids?.[i] ?? row.clientUuid,
            }))
          : undefined
        const saved = await confirmedWithin(
          createEquipment(
            {
              clientUuid: row.clientUuid,
              name: row.values.name,
              category: row.values.category,
              brand: row.values.brand,
              ...(row.values.model !== undefined ? { model: row.values.model } : {}),
              tracking: row.values.tracking,
              ...(units !== undefined ? { units } : {}),
              ...(row.values.quantity !== undefined ? { quantity: row.values.quantity } : {}),
              ...(serialised && input.serialHome
                ? {
                    warehouseName: input.serialHome.warehouseName,
                    location: {
                      rack: input.serialHome.rack,
                      shelf: input.serialHome.shelf,
                      bin: input.serialHome.bin,
                    },
                  }
                : {}),
              status: 'Draft',
              ...(row.values.dailyRatePaisa !== undefined
                ? { dailyRatePaisa: row.values.dailyRatePaisa }
                : {}),
              ...(row.values.description !== undefined ? { description: row.values.description } : {}),
              ...(row.values.notes !== undefined ? { internalNotes: row.values.notes } : {}),
            },
            ctx,
          ),
        )
        if (!saved.productId || !saved.assetCode) {
          throw new Error('Save confirmation was incomplete. Retry with the same save key.')
        }
        outcomes[index] = {
          rowIndex: row.rowIndex,
          status: 'saved',
          productId: saved.productId,
          assetCode: saved.assetCode,
          unitCount: saved.unitCount,
        }
      } catch (error: unknown) {
        outcomes[index] = {
          rowIndex: row.rowIndex,
          status: error instanceof ImportConfirmationTimeout ? 'unconfirmed' : 'failed',
          message: error instanceof Error ? error.message : 'This row could not be saved. Retry with the same save key.',
        }
        input.onProgress?.([...outcomes])
        break
      }
      input.onProgress?.([...outcomes])
    }
    return { result: { outcomes }, events: [] }
  },
}

export const importProducts = createAction(importProductsConfig)
