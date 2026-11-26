import {
  selectUnitsForLine,
  type BoundConvention,
  type RentalWindow,
  type RejectedCandidate,
  type UnitCandidate,
  type UnitHold,
} from './availability'

/**
 * T3-19 (W8) — honour the exact unit an operator scanned.
 * RULING 2026-11-13 (S1): a scanned unit that is not free refuses the booking; it is never swapped.
 *
 * Pure (Law 1): the caller reads candidates and holds; this decides. A preferred
 * unit that is not free is **refused with a sentence, never swapped** for another
 * unit — the operator scanned that serial, and a quiet swap would put different
 * gear on the booking than the one in their hand.
 */
export interface AssignPreferredUnitsInput {
  readonly preferredIds: readonly string[]
  readonly candidates: readonly UnitCandidate[]
  readonly window: RentalWindow
  readonly holds: readonly UnitHold[]
  readonly disqualifyingStates: ReadonlySet<string>
  readonly bounds: BoundConvention
  /** Product name for the sentence. */
  readonly label: string
}

export interface PreferredUnitsOutcome {
  readonly assigned: readonly string[]
  readonly refusals: readonly string[]
}

function reasonSentence(label: string, rejected: RejectedCandidate): string {
  const tag = rejected.assetTag
  const reason = rejected.reason
  switch (reason.kind) {
    case 'held':
      return `${label}: unit ${tag} is held by ${reason.by.bookingNo} for these dates.`
    case 'retired':
      return `${label}: unit ${tag} is retired.`
    case 'state':
      return `${label}: unit ${tag} is ${reason.state}.`
    case 'condition':
      return `${label}: unit ${tag} condition is ${reason.condition}.`
    default:
      return `${label}: unit ${tag} cannot be used for these dates.`
  }
}

export function assignPreferredUnits(input: AssignPreferredUnitsInput): PreferredUnitsOutcome {
  const assigned: string[] = []
  const refusals: string[] = []
  const seen = new Set<string>()

  for (const id of input.preferredIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const candidate = input.candidates.find((c) => c.unitId === id)
    if (!candidate) {
      refusals.push(`${input.label}: the scanned unit is not an active unit of this product, so it cannot be reserved.`)
      continue
    }
    const outcome = selectUnitsForLine({
      needed: 1,
      window: input.window,
      candidates: [candidate],
      holds: input.holds,
      disqualifyingStates: input.disqualifyingStates,
      bounds: input.bounds,
    })
    if (outcome.assigned.length === 1) {
      assigned.push(id)
      continue
    }
    const rejected = outcome.rejected[0]
    refusals.push(
      rejected ? reasonSentence(input.label, rejected) : `${input.label}: the scanned unit is not free for these dates.`,
    )
  }

  return { assigned, refusals }
}
