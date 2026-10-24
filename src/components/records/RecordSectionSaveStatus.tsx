import React, { useState, useCallback, useMemo, useRef } from 'react'
import Icon from '../ui/Icon'
import { Button } from '../ui/Page'
import { saveRecordSection } from '../../actions/recordEditor'
import { newClientUuid } from '../../lib/supabase'
import { useToast } from '../ui/Toast'
import type { RecordKind, RecordSnapshot, RecordValues, RecordSectionChange } from '../../lib/recordEditor'
import { useNetwork } from '../../lib/network'
import type { Role } from '../../lib/rbac'

export type SectionStatusKey =
  | 'untouched'
  | 'dirty'
  | 'invalid'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'offline'
  | 'error'
  | 'readonly'

export interface SectionSaveStatusBadgeProps {
  status: SectionStatusKey
  savedAtTime?: string | null | undefined
  errorCount?: number | undefined
  errorMessage?: string | null | undefined
  compact?: boolean | undefined
}

export function SectionSaveStatusBadge({
  status,
  savedAtTime,
  errorCount = 0,
  errorMessage,
  compact = false,
}: SectionSaveStatusBadgeProps) {
  let iconName: 'check' | 'alert_circle' | 'alert_triangle' | 'refresh' | 'clock' | 'x' | 'lock' = 'clock'
  let label = 'Not started'
  let badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: compact ? '2px 8px' : '4px 10px',
    borderRadius: 'var(--r-badge, 999px)',
    fontSize: 'var(--t-th, 12px)',
    fontWeight: 600,
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    color: 'var(--muted)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  }

  switch (status) {
    case 'saved':
      iconName = 'check'
      label = savedAtTime ? `Saved at ${savedAtTime}` : 'Saved'
      badgeStyle = {
        ...badgeStyle,
        background: 'color-mix(in srgb, var(--success, #10b981) 15%, var(--card))',
        color: 'var(--success-text, #10b981)',
        borderColor: 'color-mix(in srgb, var(--success, #10b981) 30%, transparent)',
      }
      break
    case 'dirty':
      iconName = 'alert_circle'
      label = 'Unsaved changes'
      badgeStyle = {
        ...badgeStyle,
        background: 'color-mix(in srgb, var(--warn, #f59e0b) 15%, var(--card))',
        color: 'var(--warn-text, #b45309)',
        borderColor: 'color-mix(in srgb, var(--warn, #f59e0b) 30%, transparent)',
      }
      break
    case 'saving':
      iconName = 'refresh'
      label = 'Saving…'
      badgeStyle = {
        ...badgeStyle,
        background: 'color-mix(in srgb, var(--btn-primary-bg, #3b82f6) 15%, var(--card))',
        color: 'var(--primary-text, #2563eb)',
        borderColor: 'color-mix(in srgb, var(--btn-primary-bg, #3b82f6) 30%, transparent)',
      }
      break
    case 'invalid':
      iconName = 'x'
      label = errorCount > 0 ? `Fix ${errorCount} ${errorCount === 1 ? 'field' : 'fields'}` : 'Incomplete'
      badgeStyle = {
        ...badgeStyle,
        background: 'color-mix(in srgb, var(--danger, #ef4444) 15%, var(--card))',
        color: 'var(--danger-text, #ef4444)',
        borderColor: 'color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)',
      }
      break
    case 'conflict':
      iconName = 'alert_triangle'
      label = 'Changed elsewhere'
      badgeStyle = {
        ...badgeStyle,
        background: 'color-mix(in srgb, var(--danger, #ef4444) 20%, var(--card))',
        color: 'var(--danger-text, #ef4444)',
        borderColor: 'var(--danger)',
      }
      break
    case 'offline':
      iconName = 'alert_circle'
      label = 'Not saved — offline'
      badgeStyle = {
        ...badgeStyle,
        background: 'var(--card2)',
        color: 'var(--muted)',
        borderColor: 'var(--border)',
      }
      break
    case 'error':
      iconName = 'alert_circle'
      label = errorMessage ? `Error: ${errorMessage}` : 'Not saved — retry'
      badgeStyle = {
        ...badgeStyle,
        background: 'color-mix(in srgb, var(--danger, #ef4444) 15%, var(--card))',
        color: 'var(--danger-text, #ef4444)',
        borderColor: 'var(--danger)',
      }
      break
    case 'readonly':
      iconName = 'lock'
      label = 'Read-only'
      badgeStyle = {
        ...badgeStyle,
        background: 'var(--card2)',
        color: 'var(--muted)',
      }
      break
    case 'untouched':
    default:
      iconName = 'clock'
      label = 'Not started'
      break
  }

  return (
    <span style={badgeStyle} role="status" aria-label={`Section status: ${label}`}>
      <Icon name={iconName} size={13} style={{ flexShrink: 0 }} />
      <span>{label}</span>
    </span>
  )
}

export interface SectionSaveBarProps {
  sectionName: string
  status: SectionStatusKey
  isSaving: boolean
  canSave: boolean
  saveDisabledReason?: string | null | undefined
  onSave: () => void
  onNext?: (() => void) | undefined
  nextLabel?: string | undefined
  errorMessage?: string | null | undefined
}

export function SectionSaveBar({
  sectionName,
  status,
  isSaving,
  canSave,
  saveDisabledReason,
  onSave,
  onNext,
  nextLabel,
  errorMessage,
}: SectionSaveBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 'var(--sp-md, 16px)',
        paddingTop: 'var(--sp-sm, 12px)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!canSave || isSaving}
          onClick={onSave}
          style={{ minHeight: 44, padding: '0 16px' }}
        >
          {isSaving ? 'Saving section…' : `Save ${sectionName}`}
        </Button>

        {saveDisabledReason ? (
          <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)' }}>
            {saveDisabledReason}
          </span>
        ) : errorMessage ? (
          <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--danger-text)' }} role="alert">
            {errorMessage}
          </span>
        ) : status === 'saved' ? (
          <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--success-text)' }}>
            Section is synchronized with server
          </span>
        ) : status === 'dirty' ? (
          <span style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--warn-text)' }}>
            Unsaved changes in this section
          </span>
        ) : null}
      </div>

      {onNext && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onNext}
          style={{ minHeight: 44, padding: '0 16px' }}
        >
          {nextLabel ? `Next: ${nextLabel} →` : 'Next →'}
        </Button>
      )}
    </div>
  )
}

export interface UseSectionSaveManagerOptions {
  kind: RecordKind
  recordId: string | null | undefined
  snapshot: RecordSnapshot | null
  onSnapshotUpdated: (snapshot: RecordSnapshot, change: RecordSectionChange) => void
  onCreateInitialRecord?: ((sectionKey: string, payload: RecordValues, rows?: RecordValues[]) => Promise<RecordSnapshot>) | undefined
  userId: string | undefined
  userRole: Role | undefined
  isBusy?: boolean | undefined
}

export function useSectionSaveManager({
  kind,
  recordId,
  snapshot,
  onSnapshotUpdated,
  onCreateInitialRecord,
  userId,
  userRole,
  isBusy = false,
}: UseSectionSaveManagerOptions) {
  const online = useNetwork()
  const { showSuccessToast } = useToast()
  const [savedSections, setSavedSections] = useState<Record<string, { savedAt: string; revision: string }>>({})
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({})
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [sectionErrors, setSectionErrors] = useState<Record<string, string | null>>({})
  const inFlight = useRef(false)
  const currentSnapshot = useRef(snapshot)
  currentSnapshot.current = snapshot
  const attempts = useRef(new Map<string, { fingerprint: string; key: string; revision: string }>())

  const markSectionDirty = useCallback((sectionKey: string) => {
    setDirtySections((prev) => (prev[sectionKey] ? prev : { ...prev, [sectionKey]: true }))
    setSectionErrors((prev) => (prev[sectionKey] ? { ...prev, [sectionKey]: null } : prev))
  }, [])

  const markSectionClean = useCallback((sectionKey: string, revision: string) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setSavedSections((prev) => ({ ...prev, [sectionKey]: { savedAt: timeStr, revision } }))
    setDirtySections((prev) => ({ ...prev, [sectionKey]: false }))
    setSectionErrors((prev) => ({ ...prev, [sectionKey]: null }))
  }, [])

  const saveSection = useCallback(
    async (
      sectionKey: string,
      sectionFieldsPayload: RecordValues,
      sectionRowsPayload?: RecordValues[]
    ) => {
      if (inFlight.current || isBusy) throw new Error('Wait for the current save to finish. Your changes are still here.')
      if (!userId || !userRole) {
        throw new Error('Please sign in to save this section.')
      }
      if (!online) {
        setSectionErrors((prev) => ({ ...prev, [sectionKey]: 'Offline — cannot save to server.' }))
        throw new Error('Offline — connect to save this section.')
      }

      if (!recordId || !snapshot) {
        if (onCreateInitialRecord) {
          setSavingSection(sectionKey)
          setSectionErrors((prev) => ({ ...prev, [sectionKey]: null }))
          try {
            const created = await onCreateInitialRecord(sectionKey, sectionFieldsPayload, sectionRowsPayload)
            onSnapshotUpdated(created, { section: sectionKey, fields: sectionFieldsPayload, rows: sectionRowsPayload })
            markSectionClean(sectionKey, created.revision)
            showSuccessToast('Record created & section saved', `${sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1)} synchronized`)
            return created
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            setSectionErrors((prev) => ({ ...prev, [sectionKey]: msg }))
            throw err
          } finally {
            setSavingSection(null)
          }
        }
        throw new Error('Save the record identity first to enable cloud section saving.')
      }

      inFlight.current = true
      setSavingSection(sectionKey)
      setSectionErrors((prev) => ({ ...prev, [sectionKey]: null }))

      try {
        const latest = currentSnapshot.current ?? snapshot
        const fingerprint = JSON.stringify({ kind, recordId, fields: sectionFieldsPayload, rows: sectionRowsPayload ?? [] })
        let attempt = attempts.current.get(sectionKey)
        if (!attempt || attempt.fingerprint !== fingerprint) {
          attempt = { fingerprint, key: newClientUuid(), revision: latest.revision }
          attempts.current.set(sectionKey, attempt)
        }
        const result = await saveRecordSection(
          {
            kind,
            id: recordId,
            section: sectionKey,
            expectedRevision: attempt.revision,
            clientUuid: attempt.key,
            values: sectionFieldsPayload,
            rows: sectionRowsPayload,
          },
          { userId, role: userRole, isOnline: online }
        )

        currentSnapshot.current = result
        onSnapshotUpdated(result, { section: sectionKey, fields: sectionFieldsPayload, rows: sectionRowsPayload })
        attempts.current.delete(sectionKey)
        markSectionClean(sectionKey, result.revision)
        showSuccessToast('Section saved', `${sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1)} updated`)
        return result
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setSectionErrors((prev) => ({ ...prev, [sectionKey]: msg }))
        throw err
      } finally {
        inFlight.current = false
        setSavingSection(null)
      }
    },
    [kind, recordId, snapshot, userId, userRole, online, isBusy, markSectionClean, onSnapshotUpdated, onCreateInitialRecord, showSuccessToast]
  )

  const getSectionStatus = useCallback(
    (
      sectionKey: string,
      hasValidationErrors: boolean,
      isReadOnly = false
    ): SectionStatusKey => {
      if (isReadOnly) return 'readonly'
      if (savingSection === sectionKey) return 'saving'
      if (sectionErrors[sectionKey]) {
        if (sectionErrors[sectionKey]?.includes('changed since you opened it') || sectionErrors[sectionKey]?.includes('40001')) {
          return 'conflict'
        }
        return 'error'
      }
      if (!online && dirtySections[sectionKey]) return 'offline'
      if (hasValidationErrors) return 'invalid'
      if (dirtySections[sectionKey]) return 'dirty'
      if (savedSections[sectionKey]) return 'saved'
      if (recordId) return 'saved'
      return 'untouched'
    },
    [savingSection, sectionErrors, online, dirtySections, savedSections, recordId]
  )

  const savedCount = useMemo(() => {
    return Object.values(savedSections).length
  }, [savedSections])

  return {
    savedSections,
    dirtySections,
    savingSection,
    sectionErrors,
    markSectionDirty,
    markSectionClean,
    saveSection,
    getSectionStatus,
    savedCount,
    isSaving: () => inFlight.current,
  }
}
