import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadEvidencePhoto, getEvidenceSignedUrl, EVIDENCE_STORAGE_BUCKET } from '../evidenceStorage'

const state = vi.hoisted(() => ({
  rows: {
    evidence_files: [] as Array<Record<string, unknown>>,
    evidence_references: [] as Array<Record<string, unknown>>,
    operation_sessions: [] as Array<Record<string, unknown>>,
    bookings: [] as Array<Record<string, unknown>>,
  },
  fail: '' as string,
  uploads: [] as string[],
  signs: 0,
}))

vi.mock('../dataAccess', () => ({
  generateClientUuid: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}))

vi.mock('../supabase', () => {
  function table(tableName: keyof typeof state.rows) {
    const filters: Record<string, unknown> = {}
    let staged: Record<string, unknown> | undefined
    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: (key: string, val: unknown) => { filters[key] = val; return q },
      insert: (payload: Record<string, unknown>) => { staged = payload; return q },
      async maybeSingle() {
        if (state.fail === `${tableName}:read`) return { data: null, error: { message: 'read denied' } }
        const row = state.rows[tableName].find((item) => Object.entries(filters).every(([k, v]) => item[k] === v))
        return { data: row ?? null, error: null }
      },
      async single() {
        if (state.fail === `${tableName}:insert` && staged) return { data: null, error: { message: 'insert denied' } }
        if (state.fail === `${tableName}:read` && !staged) return { data: null, error: { message: 'read denied' } }
        if (staged) {
          const row = { ...staged }
          state.rows[tableName].push(row)
          return { data: row, error: null }
        }
        const row = state.rows[tableName].find((item) => Object.entries(filters).every(([k, v]) => item[k] === v))
        return { data: row ?? null, error: row ? null : { message: 'not found' } }
      },
    }
    return q
  }
  return {
    IS_MOCK: false,
    supabase: {
      from: table,
      storage: {
        from: () => ({
          upload: async (path: string) => {
            state.uploads.push(path)
            return state.fail === 'storage:upload'
              ? { data: null, error: { message: 'storage denied' } }
              : { data: { path }, error: null }
          },
          createSignedUrl: async () => {
            state.signs += 1
            return state.fail === 'storage:sign'
              ? { data: null, error: { message: 'signed URL denied' } }
              : { data: { signedUrl: 'https://example.test/short-lived-signature' }, error: null }
          },
        }),
      },
    },
  }
})

const USER = '00000000-0000-4000-8000-000000000001'
const BOOKING = '00000000-0000-4000-8000-000000000002'
const SESSION = '00000000-0000-4000-8000-000000000003'
const RETRY = '00000000-0000-4000-8000-000000000004'

function evidenceInput(content = 'image-A') {
  return {
    file: new Blob([content], { type: 'image/png' }),
    filename: 'receiver-signature.png',
    category: 'Pickup / Delivery' as const,
    reference: { bookingId: BOOKING, sessionId: SESSION, operationStage: 'Delivery' as const },
    userId: USER,
    clientUuid: RETRY,
  }
}

beforeEach(() => {
  state.rows.evidence_files.length = 0
  state.rows.evidence_references.length = 0
  state.rows.operation_sessions = [{ id: SESSION, booking_id: BOOKING, operation: 'Handover', state: 'In Progress' }]
  state.rows.bookings = [{ id: BOOKING, delivery_type: 'Client Pickup' }]
  state.fail = ''
  state.uploads.length = 0
  state.signs = 0
})

describe('P2B: fail-closed proof-of-delivery evidence persistence', () => {
  it('uses the configured private evidence bucket', () => {
    expect(EVIDENCE_STORAGE_BUCKET).toBe('evidence')
  })

  it('only returns stored evidence when both rows were confirmed', async () => {
    const result = await uploadEvidencePhoto(evidenceInput())
    expect(result.id).toBe(RETRY)
    expect(result.referenceId).toBeDefined()
    expect(result.contentHash).toHaveLength(64)
    expect(result.storagePath).toContain(`${BOOKING}/${SESSION}/${RETRY}`)
    expect(state.rows.evidence_files[0]).toMatchObject({
      content_hash: result.contentHash, media_type: 'Image', format: 'png',
      size_bytes: evidenceInput().file.size,
    })
    expect(state.rows.evidence_references[0]).toMatchObject({
      evidence_file_id: result.id, operation_stage: 'Delivery',
      session_id: SESSION, booking_id: BOOKING,
    })
  })

  it('never reports stored evidence if private Storage upload fails', async () => {
    state.fail = 'storage:upload'
    await expect(uploadEvidencePhoto(evidenceInput())).rejects.toThrow(/not confirmed in private storage/)
    expect(state.rows.evidence_files).toHaveLength(0)
    expect(state.rows.evidence_references).toHaveLength(0)
  })

  it('never reports success after metadata insertion is rejected', async () => {
    state.fail = 'evidence_files:insert'
    await expect(uploadEvidencePhoto(evidenceInput())).rejects.toThrow(/metadata was not confirmed/)
    expect(state.rows.evidence_references).toHaveLength(0)
  })

  it('never reports success if the session reference cannot be inserted', async () => {
    state.fail = 'evidence_references:insert'
    await expect(uploadEvidencePhoto(evidenceInput())).rejects.toThrow(/link was not confirmed/)
    expect(state.rows.evidence_files).toHaveLength(1)
    expect(state.rows.evidence_references).toHaveLength(0)
  })

  it('retries using the same client UUID without a second upload or second link', async () => {
    const first = await uploadEvidencePhoto(evidenceInput())
    const second = await uploadEvidencePhoto(evidenceInput())
    expect(second.id).toBe(first.id)
    expect(second.referenceId).toBe(first.referenceId)
    expect(state.uploads).toHaveLength(1)
    expect(state.rows.evidence_references).toHaveLength(1)
  })

  it('keeps a pre-Return unit Damage photo session-free and idempotent on retry', async () => {
    // A damaged unit needs evidence BEFORE the Return floor verb is allowed to
    // complete. The photo must not consume an operation_sessions Return key.
    state.rows.operation_sessions = []
    const unitId = '00000000-0000-4000-8000-000000000005'
    const input = {
      ...evidenceInput(),
      category: 'Damage' as const,
      reference: { bookingId: BOOKING, itemId: unitId, operationStage: 'Damage' as const },
    }

    const first = await uploadEvidencePhoto(input)
    const retry = await uploadEvidencePhoto(input)

    expect(retry.id).toBe(first.id)
    expect(retry.referenceId).toBe(first.referenceId)
    expect(state.rows.operation_sessions).toHaveLength(0)
    expect(state.rows.evidence_references).toHaveLength(1)
    expect(state.rows.evidence_references[0]).toMatchObject({
      booking_id: BOOKING,
      item_id: unitId,
      session_id: null,
      operation_stage: 'Damage',
    })
    expect(state.uploads).toHaveLength(1)
  })

  it('refuses to reuse a retry UUID with changed image bytes', async () => {
    await uploadEvidencePhoto(evidenceInput())
    await expect(uploadEvidencePhoto(evidenceInput('image-B'))).rejects.toThrow(/different image bytes/)
    expect(state.uploads).toHaveLength(1)
  })

  it('creates a Handover session with the stored delivery method after Pack', async () => {
    state.rows.operation_sessions = []
    const input = evidenceInput()
    const result = await uploadEvidencePhoto({
      ...input,
      reference: { bookingId: BOOKING, operationStage: 'Pickup' },
    })
    expect(result.referenceId).toBeDefined()
    expect(state.rows.operation_sessions).toHaveLength(1)
    expect(state.rows.operation_sessions[0]).toMatchObject({
      operation: 'Handover',
      booking_id: BOOKING,
      delivery_method: 'Client Pickup',
      state: 'In Progress',
    })
    expect(state.rows.evidence_references[0]).toMatchObject({
      operation_stage: 'Pickup',
      session_id: state.rows.operation_sessions[0]?.id,
    })
  })

  it('refuses a Handover session if the booking delivery method cannot be read', async () => {
    state.rows.operation_sessions = []
    state.fail = 'bookings:read'
    const input = evidenceInput()
    await expect(uploadEvidencePhoto({
      ...input,
      reference: { bookingId: BOOKING, operationStage: 'Pickup' },
    })).rejects.toThrow(/Could not verify the booking delivery method/)
    expect(state.rows.operation_sessions).toHaveLength(0)
    expect(state.uploads).toHaveLength(0)
  })

  it('does not open another session when the existing-session read fails', async () => {
    state.fail = 'operation_sessions:read'
    const input = evidenceInput()
    await expect(uploadEvidencePhoto({
      ...input,
      reference: { bookingId: BOOKING, operationStage: 'Pickup' },
    })).rejects.toThrow(/Could not verify open Handover session/)
    expect(state.uploads).toHaveLength(0)
  })

  it('attaches Inspection evidence to a Return session, not Handover', async () => {
    state.rows.operation_sessions[0]!.operation = 'Return'
    const input = evidenceInput()
    const result = await uploadEvidencePhoto({
      ...input,
      reference: { ...input.reference, operationStage: 'Inspection' },
    })
    expect(result.referenceId).toBeDefined()
    expect(state.rows.evidence_references[0]).toMatchObject({
      operation_stage: 'Inspection', session_id: SESSION, booking_id: BOOKING,
    })
  })

  it('rejects sessions from other bookings before writing anything', async () => {
    state.rows.operation_sessions[0]!.booking_id = '00000000-0000-4000-8000-999999999999'
    await expect(uploadEvidencePhoto(evidenceInput())).rejects.toThrow(/does not match/)
    expect(state.uploads).toHaveLength(0)
  })

  it('rejects new proof appended to a completed session', async () => {
    state.rows.operation_sessions[0]!.state = 'Completed'
    await expect(uploadEvidencePhoto(evidenceInput())).rejects.toThrow(/sealed/)
    expect(state.uploads).toHaveLength(0)
  })

  it('does not invent a signed URL when signing fails', async () => {
    state.fail = 'storage:sign'
    const result = await uploadEvidencePhoto(evidenceInput())
    expect(result.signedUrl).toBeNull()
    expect(state.rows.evidence_references).toHaveLength(1)
    await expect(getEvidenceSignedUrl(result.storagePath)).resolves.toBeNull()
  })

  it('rejects display booking numbers in place of database foreign keys', async () => {
    const input = evidenceInput()
    input.reference.bookingId = 'BK-2026-001'
    await expect(uploadEvidencePhoto(input)).rejects.toThrow(/database UUID/)
    expect(state.uploads).toHaveLength(0)
  })
})
