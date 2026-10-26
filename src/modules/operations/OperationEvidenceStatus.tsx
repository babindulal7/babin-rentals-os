import { useRef, useState, useId } from 'react'
import { Button } from '../../components/ui/Page'
import Icon from '../../components/ui/Icon'
import { useAuth } from '../../lib/auth'
import { compressEvidencePhoto } from '../../lib/imageCompression'
import { uploadEvidencePhoto, type SessionStage } from '../../lib/evidenceStorage'
import { generateClientUuid } from '../../lib/dataAccess'
import type { useOperationEvidence } from './useOperationEvidence'
import type { Database } from '../../types/supabase'

type EvidenceCategory = Database['public']['Enums']['evidence_category']

export interface OperationEvidenceStatusProps {
  status: ReturnType<typeof useOperationEvidence>
  id?: string
  bookingId?: string | null
  stage?: SessionStage
  itemId?: string | null
  category?: EvidenceCategory
  sessionId?: string | null
  onPhotoUploaded?: () => void
}

export function OperationEvidenceStatus({
  status,
  id,
  bookingId,
  stage = 'Packing',
  itemId,
  category = 'Inspection',
  sessionId,
  onPhotoUploaded,
}: OperationEvidenceStatusProps) {
  const inputId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { user } = useAuth()

  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [retryPayload, setRetryPayload] = useState<{
    file: Blob
    filename: string
    clientUuid: string
  } | null>(null)

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!bookingId) {
      setUploadError('Booking ID is missing. Cannot attach evidence.')
      return
    }

    const userId = user?.id
    if (!userId) {
      setUploadError('You must be signed in to upload evidence.')
      return
    }

    setIsUploading(true)
    setUploadError(null)
    setUploadProgress('Compressing photo on device…')

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('You are offline. This photo was not saved — take it again when you are back online.')
      }

      // Device compression: 1600px max edge, JPEG 0.8, EXIF location stripped
      const compressed = await compressEvidencePhoto(file)
      const clientUuid = generateClientUuid()
      const cleanFileName = `photo_${stage.toLowerCase()}_${Date.now()}.jpg`

      setRetryPayload({ file: compressed.blob, filename: cleanFileName, clientUuid })
      setUploadProgress('Uploading to private storage and recording evidence…')

      await uploadEvidencePhoto({
        file: compressed.blob,
        filename: cleanFileName,
        category,
        reference: {
          bookingId,
          operationStage: stage,
          sessionId: sessionId || undefined,
          itemId: itemId || undefined,
        },
        userId,
        clientUuid,
      })

      setUploadProgress(null)
      setRetryPayload(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      status.refresh()
      onPhotoUploaded?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadError(msg)
      setUploadProgress(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleRetry = async () => {
    if (!retryPayload || !bookingId) return
    const userId = user?.id
    if (!userId) {
      setUploadError('You must be signed in to retry evidence upload.')
      return
    }

    setIsUploading(true)
    setUploadError(null)
    setUploadProgress('Retrying photo upload with same idempotency key…')

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('You are offline. The photo is not saved yet — tap Retry upload when you are back online.')
      }

      await uploadEvidencePhoto({
        file: retryPayload.file,
        filename: retryPayload.filename,
        category,
        reference: {
          bookingId,
          operationStage: stage,
          sessionId: sessionId || undefined,
          itemId: itemId || undefined,
        },
        userId,
        clientUuid: retryPayload.clientUuid,
      })

      setUploadProgress(null)
      setRetryPayload(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      status.refresh()
      onPhotoUploaded?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadError(msg)
      setUploadProgress(null)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div {...(id ? { id } : {})} style={{ marginTop: '8px' }}>
      <p
        role={status.error || uploadError ? 'alert' : 'status'}
        style={{
          margin: '6px 0',
          fontSize: 'var(--t-meta)',
          color: (status.error || uploadError) ? 'var(--danger-text)' : 'var(--muted)',
        }}
      >
        {status.error ?? uploadError ?? uploadProgress ?? (
          status.evidence
            ? `${status.evidence.files} saved booking photo(s).`
            : 'Verifying saved booking evidence…'
        )}
      </p>

      {isOffline && (
        <div
          role="alert"
          style={{
            padding: '6px 10px',
            marginBottom: '8px',
            borderRadius: 'var(--r-sm, 6px)',
            background: 'var(--warn-soft, rgba(234, 179, 8, 0.1))',
            color: 'var(--warn-text, #a16207)',
            fontSize: 'var(--t-caption, 12px)',
          }}
        >
          You are offline. Photos need a connection to save.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          disabled={isUploading}
          onClick={status.refresh}
          style={{
            minHeight: 'var(--tap, 44px)',
            padding: '0 10px',
            fontSize: 'var(--t-meta)',
          }}
        >
          Refresh saved evidence
        </Button>

        {bookingId && (
          <>
            <input
              id={inputId}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={isUploading}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              aria-label={`Take or select ${stage} evidence photo`}
            />
            <Button
              variant="secondary"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: 'var(--tap, 44px)',
                padding: '0 12px',
                fontSize: 'var(--t-meta)',
              }}
            >
              <Icon name="camera" size={15} />
              <span>{isUploading ? (uploadProgress ?? 'Processing…') : 'Take / Upload Photo'}</span>
            </Button>
          </>
        )}

        {retryPayload && !isUploading && (
          <Button
            variant="secondary"
            onClick={handleRetry}
            style={{
              minHeight: 'var(--tap, 44px)',
              padding: '0 12px',
              fontSize: 'var(--t-meta)',
              color: 'var(--danger-text)',
            }}
          >
            Retry upload
          </Button>
        )}
      </div>
    </div>
  )
}
