import { useCallback, useRef, useState } from 'react'
import type { ActionContext } from '../../../actions/core'
import { createRental, deliveryTypeFromLabel, type BookingLineType } from '../../../actions/rentals/createRental'
import { convertDraft, saveDraft as persistRentalDraft, type RentalDraftData } from '../../../actions/rentals/saveDraft'
import { transportInstructions } from '../../../lib/bookingTransportForm'
import { bookingDiscountRows } from '../../../lib/bookingDiscountRows'
import type { ClientActiveMembership } from '../../../lib/queries/membership'
import { toRupees, type Paisa } from '../../../lib/money'
import type { PricingPipelineResult } from '../../../lib/pricingPipeline'
import { planCreationUnits, type CreationUnitPlan } from '../../../lib/queries/availability'
import type { ClientRecord } from '../../../lib/queries/clients'
import { fetchProductPricingTerms, type ProductPricingTerms } from '../../../lib/queries/productPricingTerms'
import { canViewMoney } from '../../../lib/rbac'
import { quoteUnitPrice } from '../../../lib/pricingStructures'
import { kathmanduCivil, NPT_OFFSET_MIN } from '../../../lib/bs'
import { newClientUuid, supabase } from '../../../lib/supabase'
import type { CrewRoleDb } from '../../../types/database'
import type { CrewLine } from './CrewSection'
import { stableJson } from './newRentalUtils'
import type { Line } from './RentalLineItemsTree'

export interface UseNewRentalSubmitOptions {
  editBookingId?: string | undefined
  confirmBlocked: boolean
  saveState: 'saved' | 'saving' | 'error'
  setSaveState: (state: 'saved' | 'saving' | 'error') => void
  dispatchContext: () => ActionContext | null
  setActionError: (msg: string | null) => void
  setConfirmedSuccess: (success: { bookingId: string; bookingNo: string } | null) => void
  showSuccessToast?: (title: string, message?: string) => void

  client: ClientRecord | null | undefined
  clientMembership?: ClientActiveMembership | null | undefined
  lines: Line[]
  equipmentLines: Line[]
  project: string
  pickupAt: Date | null
  returnAt: Date | null
  deliveryType: 'Client Pickup' | 'Babin Delivery'
  pricing: PricingPipelineResult
  manualDiscountReason: string
  manualDiscountAuthorizedBy: string
  womenDopEligible: boolean
  crew: CrewLine[]
  clientPickup: boolean
  deliveryChargePaisa: Paisa
  fuelChargePaisa: Paisa
  returnPickupType: 'Client Return' | 'Babin Pickup'
  returnPickupAddress: string
  returnPickupTime: string
  returnPickupChargePaisa: number
  returnTransportPaisa: number
  vehicle: string
  numberPlate: string
  driverContact: string
  pickupLocation: string
  returnLocation: string
  specialInstructions: string
  days: number
  draftId: string | null
  draftBookingNo: string | null
  draftHasUnsavedChanges: boolean
  draftData: RentalDraftData
  setSavedDraftFingerprint: (fp: string | null) => void
  kind: string
  kindOther: string

  confirmKey: React.MutableRefObject<string | null>
  draftBookingKey: React.MutableRefObject<string | null>
}

const PRODUCT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 0168 (G3) — quote totals for one booking line.
 *
 * A structure/fixed quote does not divide into a per-day rate without a paisa
 * discrepancy, so the quoted total plus its snapshot ride the line and the
 * invoice reproduces the quote. Returns `{}` (flat-rate path) when the product
 * carries no terms or the quote fails — quoting must never block booking.
 */
function quoteFieldsForLine(
  line: Line,
  terms: ReadonlyMap<string, ProductPricingTerms>,
  pickupDay: string,
  pickupTime: string,
  returnTime: string,
): { lineTotal?: number; priceBreakdown?: Record<string, unknown> } {
  const productId = line.productId && PRODUCT_UUID_RE.test(line.productId) ? line.productId : null
  const lineTerms = productId ? terms.get(productId) : undefined
  if (!lineTerms || (!lineTerms.structure && lineTerms.rules.length === 0)) return {}
  try {
    const base = lineTerms.structure
      ? { method: 'structure' as const, structure: lineTerms.structure }
      : { method: 'flat' as const, perDayPaisa: line.ratePaisa }
    const quote = quoteUnitPrice({ base, rules: lineTerms.rules, pickupDay, days: line.days, pickupTime, returnTime })
    return {
      lineTotal: toRupees((quote.unitTotalPaisa * line.qty) as Paisa),
      priceBreakdown: {
        source: 'pricing-quote-v1',
        productId,
        method: base.method,
        pickupDay,
        days: line.days,
        qty: line.qty,
        chargedDays: quote.chargedDays,
        unitTotalPaisa: quote.unitTotalPaisa,
        adjustments: quote.adjustments.map((a) => ({ rule: a.rule, deltaPaisa: a.deltaPaisa })),
        notes: quote.notes,
      },
    }
  } catch {
    return {}
  }
}

export function useNewRentalSubmit({
  editBookingId,
  confirmBlocked,
  saveState,
  setSaveState,
  dispatchContext,
  setActionError,
  setConfirmedSuccess,
  showSuccessToast,
  client,
  clientMembership,
  lines,
  equipmentLines,
  project,
  pickupAt,
  returnAt,
  deliveryType,
  pricing,
  manualDiscountReason,
  manualDiscountAuthorizedBy,
  crew,
  clientPickup,
  deliveryChargePaisa,
  fuelChargePaisa,
  returnPickupType,
  returnPickupAddress,
  returnPickupTime,
  returnPickupChargePaisa,
  returnTransportPaisa,
  vehicle,
  numberPlate,
  driverContact,
  pickupLocation,
  returnLocation,
  specialInstructions,
  days,
  draftId,
  draftBookingNo,
  draftHasUnsavedChanges,
  draftData,
  setSavedDraftFingerprint,
  kind,
  kindOther,
  confirmKey,
  draftBookingKey,
}: UseNewRentalSubmitOptions) {
  const createdQuote = useRef<{ id: string; no: string; stage?: string } | null>(null)
  const discountKeys = useRef<string[]>([])
  const crewKeys = useRef<string[]>([])
  const transportKey = useRef<string | null>(null)
  const confirming = useRef(false)
  const quoteSaving = useRef(false)
  const quoteCreated = useRef<{ id: string; no: string; stage?: string } | null>(null)
  const [quoteSaved, setQuoteSaved] = useState<{ bookingId: string; bookingNo: string } | null>(null)

  /**
   * The create step both savers share (W5): build and persist the booking as a
   * Quote via the atomic `create_booking` RPC — branch read, unit plan,
   * structure-quote terms and the full line/crew/transport payload. Extracted
   * from confirmBooking when "Save as quote" needed the same write without the
   * confirm step; one payload builder means the two buttons can never disagree
   * about what a saved booking contains.
   */
  const createQuoteFromForm = useCallback(
    async (ctx: NonNullable<ReturnType<typeof dispatchContext>>, pressKey: string) => {
      const clientDbId = client?.dbId
      if (!clientDbId || !pickupAt || !returnAt) {
        throw new Error('this booking has no client record or no usable dates')
      }

      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('branch_id')
        .eq('id', ctx.userId)
        .maybeSingle()
      if (userErr) throw new Error(`the operating branch could not be read (${userErr.message})`)
      const branchId = (userRow as { branch_id?: string | null } | null)?.branch_id
      if (!branchId) {
        throw new Error(
          'your staff record carries no branch, and a booking is filed per branch. Ask an Owner to set your branch first',
        )
      }

      let creationUnitPlan: CreationUnitPlan | null = null
      try {
        creationUnitPlan = await planCreationUnits(
          { fromAd: pickupAt.toISOString(), toAd: returnAt.toISOString() },
          equipmentLines.map((l, i) => ({
            key: l.id ?? `line-${i}`,
            productId: l.productId ?? l.id ?? null,
            qty: l.qty,
            label: l.name ?? `Line ${i + 1}`,
          })),
        )
      } catch {
        creationUnitPlan = null
      }

      /* 0168 (G3) — structure/fixed quote totals ride the lines so the
         invoice reproduces the quote. Terms are a database read (RLS
         returns nothing money-blind, and the gate below keeps them off
         the payload for those roles); any failure falls back to the
         flat-rate path rather than blocking the press. */
      let pricingTerms: ReadonlyMap<string, ProductPricingTerms> = new Map()
      if (canViewMoney(ctx.role)) {
        const termIds = [
          ...new Set(
            lines.map((l) => l.productId).filter((id): id is string => !!id && PRODUCT_UUID_RE.test(id)),
          ),
        ]
        if (termIds.length > 0) {
          try {
            pricingTerms = await fetchProductPricingTerms(termIds)
          } catch {
            pricingTerms = new Map()
          }
        }
      }
      const pickupDay = new Date(kathmanduCivil(pickupAt)).toISOString().slice(0, 10)
      const nptClock = (d: Date): string =>
        new Date(d.getTime() + NPT_OFFSET_MIN * 60_000).toISOString().slice(11, 16)
      const pickupTime = nptClock(pickupAt)
      const returnTime = nptClock(returnAt)

      const hasPriorityBooking =
        clientMembership?.perks?.some((p) => p.toLowerCase().includes('priority booking')) ?? false
      const cleanedProject = project.trim().replace(/^'|'$/g, '')
      const finalProject = hasPriorityBooking
        ? cleanedProject
          ? cleanedProject.startsWith('[Priority]')
            ? cleanedProject
            : `[Priority] ${cleanedProject}`
          : '[Priority Booking]'
        : cleanedProject || null

      const created = await createRental(
        {
          clientUuid: pressKey,
          clientId: clientDbId,
          branchId,
          project: finalProject,
          projectType: kind.trim() !== '' ? kind : null,
          projectTypeOther: kind === 'Other' && kindOther.trim() !== '' ? kindOther.trim() : null,
          ...(draftBookingNo ? { bookingNo: draftBookingNo } : {}),
          pickupAt: pickupAt.toISOString(),
          returnAt: returnAt.toISOString(),
          deliveryType: deliveryTypeFromLabel(deliveryType),
          depositRequired: toRupees(pricing.securityDeposit.requiredPaisa),
          vatRate: pricing.vatRatePercent / 100,
          ...(pricing.discounts.discountPaisa > 0
            ? {
                discounts: bookingDiscountRows(
                  pricing.discounts,
                  manualDiscountReason,
                  manualDiscountAuthorizedBy,
                ).map((discount, index) => ({
                  ...discount,
                  clientUuid: discountKeys.current[index] ??
                    (discountKeys.current[index] = newClientUuid()),
                })),
              }
            : {}),
          ...(crew.length > 0
            ? {
                crew: crew.map((c, i) => ({
                  clientUuid: crewKeys.current[i] ?? (crewKeys.current[i] = newClientUuid()),
                  name: c.name,
                  role: c.role as CrewRoleDb,
                  phone: c.phone,
                  dayRate: toRupees(c.dayRatePaisa),
                  days: days || 1,
                  overtime: toRupees(((c.dayRatePaisa * (c.overtimeDays ?? 0)) as Paisa)),
                  accommodation: toRupees(c.accommodationPaisa),
                  meals: toRupees(c.mealsPaisa),
                })),
              }
            : {}),
          ...(clientPickup && returnPickupType === 'Client Return'
            ? {}
            : {
                pickupLocation: pickupLocation.trim() || null,
                returnLocation: returnLocation.trim() || (returnPickupAddress.trim() || null),
                transport: {
                  clientUuid: transportKey.current ?? (transportKey.current = newClientUuid()),
                  deliveryCharge: toRupees(((clientPickup ? 0 : deliveryChargePaisa) + returnTransportPaisa) as Paisa),
                  fuelCharge: toRupees((clientPickup ? 0 : fuelChargePaisa) as Paisa),
                  vehicle: vehicle.trim() === '' ? null : vehicle.trim(),
                  numberPlate: numberPlate.trim() === '' ? null : numberPlate.trim(),
                  driverContact: driverContact.trim() === '' ? null : driverContact.trim(),
                  specialInstructions: transportInstructions({
                    specialInstructions,
                    returnPickupType,
                    returnPickupAddress,
                    returnPickupTime,
                    returnPickupChargePaisa,
                  }),
                },
              }),
          lines: lines.map((l, i) => {
            const isBundle = l.lineType === 'Bundle'
            const isIncluded = l.isIncluded ?? false
            const inventoryLine = !isBundle && (l.lineType === undefined || l.lineType === 'Equipment')
            const lineKey = l.id ?? `line-${i}`
            const assigned = inventoryLine && !isIncluded ? creationUnitPlan?.unitsByKey.get(lineKey) : undefined
            return {
              clientUuid: l.clientUuid ?? newClientUuid(),
              parentClientUuid: l.parentClientUuid ?? null,
              lineType: (l.lineType ?? 'Equipment') as BookingLineType,
              isIncluded,
              ...(isBundle
                ? { bundleId: l.bundleId ?? null, description: l.name }
                : inventoryLine
                  ? {
                      productId:
                        l.productId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(l.productId)
                          ? l.productId
                          : l.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(l.id)
                            ? l.id
                            : null,
                      description: l.name,
                    }
                  : { description: l.name }),
              qty: l.qty,
              days: l.days,
              rate: toRupees(l.ratePaisa),
              ...quoteFieldsForLine(l, pricingTerms, pickupDay, pickupTime, returnTime),
              sortOrder: i,
              ...(assigned && assigned.length > 0 ? { units: assigned } : {}),
            }
          }),
        },
        ctx,
      )
      return { id: created.bookingId, no: created.bookingNo, stage: created.stage }
    },
    [
      client,
      clientMembership,
      pickupAt,
      returnAt,
      lines,
      equipmentLines,
      project,
      kind,
      kindOther,
      draftBookingNo,
      deliveryType,
      pricing,
      manualDiscountReason,
      manualDiscountAuthorizedBy,
      crew,
      days,
      clientPickup,
      deliveryChargePaisa,
      fuelChargePaisa,
      returnPickupType,
      returnPickupAddress,
      returnPickupTime,
      returnPickupChargePaisa,
      returnTransportPaisa,
      vehicle,
      numberPlate,
      driverContact,
      pickupLocation,
      returnLocation,
      specialInstructions,
    ],
  )

  const confirmBooking = useCallback(() => {
    if (editBookingId || confirmBlocked || saveState === 'saving' || confirming.current) return
    const ctx = dispatchContext()
    if (!ctx) {
      setActionError('Not confirmed — you are not signed in, so this booking cannot be attributed to anyone. Sign in and confirm again.')
      return
    }

    const clientDbId = client?.dbId
    if (!clientDbId || !pickupAt || !returnAt) {
      setActionError('Not confirmed — this booking has no client record or no usable dates. Nothing was written.')
      return
    }

    confirming.current = true
    setActionError(null)
    setSaveState('saving')
    if (!confirmKey.current) confirmKey.current = draftBookingKey.current ?? newClientUuid()
    const pressKey: string = confirmKey.current
    let step: 'save-draft' | 'create' | 'confirm' | 'convert' = 'create'

    void (async () => {
      try {
        if (draftId && draftHasUnsavedChanges) {
          step = 'save-draft'
          const saved = await persistRentalDraft({ id: draftId, data: draftData }, ctx)
          if (!('data' in saved)) throw new Error('the database did not return the updated rental draft')
          setSavedDraftFingerprint(stableJson(saved.data))
        }
        step = 'create'
        if (!createdQuote.current) {
          createdQuote.current = await createQuoteFromForm(ctx, pressKey)
        }

        if (createdQuote.current.stage !== 'Booked') {
          step = 'confirm'
          const mod = await import('../../../actions/rentals/confirmRental')
          await mod.confirmRental({ id: createdQuote.current.id }, ctx)
          createdQuote.current.stage = 'Booked'
        }

        if (draftId) {
          step = 'convert'
          await convertDraft({ id: draftId, bookingId: createdQuote.current.id }, ctx)
        }

        const bookedId = createdQuote.current.id
        const bookedNo = createdQuote.current.no

        confirmKey.current = null
        createdQuote.current = null
        discountKeys.current = []
        crewKeys.current = []
        transportKey.current = null
        setSaveState('saved')
        const label = bookedNo.startsWith('BK-') || bookedNo.startsWith('Rental ') ? bookedNo : `Rental ${bookedNo}`
        showSuccessToast?.('Booking Confirmed', `${label} is now Booked`)
        setConfirmedSuccess({ bookingId: bookedId, bookingNo: bookedNo })
      } catch (err) {
        setSaveState('error')
        const reason = err instanceof Error ? err.message : String(err)
        if (step === 'convert' && createdQuote.current) {
          setActionError(
            `Booking ${createdQuote.current.no} is confirmed, but the draft link did not update: ${reason}. ` +
              'Press Confirm Booking again to finish linking this same draft; no second booking will be created.',
          )
        } else if (step === 'confirm' && createdQuote.current) {
          setActionError(
            `Booking saved as a Quote (${createdQuote.current.no}); Confirm did not land: ${reason}. Press Confirm Booking again to confirm that same Quote — no second booking will be created.`,
          )
        } else {
          setActionError(
            `Not confirmed — ${reason}. Your entries have been kept. Retry uses the same booking reference.`,
          )
        }
      } finally {
        confirming.current = false
      }
    })()
  }, [
    confirmBlocked,
    saveState,
    dispatchContext,
    client,
    pickupAt,
    returnAt,
    draftId,
    draftHasUnsavedChanges,
    draftData,
    editBookingId,
    confirmKey,
    draftBookingKey,
    setActionError,
    setSaveState,
    setSavedDraftFingerprint,
    setConfirmedSuccess,
    showSuccessToast,
    createQuoteFromForm,
  ])

  /**
   * W5 (RULINGS-2026-10-26-workflow.md): "about half of bookings start as
   * quotes", so **Save as quote is one tap beside Confirm** — the same
   * payload, the same atomic `create_booking` RPC, and then it STOPS at the
   * Quote stage. No units are reserved (that is confirm's job), no draft is
   * converted, and the idempotency key makes a retry after a lost response
   * land on the same quote rather than a second one.
   *
   * Gated by the same `confirmBlocked` notices as Confirm: the blockers are
   * about the booking being incomplete (no client, no usable window, a
   * negative price), and an incomplete booking is no more quotable than it is
   * confirmable. Nothing gate-shaped is invented here.
   */
  const saveAsQuote = useCallback(() => {
    if (editBookingId || confirmBlocked || saveState === 'saving' || quoteSaving.current) return
    const ctx = dispatchContext()
    if (!ctx) {
      setActionError('Not saved — you are not signed in, so this quote cannot be attributed to anyone. Sign in and save again.')
      return
    }

    confirming.current = true
    quoteSaving.current = true
    setActionError(null)
    setSaveState('saving')
    if (!confirmKey.current) confirmKey.current = draftBookingKey.current ?? newClientUuid()
    const pressKey: string = confirmKey.current

    void (async () => {
      try {
        if (draftId && draftHasUnsavedChanges) {
          const saved = await persistRentalDraft({ id: draftId, data: draftData }, ctx)
          if (!('data' in saved)) throw new Error('the database did not return the updated rental draft')
          setSavedDraftFingerprint(stableJson(saved.data))
        }
        if (!quoteCreated.current) {
          quoteCreated.current = await createQuoteFromForm(ctx, pressKey)
        }
        const quote = quoteCreated.current

        confirmKey.current = null
        discountKeys.current = []
        crewKeys.current = []
        transportKey.current = null
        setSaveState('saved')
        const label = quote.no.startsWith('BK-') || quote.no.startsWith('Rental ') ? quote.no : `Rental ${quote.no}`
        showSuccessToast?.('Quote saved', `${label} is saved as a Quote`)
        setQuoteSaved({ bookingId: quote.id, bookingNo: quote.no })
      } catch (err) {
        setSaveState('error')
        const reason = err instanceof Error ? err.message : String(err)
        setActionError(
          `Quote not saved — ${reason}. Your entries have been kept. Retry uses the same booking reference.`,
        )
      } finally {
        confirming.current = false
        quoteSaving.current = false
      }
    })()
  }, [
    confirmBlocked,
    saveState,
    dispatchContext,
    draftId,
    draftHasUnsavedChanges,
    draftData,
    editBookingId,
    confirmKey,
    draftBookingKey,
    setActionError,
    setSaveState,
    setSavedDraftFingerprint,
    showSuccessToast,
    createQuoteFromForm,
  ])

  return {
    confirmBooking,
    saveAsQuote,
    quoteSaved,
    setQuoteSaved,
  }
}
