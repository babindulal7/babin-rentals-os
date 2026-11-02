import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import Icon from '../ui/Icon'
import { useAuth } from '../../lib/auth'
import { useViewport, useCapability } from '../../lib/device'
import { APP_VERSION } from '../../data/nav'
import { createProblemReport, type CreateProblemReportInput } from '../../actions/problemReports/createProblemReport'
import { captureError } from '../../lib/monitoring'
import { newClientUuid } from '../../lib/supabase'
import { supabase } from '../../lib/supabase'
import './shell.css'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

interface ProblemReportModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ProblemReportModal({ isOpen, onClose }: ProblemReportModalProps) {
  const { user } = useAuth()
  const viewport = useViewport()
  const capability = useCapability()
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-generate client_uuid for idempotency
  const clientUuid = useRef(newClientUuid())

  // Focus textarea on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handlePhotoSelect = useCallback((file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMessage('Only JPEG, PNG, WebP, HEIC/HEIF images are allowed')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('Photo must be smaller than 5 MB')
      return
    }
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setErrorMessage(null)
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handlePhotoSelect(file)
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [handlePhotoSelect])

  const removePhoto = useCallback(() => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(null)
    setPhotoPreview(null)
  }, [photoPreview])

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) {
      setErrorMessage('Please describe the problem')
      return
    }

    setSubmitting(true)
    setErrorMessage(null)
    setSubmitStatus('idle')

    try {
      // Upload photo first if present
      let photoPath: string | undefined
      if (photo && user) {
        const ext = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
        const fileName = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('problem-reports')
          .upload(fileName, photo, { upsert: false })

        if (uploadError) {
          throw new Error(`Failed to upload photo: ${uploadError.message}`)
        }
        photoPath = fileName
      }

      // Submit problem report
      const input: CreateProblemReportInput = {
        description: description.trim(),
        clientUuid: clientUuid.current,
        photoPath,
        routePath: typeof window !== 'undefined' ? window.location.pathname : undefined,
        appVersion: APP_VERSION,
        userRole: user?.role,
        deviceCategory: viewport,
        viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
        viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
        errorReference: typeof window !== 'undefined' ? (window as any).__LAST_ERROR_REF__ : undefined,
      }

      const { reportId: _reportId } = await createProblemReport(input, {
        userId: user!.id,
        role: user!.role,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      })

      setSubmitStatus('success')

      // Clear form
      setDescription('')
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhoto(null)
      setPhotoPreview(null)
      clientUuid.current = newClientUuid()

      // Auto-close after showing success
      setTimeout(() => {
        onClose()
        setSubmitStatus('idle')
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit problem report'
      setErrorMessage(message)
      setSubmitStatus('error')
      captureError(err, { where: 'ProblemReportModal.submit' })
    } finally {
      setSubmitting(false)
    }
  }, [description, photo, photoPreview, user, viewport, onClose])

  const handleRetry = useCallback(() => {
    setSubmitStatus('idle')
    setErrorMessage(null)
    handleSubmit()
  }, [handleSubmit])

  // Clean up photo preview on unmount
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  const deviceLabel = viewport === 'phone' ? 'Phone' : viewport === 'tablet' ? 'Tablet' : 'Desktop'
  const pointerLabel = capability.coarsePointer ? 'Touch' : 'Mouse'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Report a Problem"
      subtitle="Describe what went wrong. We'll attach the current screen, version, and device info automatically."
      size="md"
      sheet={viewport !== 'desktop'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
          <label style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>
            What happened?
          </label>
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setErrorMessage(null)
            }}
            placeholder="Describe the problem in your own words…"
            rows={5}
            maxLength={10000}
            aria-describedby={errorMessage ? 'problem-report-error' : 'problem-report-hint'}
            disabled={submitting}
            style={{
              minHeight: 120,
              padding: 'var(--sp-sm)',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: 'var(--t-body)',
              fontFamily: 'inherit',
              resize: 'vertical',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <div id="problem-report-hint" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {description.length}/10,000 characters
          </div>
          {errorMessage && (
            <div id="problem-report-error" role="alert" style={{ fontSize: 'var(--t-meta)', color: 'var(--danger)' }}>
              {errorMessage}
            </div>
          )}
        </div>

        {/* Photo attachment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
          <label style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>
            Add a photo (optional)
          </label>
          {photoPreview && photo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)', background: 'var(--card2)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
              <img
                src={photoPreview}
                alt="Attached screenshot"
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--r-sm)', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-sm)', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {photo.name}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {(photo.size / 1024).toFixed(1)} KB · {photo.type}
                </div>
              </div>
              <Button
                variant="ghost"
                icon="trash"
                size="sm"
                onClick={removePhoto}
                aria-label="Remove photo"
                disabled={submitting}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--sp-sm)',
                padding: 'var(--sp-md)',
                border: '2px dashed var(--border)',
                borderRadius: 'var(--r-md)',
                background: 'var(--card2)',
                color: 'var(--text2)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 'var(--t-ui)',
                fontWeight: 500,
                transition: 'border-color var(--dur-fast), background-color var(--dur-fast)',
                minHeight: 100,
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (!submitting) e.currentTarget.style.borderColor = 'var(--primary)'
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (!submitting) e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
                disabled={submitting}
              />
              <Icon name="upload" size={20} />
              <span>Click or drag to add a screenshot or photo</span>
            </button>
          )}
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            JPEG, PNG, WebP, HEIC/HEIF · Max 5 MB
          </div>
        </div>

        {/* Auto-attached context (read-only display) */}
        <details style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-sm)', background: 'var(--card2)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
            <Icon name="info" size={14} />
            Auto-attached context (not editable)
          </summary>
          <div style={{ marginTop: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.8 }}>
            <div><strong>Route:</strong> {window.location.pathname}</div>
            <div><strong>App version:</strong> {APP_VERSION}</div>
            <div><strong>Your role:</strong> {user?.role}</div>
            <div><strong>Device:</strong> {deviceLabel} ({pointerLabel})</div>
            <div><strong>Viewport:</strong> {typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '—'}</div>
            <div><strong>Error ref:</strong> {(typeof window !== 'undefined' && (window as any).__LAST_ERROR_REF__) || 'None'}</div>
            <div><strong>Submitted by:</strong> {user?.name} ({user?.id?.slice(0, 8)}…)</div>
          </div>
        </details>

        {/* Status feedback */}
        {submitStatus === 'success' && (
          <div role="status" style={{ padding: 'var(--sp-sm)', background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 'var(--r-md)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
            <Icon name="check" size={20} />
            <span>Problem report sent — thank you!</span>
          </div>
        )}
        {submitStatus === 'error' && (
          <div role="alert" style={{ padding: 'var(--sp-sm)', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', color: 'var(--danger-text)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <Icon name="alert_circle" size={20} />
              <span>{errorMessage}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleRetry} disabled={submitting}>
              <Icon name="refresh" size={14} />
              Retry
            </Button>
          </div>
        )}

        {/* Submitting indicator */}
        {submitting && (
          <div role="status" style={{ padding: 'var(--sp-sm)', background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 'var(--r-md)', color: 'var(--primary-text)', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
            <Icon name="refresh" size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Sending…</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Modal>
  )
}