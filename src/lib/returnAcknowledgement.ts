/** B19: the acknowledgement covers exactly the flagged items shown at capture. */
export interface ReturnAcknowledgementInput {
  returningName: string
  evidenceFileId?: string | null
  refusalReason?: string | null
}

export function validateReturnAcknowledgement(input: ReturnAcknowledgementInput): string | null {
  if (!input.returningName.trim()) return 'Enter the returning person’s name.'
  const refusal = input.refusalReason?.trim() ?? ''
  if (input.evidenceFileId && refusal) return 'Choose a signature or a recorded refusal.'
  if (input.evidenceFileId) return null
  return [...refusal].length >= 10 ? null : 'Capture a signature or enter a refusal reason of at least 10 characters.'
}

export interface ReturnFlaggedItemSnapshot {
  booking_line_id: string
  description?: string
  condition: string | null
  state: string
  note: string | null
  reason: string | null
  units?: Array<{ unit_id: string; serial?: string | null; condition: string | null; state: string }>
  findings?: Array<{ unit_id: string; serial?: string | null; condition: string; description: string }>
}

/** Print each acknowledged serial, retaining the frozen finding description. */
export function formatReturnFlaggedItem(item: ReturnFlaggedItemSnapshot, fallbackName: string): string[] {
  const name = item.description || fallbackName
  const details = new Map<string, { serial: string; condition: string; description: string }>()
  for (const unit of item.units ?? []) details.set(unit.unit_id, {
    serial: unit.serial || unit.unit_id,
    condition: unit.state === 'Missing' ? 'Missing' : unit.condition || 'Flagged',
    description: item.note || item.reason || '',
  })
  for (const finding of item.findings ?? []) details.set(finding.unit_id, {
    serial: finding.serial || finding.unit_id, condition: finding.condition, description: finding.description,
  })
  if (details.size) return [...details.values()].map(detail => `${name} (${detail.serial}): ${detail.condition} — ${detail.description}`)
  return [`${name}: ${item.state === 'Not Returned' ? 'Missing' : item.condition || 'Flagged'} — ${item.note || item.reason || ''}`]
}
