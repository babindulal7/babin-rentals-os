/** Booking lines that do not represent company-owned equipment to receive. */
export const NON_PACKABLE_LINE_TYPES: ReadonlySet<string> = new Set([
  'Service',
  'Sub-rental',
  'Manual item',
  'service',
  'sub_rental',
  'sub-rental',
  'manual_item',
  'manual item',
])

/** Check if a line type is non-packable, with case-insensitive and snake/kebab-case normalization. */
export function isNonPackableLineType(lineType: string | null | undefined): boolean {
  if (!lineType) return false
  const normalized = lineType.trim().toLowerCase().replace(/[-_\s]+/g, ' ')
  return normalized === 'service' || normalized === 'sub rental' || normalized === 'manual item'
}

