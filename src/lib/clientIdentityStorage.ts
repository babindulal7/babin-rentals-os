import { supabase } from './supabase'
import { generateClientUuid } from './dataAccess'

// RULING 2026-10-26 W50/W51 (T2-12): ID photos have a separate private store.
export const CLIENT_IDENTITY_BUCKET = 'client-identities'
const IMAGE_FORMATS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function requireOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Connect to the internet to save an ID photo. Nothing has been recorded.')
  }
}

function requireUuid(value: string): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new Error('ID photos need a valid client, signed-in user and retry ID.')
  }
}

/** Online only; the same retry key must be reused for the same image bytes. */
export async function uploadClientIdentityPhoto(input: {
  file: Blob
  clientId: string
  userId: string
  clientUuid?: string | undefined
}): Promise<{ id: string }> {
  requireOnline()
  const id = input.clientUuid ?? generateClientUuid()
  ;[id, input.clientId, input.userId].forEach(requireUuid)
  const extension = IMAGE_FORMATS[input.file.type]
  if (!extension || input.file.size === 0 || input.file.size > MAX_IMAGE_BYTES) {
    throw new Error('Choose a JPEG, PNG or WebP photo smaller than 10 MB.')
  }
  const digest = await crypto.subtle.digest('SHA-256', await input.file.arrayBuffer())
  const contentHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  const path = `${input.clientId}/${input.userId}/${id}.${extension}`
  const { data, error } = await supabase.storage.from(CLIENT_IDENTITY_BUCKET).upload(path, input.file, {
    contentType: input.file.type, upsert: false,
  })
  // Storage can have committed before a lost response. Registration checks the
  // original key, owner, hash and path; a duplicate must never cause an upsert.
  if (error && String(error.statusCode) !== '409' && error.status !== 409) {
    throw new Error(`ID photo upload failed: ${error.message}`)
  }
  if (!error && data?.path !== path) throw new Error('ID photo upload was not confirmed. Retry saving.')
  const registered = await supabase.rpc('register_client_identity_file', {
    p_input: {
      id, client_uuid: id, client_id: input.clientId, storage_path: path,
      content_hash: contentHash, content_type: input.file.type, size_bytes: input.file.size,
    },
  })
  if (registered.error || registered.data !== id) {
    throw new Error('ID photo could not be registered. Retry saving with this photo.')
  }
  return { id }
}

/** Database and Storage both restrict this to scoped Manager+ or the owning client. */
export async function fetchClientIdentityPhotoUrl(fileId: string): Promise<string> {
  requireOnline()
  requireUuid(fileId)
  const { data, error } = await supabase.from('client_identity_files')
    .select('storage_path').eq('id', fileId).maybeSingle()
  if (error || !data || typeof data.storage_path !== 'string') {
    throw new Error('This ID photo is unavailable for your account.')
  }
  const signed = await supabase.storage.from(CLIENT_IDENTITY_BUCKET).createSignedUrl(data.storage_path, 60)
  if (signed.error || !signed.data?.signedUrl) throw new Error('ID photo could not be opened. Try again.')
  return signed.data.signedUrl
}
