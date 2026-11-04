import { createAction, type ActionConfig, type ActionContext } from '../core'
import { saveRecordSection } from '../recordEditor'
import { readRecordEditor } from '../../lib/queries/recordEditor'
import { newClientUuid } from '../../lib/supabase'
import { toRupees, type Paisa } from '../../lib/money'
import { canEditProductDeposits } from '../../lib/rbac'
import {
  changedDepositFields,
  depositDraftValuesFromRecord,
  type DepositDraftValues,
} from '../../lib/depositSetup'
import type { RecordValues } from '../../lib/recordEditor'

/**
 * # SAVE_PRODUCT_DEPOSITS — the write half of the T3-02 deposit editor
 *
 * The deposit columns already exist and the equipment record editor already
 * owns the write path, so this action adds no schema of its own. It drives the
 * same `save_record_section` RPC, one section at a time, because the three
 * columns live in two sections:
 *
 *   - `pricing`  — `deposit_fixed`, `deposit_percent`
 *   - `purchase` — `replacement_value`
 *
 * ## Why a read precedes every product
 *
 * `save_record_section` is optimistic: it demands the revision of the snapshot
 * the caller has. `products_v` cannot supply that revision (it is computed from
 * the full base row plus `updated_at`), so each product is read through
 * `read_record_editor` immediately before its write. The read is also what makes
 * "unchanged" honest: if someone else already made the same change, this writes
 * nothing and says so rather than claiming a save.
 *
 * ## One receipt key per section
 *
 * Law 8 requires a `client_uuid` on every write, and the RPC's receipt table
 * answers a given key with the request it first accepted. The same key cannot
 * stand for two different requests, so the pricing and purchase calls get a key
 * each. A retry of the whole action re-reads first: a section that already
 * landed compares equal and is skipped, so rewrites are idempotent by value even
 * though each attempt mints fresh keys.
 *
 * ## Stop at the first failure
 *
 * ~180 products are edited in one sitting. Continuing past a failure would
 * leave an operator unsure which rows were written; stopping makes the boundary
 * exact, and the returned outcomes mark every product not attempted. Nothing is
 * queued offline: the revision is server state (R-40's rule for custody writes
 * applies to money-adjacent writes too).
 */

export interface ProductDepositSave {
  id: string
  productName: string
  fixedPaisa: number | null
  percent: number | null
  replacementPaisa: number | null
}

export interface SaveProductDepositsInput {
  products: ProductDepositSave[]
  /** Called after each product, with the current outcomes summarised. */
  onProgress?: (done: number, total: number, productName: string) => void
  /** Checked before each product; a true answer stops before the next write. */
  shouldStop?: () => boolean
}

export type ProductDepositOutcomeStatus = 'pending' | 'saved' | 'unchanged' | 'failed' | 'stopped'

export interface ProductDepositOutcome {
  productId: string
  productName: string
  status: ProductDepositOutcomeStatus
  message?: string
  /** The figures the row now holds, when the outcome is saved/unchanged. */
  values?: DepositDraftValues
}

export interface SaveProductDepositsResult {
  outcomes: ProductDepositOutcome[]
  savedCount: number
  unchangedCount: number
  failedCount: number
  stopped: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEOUT_MS = 20_000

class DepositSaveTimeout extends Error {}

/**
 * A timeout is uncertain, not a refusal: the row may have been written. The
 * message says only what is known, and the next Save re-reads before writing.
 */
async function confirmedWithin<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new DepositSaveTimeout(
                'The save was not confirmed within 20 seconds. It may or may not have reached the server. ' +
                  'Save again: the next attempt reads the product first and will not write the same figures twice.',
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

/** Integer paisa to the rupees `products` stores; the one conversion point. */
function toDbRupees(paisa: number): number {
  return toRupees(paisa as Paisa)
}

function validateAmount(value: number | null, label: string): void {
  if (value === null) return
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole, non-negative number of paisa.`)
  }
}

function validatePercent(value: number | null): void {
  if (value === null) return
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('Deposit percent must be from 0 to 100.')
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-9) {
    throw new Error('Deposit percent can carry at most two decimals.')
  }
}

/** Validates an input batch before the first write, so a bad row is not row 90. */
export function validateProductDeposits(products: readonly ProductDepositSave[]): void {
  if (products.length === 0) throw new Error('There are no deposit changes to save.')
  const ids = new Set<string>()
  for (const product of products) {
    if (!UUID.test(product.id)) throw new Error('A product ID in this save is not valid.')
    if (ids.has(product.id)) throw new Error(`${product.productName} appears more than once in this save.`)
    ids.add(product.id)
    validateAmount(product.fixedPaisa, `${product.productName}: fixed deposit`)
    validateAmount(product.replacementPaisa, `${product.productName}: replacement value`)
    validatePercent(product.percent)
  }
}

export const saveProductDepositsConfig: ActionConfig<SaveProductDepositsInput, SaveProductDepositsResult> = {
  name: 'SAVE_PRODUCT_DEPOSITS',
  permissions: ['inventory.update'],
  implemented: true,

  validate(input) {
    validateProductDeposits(input.products)
  },

  async execute(input, ctx: ActionContext) {
    if (!canEditProductDeposits(ctx.role)) {
      throw new Error('Your role cannot change product deposits.')
    }
    if (ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new Error('Connect to save deposit changes. Nothing has been queued and your edits are still here.')
    }

    /* Re-validate the copied batch, the way importProducts does: the dispatcher
       already ran `validate`, but the body must not trust a caller that skipped
       it, and the copy isolates the loop from later mutation of the input. */
    const products = input.products.map((product) => ({ ...product }))
    validateProductDeposits(products)

    const outcomes: ProductDepositOutcome[] = products.map((product) => ({
      productId: product.id,
      productName: product.productName,
      status: 'pending',
    }))
    const total = products.length

    const publish = (index: number): void => {
      input.onProgress?.(index + 1, total, products[index]?.productName ?? '')
    }

    for (let index = 0; index < products.length; index++) {
      if (input.shouldStop?.()) {
        for (let rest = index; rest < products.length; rest++) {
          outcomes[rest] = { ...outcomes[rest]!, status: 'stopped', message: 'Stopped by the operator; this product was not saved.' }
        }
        return { result: summarise(outcomes, true), events: [] }
      }

      const product = products[index]!
      const next: DepositDraftValues = {
        fixedPaisa: product.fixedPaisa,
        percent: product.percent,
        replacementPaisa: product.replacementPaisa,
      }

      let pricingSaved = false
      let purchaseAttempted = false
      try {
        const snapshot = await confirmedWithin(readRecordEditor('equipment', product.id))
        const current = depositDraftValuesFromRecord(snapshot.values)
        const fields = changedDepositFields(current, next)

        if (fields.length === 0) {
          outcomes[index] = { ...outcomes[index]!, status: 'unchanged', message: 'Already holds these figures.', values: current }
          publish(index)
          continue
        }

        let revision = snapshot.revision
        const pricingFields = fields.filter((field) => field === 'deposit_fixed' || field === 'deposit_percent')
        if (pricingFields.length > 0) {
          const values: RecordValues = {}
          for (const field of pricingFields) {
            if (field === 'deposit_fixed') values.deposit_fixed = next.fixedPaisa === null ? null : toDbRupees(next.fixedPaisa)
            if (field === 'deposit_percent') values.deposit_percent = next.percent
          }
          const response = await confirmedWithin(
            saveRecordSection(
              {
                kind: 'equipment',
                id: product.id,
                section: 'pricing',
                expectedRevision: revision,
                clientUuid: newClientUuid(),
                values,
              },
              ctx,
            ),
          )
          revision = response.revision
          pricingSaved = true
        }

        if (fields.includes('replacement_value')) {
          purchaseAttempted = true
          await confirmedWithin(
            saveRecordSection(
              {
                kind: 'equipment',
                id: product.id,
                section: 'purchase',
                expectedRevision: revision,
                clientUuid: newClientUuid(),
                values: { replacement_value: next.replacementPaisa === null ? null : toDbRupees(next.replacementPaisa) },
              },
              ctx,
            ),
          )
        }

        outcomes[index] = { ...outcomes[index]!, status: 'saved', values: next }
        publish(index)
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error)
        const partial =
          pricingSaved && purchaseAttempted
            ? 'The deposit figures were saved, but the replacement value was not. '
            : ''
        outcomes[index] = {
          ...outcomes[index]!,
          status: 'failed',
          message: `${partial}${detail}`,
        }
        for (let rest = index + 1; rest < products.length; rest++) {
          outcomes[rest] = {
            ...outcomes[rest]!,
            status: 'stopped',
            message: `Not attempted after ${product.productName} failed.`,
          }
        }
        publish(index)
        return { result: summarise(outcomes, false), events: [] }
      }
    }

    return { result: summarise(outcomes, false), events: [] }
  },
}

function summarise(outcomes: ProductDepositOutcome[], stopped: boolean): SaveProductDepositsResult {
  return {
    outcomes,
    savedCount: outcomes.filter((outcome) => outcome.status === 'saved').length,
    unchangedCount: outcomes.filter((outcome) => outcome.status === 'unchanged').length,
    failedCount: outcomes.filter((outcome) => outcome.status === 'failed').length,
    stopped,
  }
}

export const saveProductDeposits = createAction(saveProductDepositsConfig)
