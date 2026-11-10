import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { newClientUuid } from '../../lib/supabase'
import { safeUpdate } from '../../lib/dataAccess'
import { logAuditEvent } from '../../lib/audit'
import { validateProjectType } from '../../lib/projectTypes'
import { parseBookingNoSearch } from '../../lib/format'

export type UpdateBookingProjectInput = {
  /** Booking uuid or `B-` number. */
  id: string
  /** **Law 8.** Minted where the operator pressed Save; reused on retry. */
  clientUuid?: string
  /** Controlled value (`src/lib/projectTypes.ts`); null clears back to unset. */
  projectType: string | null
  /** Custom text; only with 'Other'. */
  projectTypeOther?: string | null
  /** Project / production name (T3-26, up to 120 chars). */
  projectName?: string | null
  /** Shoot location (T3-26, up to 120 chars). */
  shootLocation?: string | null
}

export type UpdateBookingProjectResult = {
  success: true
  bookingId: string
  bookingNo: string
  projectName?: string | null
  shootLocation?: string | null
  projectType: string | null
  projectTypeOther: string | null
  /** True when nothing differed and no write or audit row was produced. */
  unchanged: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * # UPDATE_BOOKING_PROJECT — the narrow project-type edit
 *
 * The ONLY header-field writer besides `create_booking` (R-43) and the stage
 * engine. BookingDetail's general Edit stays Unavailable-with-reason: this
 * action writes exactly two non-money, non-custodial columns
 * (`project_type`, `project_type_other`) through `safeUpdate`, which every
 * role in `bookings_update` may call at the row — the UI offers the control
 * to Coordinator+ only (floor roles view the type; spec §24), and UI ⊆ DB
 * holds because the UI grants less than the database.
 *
 * Capability `rental.update_project` mirrors `bookings_update` (0018, restated
 * 0018): Owner · Admin · Manager · Coordinator · Warehouse — the desk five via
 * `rbac.canWriteBookingDesk`, same as `rental.extend`. The 0102 money-blind
 * trigger guards numeric money columns only; text project fields pass it.
 *
 * Offline: queueable (non-custodial metadata, like a draft save — R-40's
 * fail-closed rule covers custody transitions, not this). Rollback: the
 * caller renders from the returned row; a throw means nothing changed, so the
 * screen keeps the old value with the inline error (§42).
 */
export const updateBookingProjectConfig: ActionConfig<UpdateBookingProjectInput, UpdateBookingProjectResult> = {
  name: 'UPDATE_BOOKING_PROJECT',
  permissions: ['rental.update_project'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim() === '') {
      throw new Error('A booking reference is required — pass the booking uuid or its B- number. Nothing was sent.')
    }
    if (input.clientUuid !== undefined && input.clientUuid.trim() === '') {
      throw new Error(
        'The idempotency key is present but empty. Pass the key minted where the operator pressed Save, ' +
          'or omit it — an empty string is neither. Nothing was sent.',
      )
    }
    if (input.projectName !== undefined && input.projectName !== null && input.projectName.trim().length > 120) {
      throw new Error('Project name must be 120 characters or fewer. Nothing was sent.')
    }
    if (input.shootLocation !== undefined && input.shootLocation !== null && input.shootLocation.trim().length > 120) {
      throw new Error('Shoot location must be 120 characters or fewer. Nothing was sent.')
    }
    const check = validateProjectType(input.projectType, input.projectTypeOther)
    if (!check.valid) {
      throw new Error(`${check.message ?? 'Select a project type from the list.'} Nothing was sent.`)
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const isUuid = UUID_RE.test(input.id)
    const column = isUuid ? 'id' : 'booking_no'
    const target = isUuid ? input.id : parseBookingNoSearch(input.id)
    const { data, error } = await supabase
      .from('bookings')
      .select('id, booking_no, branch_id, project, project_name, shoot_location, project_type, project_type_other')
      .eq(column, target)
      .maybeSingle()
    if (error) throw new Error(`Could not read the booking, so its project was not changed: ${error.message}`)
    if (!data) throw new Error(`No booking matches ${input.id}. Nothing was changed.`)

    const current = data as unknown as {
      id: string
      booking_no: string
      branch_id: string
      project: string | null
      project_name: string | null
      shoot_location: string | null
      project_type: string | null
      project_type_other: string | null
    }
    const nextType = input.projectType?.trim() ? input.projectType.trim() : null
    const nextOther = nextType === 'Other' && input.projectTypeOther?.trim() ? input.projectTypeOther.trim() : null
    const nextProjectName = input.projectName !== undefined
      ? (input.projectName?.trim() ? input.projectName.trim() : null)
      : undefined
    const nextShootLocation = input.shootLocation !== undefined
      ? (input.shootLocation?.trim() ? input.shootLocation.trim() : null)
      : undefined

    const isSameType = current.project_type === nextType && (current.project_type_other ?? null) === nextOther
    const isSameName = nextProjectName === undefined || (current.project_name ?? current.project ?? null) === nextProjectName
    const isSameLocation = nextShootLocation === undefined || (current.shoot_location ?? null) === nextShootLocation

    if (isSameType && isSameName && isSameLocation) {
      return {
        result: {
          success: true as const,
          bookingId: current.id,
          bookingNo: current.booking_no,
          projectName: current.project_name ?? current.project ?? null,
          shootLocation: current.shoot_location ?? null,
          projectType: current.project_type,
          projectTypeOther: current.project_type_other,
          unchanged: true,
        },
        /* Nothing changed, so nothing is announced — the createRental replay
           rule applied to edits. */
        events: [],
      }
    }

    const key = input.clientUuid ?? newClientUuid()
    /* `safeUpdate` throws on failure (Law 12's inline error comes from that
       throw) — there is no error return to branch on. */
    const updatePatch: Record<string, unknown> = {
      project_type: nextType,
      project_type_other: nextOther,
    }
    if (nextProjectName !== undefined) {
      updatePatch.project_name = nextProjectName
      updatePatch.project = nextProjectName
    }
    if (nextShootLocation !== undefined) {
      updatePatch.shoot_location = nextShootLocation
    }

    const updated = await safeUpdate(
      'bookings',
      current.id,
      updatePatch,
      key,
    )

    /* Audit (spec §43) — old and new, who and when. This is a metadata edit;
       'status change' is the closest enum member; engine defaults to it anyway. */
    const auditOldValues: Record<string, unknown> = {
      project_type: current.project_type,
      project_type_other: current.project_type_other,
    }
    const auditNewValues: Record<string, unknown> = {
      project_type: nextType,
      project_type_other: nextOther,
    }
    if (nextProjectName !== undefined) {
      auditOldValues.project_name = current.project_name ?? current.project
      auditNewValues.project_name = nextProjectName
    }
    if (nextShootLocation !== undefined) {
      auditOldValues.shoot_location = current.shoot_location
      auditNewValues.shoot_location = nextShootLocation
    }

    const audit = await logAuditEvent({
      eventClass: 'status change',
      category: 'Rentals',
      module: 'Rentals',
      action: 'Update',
      severity: 'Informational',
      tableName: 'bookings',
      recordId: current.id,
      actorId: ctx.userId,
      actorRole: ctx.role,
      branchId: current.branch_id,
      oldValues: auditOldValues as Record<string, string | null>,
      newValues: auditNewValues as Record<string, string | null>,
      reason: `Project details updated: ${nextProjectName ?? current.project_name ?? '—'} (${nextType ?? '—'})`,
    })
    if (!audit.ok) {
      console.error(`[updateBookingProject] ${current.booking_no} saved with NO audit row.`, audit.error)
    }

    const row = (updated.data ?? {}) as {
      project_name?: string | null
      shoot_location?: string | null
      project_type?: string | null
      project_type_other?: string | null
    }
    const result: UpdateBookingProjectResult = {
      success: true as const,
      bookingId: current.id,
      bookingNo: current.booking_no,
      projectName: row.project_name ?? (nextProjectName !== undefined ? nextProjectName : (current.project_name ?? current.project ?? null)),
      shootLocation: row.shoot_location ?? (nextShootLocation !== undefined ? nextShootLocation : (current.shoot_location ?? null)),
      projectType: row.project_type ?? nextType,
      projectTypeOther: row.project_type_other ?? nextOther,
      unchanged: false,
    }
    return {
      result,
      events: [
        {
          type: EVENT_TYPES.RENTAL_PROJECT_UPDATED,
          payload: {
            bookingId: current.id,
            bookingNo: current.booking_no,
            branchId: current.branch_id,
            from: { project_type: current.project_type, project_type_other: current.project_type_other },
            to: { project_type: result.projectType, project_type_other: result.projectTypeOther },
            clientUuid: key,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const updateBookingProject = createAction(updateBookingProjectConfig)
