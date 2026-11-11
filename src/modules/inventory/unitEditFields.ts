import type { FieldSpec } from '../../lib/edit/useEditMode'

/**
 * T2-17 — only serial identity and shelf coordinates may be edited here.
 * Status changes via floor verbs or Retire; condition changes at intake,
 * Return inspection or repair. Replacement value remains intake-only.
 *
 * Do not add a mutable field without an authenticated, audited update action
 * and matching database policy. This file expresses UI authority only.
 */
export const UNIT_FIELDS: FieldSpec[] = [
  {
    key: 'assetTag',
    validate: (value) => String(value ?? '').trim()
      ? null
      : 'An asset tag is required for scanning and must not be empty.',
  },
  { key: 'serialNo' },
  { key: 'rack', group: 'location' },
  { key: 'shelf', group: 'location' },
  { key: 'bin', group: 'location' },
  {
    key: 'state',
    immutable: 'Status changes only through Pack, Handover, Return, Reset or Retire.',
  },
  {
    key: 'condition',
    immutable: 'Condition changes through intake, Return inspection or repair.',
  },
  {
    key: 'replacementValue',
    immutable: 'Replacement value is recorded at intake and corrected there, not on the shelf.',
  },
]
