import { supabase } from './supabase'
import { generateClientUuid } from './dataAccess'
import type { Database } from '../types/supabase'

/** A private bucket installed by a reviewed database migration, never from the browser. */
export const EVIDENCE_STORAGE_BUCKET = 'evidence'

type EvidenceCategory = Database['public']['Enums']['evidence_category']
/** All persisted evidence stages, including stages without a session. */
export type SessionStage = Database['public']['Enums']['evidence_operation_stage']

/**
 * A session reference for operational evidence.
 * Optional for Reset/Damage stages; resolved or created automatically if not provided.
 */
export interface EvidenceSessionReference {
  bookingId: string
  sessionId?: string | undefined
  operationStage: SessionStage
  itemId?: string | undefined
}

export interface UploadEvidencePhotoOptions {
  file: Blob | File
  filename: string
  category: EvidenceCategory
  reference: EvidenceSessionReference
  /** An authenticated application users.id; database RLS remains authoritative. */
  userId: string
  /** Preserve on retries of the SAME action; never generate a fresh retry key. */
  clientUuid?: string | undefined
}

export interface StoredEvidencePhotoResult {
  id: string
  referenceId: string
  storagePath: string
  /** A temporary viewing link, not evidence of persistence. */
  signedUrl: string | null
  filename: string
  fileSizeBytes: number
  contentHash: string
}

const ACCEPTED_IMAGE_FORMATS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'jpg',
  'image/heif': 'jpg',
}

function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a database UUID, not a display identifier`)
  }
}

function assertStorageAvailable(): void {
  if (typeof window !== 'undefined' && typeof window.navigator !== 'undefined' && window.navigator.onLine === false) {
    throw new Error('You are offline. This photo was not saved — take it again when you are back online.')
  }
  if (!supabase?.storage || typeof supabase.storage.from !== 'function') {
    throw new Error('Evidence storage is unavailable')
  }
}

async function sha256(blob: Blob): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Secure browser hashing is unavailable; evidence was not uploaded')
  }
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('')
}

async function resolveOrCreateSession(
  bookingId: string,
  operation: 'Packing' | 'Handover' | 'Return',
  userId: string,
): Promise<{ id: string; state: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('operation_sessions')
    .select('id, state')
    .eq('booking_id', bookingId)
    .eq('operation', operation)
    .eq('state', 'In Progress')
    .maybeSingle()
  if (existingError) throw new Error(`Could not verify open ${operation} session: ${existingError.message}`)
  if (existing) return existing

  const { data: last, error: lastError } = await supabase
    .from('operation_sessions')
    .select('session_no')
    .eq('booking_id', bookingId)
    .order('session_no', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastError) throw new Error(`Could not verify ${operation} session history: ${lastError.message}`)
  const nextNo = (last?.session_no ?? 0) + 1

  // CHECK 0003:91 requires a real delivery_method for Handover sessions.
  let deliveryMethod: Database['public']['Enums']['delivery_method'] | null = null
  if (operation === 'Handover') {
    const { data: booking, error: bookingError } = await supabase
      .from('bookings').select('delivery_type').eq('id', bookingId).single()
    if (bookingError || !booking?.delivery_type) {
      throw new Error(`Could not verify the booking delivery method: ${bookingError?.message ?? 'missing value'}`)
    }
    deliveryMethod = booking.delivery_type
  }
  const newId = generateClientUuid()
  const { data: created, error } = await supabase
    .from('operation_sessions')
    .insert({
      id: newId,
      client_uuid: newId,
      booking_id: bookingId,
      operation,
      session_no: nextNo,
      delivery_method: deliveryMethod,
      state: 'In Progress',
      started_at: new Date().toISOString(),
      started_by: userId,
      warehouse_staff_id: userId,
      created_by: userId,
    })
    .select('id, state')
    .single()
  if (error || !created) {
    throw new Error(`Could not initialize ${operation} session for evidence: ${error?.message ?? 'unknown'}`)
  }
  return created
}

/**
 * Fail-closed upload of a session-anchored JPEG/PNG/WebP.
 * Returns only when BOTH the physical evidence_files row and its
 * evidence_references link have been confirmed by the backend.
 *
 * This is an online-only operation. A storage object by itself is NOT a
 * completed evidence record. Reuse clientUuid when retrying an unknown result.
 * Data left in storage by an ambiguous network failure requires reconciliation;
 * it is not safe for the browser to silently delete possibly committed proof.
 */
export async function uploadEvidencePhoto(
  options: UploadEvidencePhotoOptions,
): Promise<StoredEvidencePhotoResult> {
  assertStorageAvailable()
  const { file, reference } = options
  if (!(file instanceof Blob) || file.size === 0) throw new Error('Choose a non-empty image')
  const format = ACCEPTED_IMAGE_FORMATS[file.type]
  if (!format) throw new Error('Evidence photos must be JPEG, PNG, or WebP')
  if (!options.filename.trim()) throw new Error('Evidence filename is required')
  assertUuid(options.userId, 'User ID')
  assertUuid(reference.bookingId, 'Booking ID')
  if (reference.itemId) assertUuid(reference.itemId, 'Item ID')

  const stage = reference.operationStage
  const stagesNeedingSession: readonly SessionStage[] = ['Packing', 'Pickup', 'Delivery', 'Return', 'Inspection']
  const needsSession = stagesNeedingSession.includes(stage)

  let resolvedSessionId: string | null = reference.sessionId ?? null
  let sessionState: string | null = null

  if (needsSession) {
    const expectedOperation = stage === 'Packing'
      ? 'Packing'
      : stage === 'Return' || stage === 'Inspection'
        ? 'Return'
        : 'Handover'

    if (resolvedSessionId) {
      assertUuid(resolvedSessionId, 'Session ID')
      const { data: session, error: sessionError } = await supabase
        .from('operation_sessions')
        .select('id, booking_id, operation, state')
        .eq('id', resolvedSessionId)
        .single()
      if (sessionError || !session) throw new Error(`Could not verify the evidence session: ${sessionError?.message ?? 'not found'}`)
      if (session.booking_id !== reference.bookingId || session.operation !== expectedOperation) {
        throw new Error('Evidence session does not match the booking and operation')
      }
      sessionState = session.state
    } else {
      const ensured = await resolveOrCreateSession(reference.bookingId, expectedOperation, options.userId)
      resolvedSessionId = ensured.id
      sessionState = ensured.state
    }
  }

  const clientUuid = options.clientUuid ?? generateClientUuid()
  assertUuid(clientUuid, 'Evidence retry ID')

  const digest = await sha256(file)
  const { data: byKey, error: keyError } = await supabase
    .from('evidence_files').select('id, storage_path, content_hash')
    .eq('client_uuid', clientUuid).maybeSingle()
  if (keyError) throw new Error(`Could not verify evidence retry key: ${keyError.message}`)
  if (byKey && byKey.content_hash !== digest) {
    throw new Error('Evidence retry ID was already used for different image bytes')
  }
  const { data: byHash, error: hashError } = await supabase
    .from('evidence_files').select('id, storage_path, content_hash')
    .eq('content_hash', digest).maybeSingle()
  if (hashError) throw new Error(`Could not check evidence hash: ${hashError.message}`)
  if (byKey && byHash && byKey.id !== byHash.id) {
    throw new Error('Conflicting evidence records; manual reconciliation required')
  }

  let evidence: { id: string; storage_path: string } | null = byKey ?? byHash
  if (!evidence && sessionState === 'Completed') {
    throw new Error('Completed handover sessions are sealed; new evidence cannot be attached')
  }

  const storage = supabase.storage.from(EVIDENCE_STORAGE_BUCKET)
  if (!evidence) {
    const rawName = options.filename.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    const cleanName = rawName.replace(/\.(heic|heif)$/i, '.jpg')
    const sessionFolder = resolvedSessionId ?? 'direct'
    const storagePath = `${reference.bookingId}/${sessionFolder}/${clientUuid}_${cleanName}`
    const { data: uploaded, error: uploadError } = await storage.upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError || !uploaded || uploaded.path !== storagePath) {
      throw new Error(`Evidence image was not confirmed in private storage: ${uploadError?.message ?? 'invalid upload response'}`)
    }

    const { data: recorded, error: recordError } = await supabase
      .from('evidence_files')
      .insert({
        id: clientUuid,
        client_uuid: clientUuid,
        content_hash: digest,
        storage_path: storagePath,
        original_filename: options.filename,
        media_type: 'Image',
        format,
        size_bytes: file.size,
        category: options.category,
        created_by: options.userId,
      })
      .select('id, storage_path').single()
    if (recordError || !recorded) {
      throw new Error(`Evidence metadata was not confirmed; retry with the same ID: ${recordError?.message ?? 'empty response'}`)
    }
    evidence = recorded
  }

  let linkQuery = supabase
    .from('evidence_references').select('id, booking_id, item_id')
    .eq('evidence_file_id', evidence.id)
    .eq('operation_stage', reference.operationStage)
    .eq('booking_id', reference.bookingId)

  if (resolvedSessionId) {
    linkQuery = linkQuery.eq('session_id', resolvedSessionId)
  }
  if (reference.itemId) {
    linkQuery = linkQuery.eq('item_id', reference.itemId)
  }

  const { data: alreadyLinked, error: lookupError } = await linkQuery.maybeSingle()
  if (lookupError) throw new Error(`Could not verify evidence session link: ${lookupError.message}`)

  let referenceId = alreadyLinked?.id
  if (!referenceId) {
    if (sessionState === 'Completed') {
      throw new Error('The session was sealed before evidence could be linked')
    }
    const linkId = generateClientUuid()
    const { data: linked, error: linkError } = await supabase
      .from('evidence_references')
      .insert({
        id: linkId,
        client_uuid: linkId,
        evidence_file_id: evidence.id,
        operation_stage: reference.operationStage,
        session_id: resolvedSessionId,
        booking_id: reference.bookingId,
        item_id: reference.itemId ?? null,
        created_by: options.userId,
      })
      .select('id').single()
    if (linkError || !linked) {
      throw new Error(`Evidence session link was not confirmed; retry with the same ID: ${linkError?.message ?? 'empty response'}`)
    }
    referenceId = linked.id
  }

  let signedUrl: string | null = null
  try {
    const { data, error } = await storage.createSignedUrl(evidence.storage_path, 60 * 60)
    if (!error && data?.signedUrl) signedUrl = data.signedUrl
  } catch {
    // Re-request later via getEvidenceSignedUrl().
  }

  return {
    id: evidence.id,
    referenceId,
    storagePath: evidence.storage_path,
    signedUrl,
    filename: options.filename,
    fileSizeBytes: file.size,
    contentHash: digest,
  }
}

export async function getEvidenceSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  assertStorageAvailable()
  if (!storagePath.trim() || expiresInSeconds < 1) return null
  const { data, error } = await supabase.storage.from(EVIDENCE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  return !error ? data?.signedUrl ?? null : null
}
