import { createAction, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import { importStructureValues, type ImportedStructureFields } from '../../lib/pricingStructureImport'

/**
 * # IMPORT_PRICING_STRUCTURES — bulk import pricing structures, rulesets and rules
 *
 * RULING 2026-10-27 (B4, D20): Booqable pricing structures ("Babin Daily", "Days wise discount",
 * "Rental Rate Card") and 4 seasonal rulesets (SUMMER25, New Year, Christmas A-2) with end dates
 * so they expire on their own (D20).
 *
 * Calls `createPricingStructure`, `createPricingStructureTiles`, `createPricingRuleset`,
 * `createPricingRules` — one atomic batch per structure.
 *
 * Who may: Owner, Admin, Manager (`inventory.create`).
 */

export interface ImportPricingStructuresInput {
  /** Array of complete structures with tiles, rulesets and rules. */
  structures: ImportedStructureFields[]
  /** One per attempt (Law 8). The caller keeps it across retries of the same request. */
  clientUuid: string
  /** Optional free text, kept with the audit record. At most 500 characters. */
  note?: string
  /** Optional Booqable metadata for external_refs. */
  booqableId?: string
  storeSlug?: string
}

export interface ImportPricingStructuresOutcome {
  rowIndex: number
  status: 'saved' | 'failed' | 'unconfirmed' | 'pending'
  productId?: string
  message?: string
}

export interface ImportPricingStructuresResult {
  created: number
  updated: number
  skipped: number
  structures: Array<{ id: string; name: string; action: 'created' | 'updated' }>
}

export const importPricingStructuresConfig: ActionConfig<ImportPricingStructuresInput, ImportPricingStructuresResult> = {
  name: 'IMPORT_PRICING_STRUCTURES',
  permissions: ['inventory.create'],
  implemented: true,

  validate(input) {
    if (!input.structures || input.structures.length === 0) {
      throw new Error('At least one pricing structure is required.')
    }
    if (!input.clientUuid || !/^[0-9a-f-]{36}$/i.test(input.clientUuid)) {
      throw new Error('A valid client UUID (request key) is required.')
    }
    if (input.note && input.note.length > 500) {
      throw new Error('A note can be at most 500 characters.')
    }
    // Validate each structure
    for (const s of input.structures) {
      if (!s.name || !s.name.trim()) throw new Error('Structure name is required.')
      if (!s.tiles || s.tiles.length === 0) throw new Error(`Structure "${s.name}" must have at least one tile.`)
      for (const t of s.tiles) {
        if (!Number.isInteger(t.durationDays) || t.durationDays < 1) throw new Error('Tile duration must be a positive integer.')
        if (!Number.isFinite(t.amountPaisa) || t.amountPaisa < 0) throw new Error('Tile amount must be a non-negative amount.')
      }
      for (const rs of s.rulesets) {
        if (!rs.name || !rs.name.trim()) throw new Error('Ruleset name is required.')
        if (rs.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(rs.validUntil)) {
          throw new Error(`Ruleset "${rs.name}" valid_until must be YYYY-MM-DD.`)
        }
        for (const r of rs.rules) {
          if (!r.name || !r.name.trim()) throw new Error('Rule name is required.')
          if (!['charge', 'price'].includes(r.kind)) throw new Error('Rule kind must be "charge" or "price".')
          if (r.kind === 'charge') {
            if (!['skip_pickup_day', 'skip_return_day'].includes(r.chargeAction!)) {
              throw new Error('Charge action must be skip_pickup_day or skip_return_day.')
            }
          } else {
            if (typeof r.percent !== 'number' || r.percent < -100 || r.percent > 1000) {
              throw new Error('Price rule percent must be between -100 and 1000.')
            }
            if (!['overlaps', 'fits_within', 'spans'].includes(r.applyWhen)) {
              throw new Error('apply_when must be overlaps, fits_within, or spans.')
            }
            if (r.from && r.to && r.from > r.to) {
              throw new Error('Rule valid_from cannot be after valid_to.')
            }
          }
        }
      }
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Importing pricing structures needs a connection. Nothing was saved.')
    }
    const { structures, note, booqableId, storeSlug } = input
    const created: ImportPricingStructuresResult['structures'] = []

    for (const structure of structures) {
      const payload = importStructureValues(structure)
      const { structure: sPayload, tiles, rulesets } = payload

      // Check if structure already exists
      const { data: existing } = await supabase
        .from('pricing_structures')
        .select('id, name')
        .eq('name', structure.name)
        .is('retired_at', null)
        .maybeSingle()

      let structureId: string
      let action: 'created' | 'updated'

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('pricing_structures')
          .update({
            extra_day_amount: sPayload.extra_day_amount,
            source_ref: sPayload.source_ref,
            updated_at: new Date().toISOString(),
            updated_by: ctx.userId,
          })
          .eq('id', existing.id)
        if (error) throw new Error(error.message)
        structureId = existing.id
        action = 'updated'
      } else {
        // Create new
        const { data, error } = await supabase
          .from('pricing_structures')
          .insert({
            ...sPayload,
            client_uuid: ctx.userId,
            created_by: ctx.userId,
          })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        structureId = data.id
        action = 'created'
      }

      // Handle tiles - delete old and insert new
      await supabase
        .from('pricing_structure_tiles')
        .update({ retired_at: new Date().toISOString() })
        .eq('structure_id', structureId)
        .is('retired_at', null)

      if (tiles.length > 0) {
        const { error } = await supabase
          .from('pricing_structure_tiles')
          .insert(tiles.map(t => ({
            structure_id: structureId,
            duration_days: t.duration_days,
            amount: t.amount,
            client_uuid: ctx.userId,
            created_by: ctx.userId,
          })))
        if (error) throw new Error(error.message)
      }

      // Handle rulesets and rules
      for (const rs of rulesets) {
        let rulesetId: string
        const { data: existingRuleset } = await supabase
          .from('pricing_rulesets')
          .select('id')
          .eq('structure_id', structureId)
          .eq('name', rs.name)
          .is('retired_at', null)
          .maybeSingle()

        if (existingRuleset) {
          const { error } = await supabase
            .from('pricing_rulesets')
            .update({
              valid_until: rs.valid_until,
              updated_at: new Date().toISOString(),
              updated_by: ctx.userId,
            })
            .eq('id', existingRuleset.id)
          if (error) throw new Error(error.message)
          rulesetId = existingRuleset.id
        } else {
          const { data, error } = await supabase
            .from('pricing_rulesets')
            .insert({
              structure_id: structureId,
              name: rs.name,
              valid_until: rs.valid_until,
              client_uuid: ctx.userId,
              created_by: ctx.userId,
            })
            .select('id')
            .single()
          if (error) throw new Error(error.message)
          rulesetId = data.id
        }

        // Rules - delete old and insert new
        await supabase
          .from('pricing_rules')
          .update({ retired_at: new Date().toISOString() })
          .eq('ruleset_id', rulesetId)
          .is('retired_at', null)

        if (rs.rules.length > 0) {
          const { error } = await supabase
            .from('pricing_rules')
            .insert(rs.rules.map((r, i) => ({
              ruleset_id: rulesetId,
              sort_order: i,
              kind: r.kind,
              name: r.name,
              charge_action: r.charge_action ?? null,
              pickup_after: r.pickup_after ?? null,
              return_before: r.return_before ?? null,
              percent: r.percent ?? null,
              weekdays: r.weekdays ?? null,
              valid_from: r.from ?? null,
              valid_to: r.to ?? null,
              apply_when: r.applyWhen,
              stack: r.stack,
              client_uuid: ctx.userId,
              created_by: ctx.userId,
            })))
          if (error) throw new Error(error.message)
        }
      }

      created.push({ id: structureId, name: structure.name, action })
    }

    const events: Array<{ type: string; payload: unknown }> = [
      { type: 'PRICING_STRUCTURES_IMPORTED', payload: { structures: created, note, booqableId, storeSlug } },
    ]

    return { result: { created: created.filter(c => c.action === 'created').length, updated: created.filter(c => c.action === 'updated').length, skipped: 0, structures: created }, events }
  },
}

export const importPricingStructures = createAction(importPricingStructuresConfig)