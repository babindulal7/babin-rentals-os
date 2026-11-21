import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import type { ImportedBundleFields } from '../../lib/bundleImport'

/**
 * # IMPORT_BUNDLES — bulk import bundles (kit-style products)
 *
 * RULING 2026-10-27 (B4, B45): kit-style products that are bundles (18 Aug).
 *
 * Calls `createBundle` and `createBundleLines` — one atomic batch per bundle.
 *
 * Who may: Owner, Admin, Manager (`inventory.create` + `canCreateBundle`).
 */

export interface ImportBundlesInput {
  /** Array of complete bundles with lines. */
  bundles: ImportedBundleFields[]
  /** One per attempt (Law 8). The caller keeps it across retries of the same request. */
  clientUuid: string
  /** Optional free text, kept with the audit record. At most 500 characters. */
  note?: string
  /** Optional Booqable metadata for external_refs. */
  booqableId?: string
  storeSlug?: string
}

export interface ImportBundlesOutcome {
  rowIndex: number
  status: 'saved' | 'failed' | 'unconfirmed' | 'pending'
  productId?: string
  message?: string
}

export interface ImportBundlesResult {
  created: number
  updated: number
  skipped: number
  bundles: Array<{ id: string; bundleCode: string; name: string; action: 'created' | 'updated' }>
}

export const importBundlesConfig: ActionConfig<ImportBundlesInput, ImportBundlesResult> = {
  name: 'IMPORT_BUNDLES',
  permissions: ['inventory.create'],
  implemented: true,

  validate(input) {
    if (!input.bundles || input.bundles.length === 0) {
      throw new Error('At least one bundle is required.')
    }
    if (!input.clientUuid || !/^[0-9a-f-]{36}$/i.test(input.clientUuid)) {
      throw new Error('A valid client UUID (request key) is required.')
    }
    if (input.note && input.note.length > 500) {
      throw new Error('A note can be at most 500 characters.')
    }
    // Validate each bundle
    for (const b of input.bundles) {
      if (!b.bundleCode || !b.bundleCode.trim()) throw new Error('Bundle Code is required.')
      if (!b.name || !b.name.trim()) throw new Error('Bundle Name is required.')
      if (!b.category || !b.category.trim()) throw new Error('Bundle Category is required.')
      if (!b.bundleRatePaisa || b.bundleRatePaisa < 0) throw new Error('Bundle Rate must be a non-negative amount.')
      if (!b.lines || b.lines.length === 0) throw new Error(`Bundle "${b.name}" must have at least one line.`)
      for (const line of b.lines) {
        if (!['equipment', 'crew', 'vehicle', 'box'].includes(line.kind)) {
          throw new Error(`Line kind must be equipment, crew, vehicle, or box.`)
        }
        if (!line.model || !line.model.trim()) throw new Error('Line Model is required.')
        if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('Line Quantity must be a whole number ≥ 1.')
      }
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Importing bundles needs a connection. Nothing was saved.')
    }
    const { bundles } = input
    const created: ImportBundlesResult['bundles'] = []

    for (const bundle of bundles) {
      // Check if bundle already exists
      const { data: existing } = await supabase
        .from('bundles')
        .select('id, bundle_code')
        .eq('bundle_code', bundle.bundleCode.toUpperCase())
        .is('retired_at', null)
        .maybeSingle()

      let bundleId: string
      let action: 'created' | 'updated'

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('bundles')
          .update({
            name: bundle.name,
            category: bundle.category,
            tags: bundle.tags,
            bundle_rate_paisa: bundle.bundleRatePaisa,
            updated_at: new Date().toISOString(),
            updated_by: ctx.userId,
          })
          .eq('id', existing.id)
        if (error) throw new Error(error.message)
        bundleId = existing.id
        action = 'updated'
      } else {
        // Create new
        const { data, error } = await supabase
          .from('bundles')
          .insert({
            bundle_code: bundle.bundleCode.toUpperCase(),
            name: bundle.name,
            category: bundle.category,
            tags: bundle.tags,
            bundle_rate_paisa: bundle.bundleRatePaisa,
            state: bundle.state,
            created_by: ctx.userId,
          })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        bundleId = data.id
        action = 'created'
      }

      // Handle lines - delete old and insert new
      await supabase
        .from('bundle_lines')
        .update({ retired_at: new Date().toISOString() })
        .eq('bundle_id', bundleId)
        .is('retired_at', null)

      if (bundle.lines.length > 0) {
        const { error } = await supabase
          .from('bundle_lines')
          .insert(bundle.lines.map((line, i) => ({
            bundle_id: bundleId,
            sort_order: i,
            kind: line.kind,
            model: line.model,
            quantity: line.quantity,
            mandatory: line.mandatory,
            substitutes: line.substitutes,
            product_id: line.productId ?? null,
            crew_id: line.crewId ?? null,
            vehicle_id: line.vehicleId ?? null,
            created_by: ctx.userId,
          })))
        if (error) throw new Error(error.message)
      }

      // Handle Booqable metadata in external_refs
      const externalRefs = {
        booqable_id: bundle.booqableId,
        store_slug: bundle.storeSlug,
      }

      const { error: updateError } = await supabase
        .from('bundles')
        .update({ external_refs: externalRefs, updated_at: new Date().toISOString() })
        .eq('id', bundleId)
      if (updateError) throw new Error(updateError.message)

      created.push({ id: bundleId, bundleCode: bundle.bundleCode.toUpperCase(), name: bundle.name, action })
    }

    const events: Array<{ type: string; payload: unknown }> = [
      { type: 'BUNDLES_IMPORTED', payload: { bundles: created } },
    ]

    return { result: { created: created.filter(c => c.action === 'created').length, updated: created.filter(c => c.action === 'updated').length, skipped: 0, bundles: created }, events }
  },
}

export const importBundles = createAction(importBundlesConfig)